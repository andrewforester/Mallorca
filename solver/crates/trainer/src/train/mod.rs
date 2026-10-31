pub mod calibrate;
pub mod checkpoints;
pub mod tables;
mod worker;

use crate::schedule::Schedule;
use crate::tree::load_preset;
use checkpoints::{checkpoint_path, resume, Progress};
use clap::Args;
use mallorca_core::cfr::Storage;
use mallorca_core::fingerprint::fingerprint;
use mallorca_core::holdem::Holdem;
use mallorca_core::rng::Rng;
use mallorca_core::tree::Tree;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tables::{load_abstraction, memory_estimate};
use worker::{work, worker_seed, Finished, Shared, PAUSE_POLL};

const POLL: Duration = Duration::from_millis(50);

#[derive(Args)]
pub struct TrainArgs {
    #[arg(long)]
    pub preset: PathBuf,
    #[arg(long)]
    pub data: PathBuf,
    #[arg(long, conflicts_with = "iterations")]
    pub minutes: Option<u64>,
    #[arg(long)]
    pub iterations: Option<u64>,
    #[arg(long, default_value_t = 0)]
    pub seed: u64,
    #[arg(long)]
    pub threads: Option<usize>,
}

pub struct Session {
    pub preset: PathBuf,
    pub tables: PathBuf,
    pub checkpoints: PathBuf,
    pub minutes: Option<u64>,
    pub iterations: Option<u64>,
    pub seed: u64,
    pub threads: Option<usize>,
}

pub struct Outcome {
    pub iterations: u64,
    pub trained: u64,
    pub seconds: f64,
    pub checkpoint: PathBuf,
}

pub fn train(
    session: &Session,
    clock: &(dyn Fn() -> Duration + Sync),
    stop: &AtomicBool,
) -> Result<Outcome, String> {
    let preset = load_preset(&session.preset)?;
    let threads = session.threads.unwrap_or(preset.threads);
    if threads == 0 {
        return Err("threads must be positive".to_string());
    }
    let tree = Tree::build(&preset);
    let slots = tree.action_slot_count();
    let estimate = memory_estimate(&tree, &session.tables)?;
    let limit = preset.memory_limit_gb * 1e9;
    println!(
        "preset {}: {} infosets, {slots} action slots, memory estimate {estimate} bytes ({:.3} GB)",
        preset.name,
        tree.infoset_count(),
        estimate as f64 / 1e9
    );
    if estimate as f64 > limit {
        return Err(format!(
            "memory estimate {:.3} GB exceeds memory_limit_gb {}",
            estimate as f64 / 1e9,
            preset.memory_limit_gb
        ));
    }
    let abstraction = load_abstraction(&preset, &session.tables)?;
    let fp = fingerprint(&preset, &tree, &abstraction);
    let game = Holdem::new(&tree, &abstraction);
    std::fs::create_dir_all(&session.checkpoints)
        .map_err(|e| format!("cannot create {}: {e}", session.checkpoints.display()))?;
    let resumed = resume(&session.checkpoints, &fp, slots)?;
    let (storage, start, start_elapsed, next) = match resumed {
        Some(r) => {
            println!(
                "resuming from {}: {} iterations",
                checkpoint_path(&session.checkpoints, r.checkpoint).display(),
                r.iterations
            );
            (r.storage, r.iterations, r.elapsed_seconds, r.checkpoint + 1)
        }
        None => (Storage::new(slots), 0, 0, 1),
    };
    let mut progress = Progress {
        dir: &session.checkpoints,
        fingerprint: fp,
        start_iterations: start,
        start_elapsed,
        next,
    };
    let end = session
        .iterations
        .map_or(u64::MAX, |n| start.saturating_add(n));
    let schedule = Schedule::new(start, end, preset.cfr.discount_interval);
    let halt = AtomicBool::new(false);
    let pause = AtomicBool::new(false);
    let idle = AtomicUsize::new(0);
    let finished = AtomicUsize::new(0);
    let deadline = session.minutes.map(|m| Duration::from_secs(m * 60));
    let interval = Duration::from_secs(preset.checkpoint_minutes * 60);
    let shared = Shared {
        game: &game,
        storage: &storage,
        cfr: &preset.cfr,
        schedule: &schedule,
        halt: &halt,
        pause: &pause,
        idle: &idle,
    };
    println!("training with {threads} threads");
    let began = clock();
    let since = || clock().saturating_sub(began);
    let all_done = || finished.load(Ordering::Acquire) >= threads;
    let quiescent = || idle.load(Ordering::Acquire) + finished.load(Ordering::Acquire) >= threads;
    let run: Result<(), String> = std::thread::scope(|scope| {
        for w in 0..threads {
            let shared = &shared;
            let guard = Finished {
                count: &finished,
                halt: &halt,
            };
            let seed = worker_seed(session.seed, w as u64, start);
            scope.spawn(move || {
                let _guard = guard;
                work(shared, &mut Rng::new(seed));
            });
        }
        let mut last = Duration::ZERO;
        while !all_done() {
            let elapsed = since();
            if stop.load(Ordering::Relaxed) || deadline.is_some_and(|d| elapsed >= d) {
                break;
            }
            if elapsed.saturating_sub(last) >= interval {
                pause.store(true, Ordering::Release);
                while !quiescent() {
                    std::thread::sleep(PAUSE_POLL);
                }
                let saved = if halt.load(Ordering::Relaxed) {
                    Ok(())
                } else {
                    progress
                        .checkpoint(&storage, schedule.completed(), elapsed)
                        .map(|_| ())
                };
                pause.store(false, Ordering::Release);
                if let Err(e) = saved {
                    halt.store(true, Ordering::Relaxed);
                    return Err(e);
                }
                last = since();
            }
            std::thread::sleep(POLL);
        }
        halt.store(true, Ordering::Relaxed);
        Ok(())
    });
    run?;
    let trained_for = since();
    let iterations = schedule.completed();
    let path = progress.checkpoint(&storage, iterations, trained_for)?;
    Ok(Outcome {
        iterations,
        trained: iterations - start,
        seconds: trained_for.as_secs_f64(),
        checkpoint: path,
    })
}

pub fn wall_clock() -> impl Fn() -> Duration + Sync {
    let start = Instant::now();
    move || start.elapsed()
}

pub fn run(args: &TrainArgs, stop: &AtomicBool) -> Result<(), String> {
    let session = Session {
        preset: args.preset.clone(),
        tables: args.data.clone(),
        checkpoints: args.data.join("checkpoints"),
        minutes: args.minutes,
        iterations: args.iterations,
        seed: args.seed,
        threads: args.threads,
    };
    let outcome = train(&session, &wall_clock(), stop)?;
    println!(
        "trained {} iterations in {:.1}s, total {}, last checkpoint {}",
        outcome.trained,
        outcome.seconds,
        outcome.iterations,
        outcome.checkpoint.display()
    );
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::tables::TABLES;
    use super::*;
    use mallorca_core::abstraction::{encode_table, TABLE_HEADER_LEN};
    use mallorca_core::checkpoint::{write_checkpoint, CheckpointHeader, FORMAT_VERSION};
    use mallorca_core::preset::Preset;
    use mallorca_core::tree::Street;
    use std::path::Path;
    use std::sync::atomic::AtomicU64;
    use std::sync::OnceLock;

    const TINY: &str = include_str!("../../../../presets/tiny.toml");
    const SIZES: [usize; 3] = [1_286_792, 13_960_050, 123_156_254];

    fn scratch_root() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/tmp")
    }

    fn synthetic_tables() -> &'static Path {
        static DIR: OnceLock<PathBuf> = OnceLock::new();
        DIR.get_or_init(|| {
            let dir = scratch_root().join("trainer-tables");
            std::fs::create_dir_all(&dir).unwrap();
            for ((name, street), size) in TABLES.into_iter().zip(SIZES) {
                let path = dir.join(name);
                let expected = (TABLE_HEADER_LEN + size) as u64;
                if std::fs::metadata(&path).is_ok_and(|m| m.len() == expected) {
                    continue;
                }
                let table: Vec<u8> = (0..size).map(|i| (i % 8) as u8).collect();
                let tmp = dir.join(format!("{name}.tmp"));
                std::fs::write(&tmp, encode_table(street, 8, &table)).unwrap();
                std::fs::rename(tmp, path).unwrap();
            }
            dir
        })
    }

    pub fn data_dir(name: &str) -> PathBuf {
        let dir = scratch_root().join(format!("trainer-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for (table, _) in TABLES {
            std::fs::hard_link(synthetic_tables().join(table), dir.join(table)).unwrap();
        }
        std::fs::write(dir.join("tiny.toml"), TINY).unwrap();
        dir
    }

    pub fn session(
        dir: &Path,
        iterations: Option<u64>,
        seed: u64,
        threads: Option<usize>,
    ) -> Session {
        Session {
            preset: dir.join("tiny.toml"),
            tables: dir.to_path_buf(),
            checkpoints: dir.join("checkpoints"),
            minutes: None,
            iterations,
            seed,
            threads,
        }
    }

    fn frozen() -> Duration {
        Duration::ZERO
    }

    pub fn go(s: &Session) -> Result<Outcome, String> {
        train(s, &frozen, &AtomicBool::new(false))
    }

    fn header(path: &Path) -> CheckpointHeader {
        let bytes = std::fs::read(path).unwrap();
        CheckpointHeader {
            format_version: u16::from_le_bytes(bytes[4..6].try_into().unwrap()),
            fingerprint: bytes[6..38].try_into().unwrap(),
            iterations: u64::from_le_bytes(bytes[38..46].try_into().unwrap()),
            elapsed_seconds: u64::from_le_bytes(bytes[46..54].try_into().unwrap()),
            checkpoint: u32::from_le_bytes(bytes[54..58].try_into().unwrap()),
        }
    }

    #[test]
    fn resume_continues_from_the_latest_checkpoint() {
        let dir = data_dir("resume");
        let s = session(&dir, Some(2000), 0, None);
        assert_eq!(go(&s).unwrap().iterations, 2000);
        let second = go(&s).unwrap();
        assert_eq!(second.iterations, 4000);
        assert_eq!(second.trained, 2000);
        let ckpts = dir.join("checkpoints");
        assert_eq!(second.checkpoint, ckpts.join("2.ckpt"));
        assert_eq!(header(&ckpts.join("1.ckpt")).iterations, 2000);
        let last = header(&ckpts.join("2.ckpt"));
        assert_eq!((last.iterations, last.checkpoint), (4000, 2));
        assert!(!ckpts.join("2.ckpt.tmp").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn one_thread_with_a_seed_is_reproducible() {
        let runs: Vec<Vec<u8>> = [("seed-a", 7), ("seed-b", 7), ("seed-c", 8)]
            .into_iter()
            .map(|(name, seed)| {
                let dir = data_dir(name);
                go(&session(&dir, Some(2000), seed, Some(1))).unwrap();
                let bytes = std::fs::read(dir.join("checkpoints/1.ckpt")).unwrap();
                std::fs::remove_dir_all(dir).unwrap();
                bytes
            })
            .collect();
        assert!(runs[0] == runs[1]);
        assert!(runs[0] != runs[2]);
    }

    #[test]
    fn truncated_checkpoint_is_an_error_naming_the_file() {
        let dir = data_dir("truncated");
        let s = session(&dir, Some(10), 0, None);
        go(&s).unwrap();
        let path = dir.join("checkpoints/1.ckpt");
        let bytes = std::fs::read(&path).unwrap();
        std::fs::write(&path, &bytes[..bytes.len() / 2]).unwrap();
        let err = go(&s).err().unwrap();
        assert!(err.contains("1.ckpt") && err.contains("truncated"), "{err}");
        assert!(!dir.join("checkpoints/2.ckpt").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn foreign_checkpoint_is_an_error_naming_the_file() {
        let dir = data_dir("foreign");
        let ckpts = dir.join("checkpoints");
        std::fs::create_dir_all(&ckpts).unwrap();
        let header = CheckpointHeader {
            format_version: FORMAT_VERSION,
            fingerprint: [0; 32],
            iterations: 5,
            elapsed_seconds: 0,
            checkpoint: 3,
        };
        let mut bytes = Vec::new();
        write_checkpoint(&mut bytes, &header, &Storage::new(4)).unwrap();
        std::fs::write(ckpts.join("3.ckpt"), bytes).unwrap();
        let err = go(&session(&dir, Some(10), 0, None)).err().unwrap();
        assert!(
            err.contains("3.ckpt") && err.contains("another preset"),
            "{err}"
        );
        assert!(!ckpts.join("4.ckpt").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn memory_limit_refuses_to_start() {
        let dir = data_dir("memory");
        std::fs::write(
            dir.join("tiny.toml"),
            TINY.replace("memory_limit_gb = 12.0", "memory_limit_gb = 0.1"),
        )
        .unwrap();
        let err = go(&session(&dir, Some(10), 0, None)).err().unwrap();
        assert!(err.contains("memory_limit_gb"), "{err}");
        assert!(!dir.join("checkpoints").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn wrong_table_size_is_an_error_naming_the_file() {
        let dir = data_dir("table");
        std::fs::remove_file(dir.join("turn.bkt")).unwrap();
        std::fs::write(
            dir.join("turn.bkt"),
            encode_table(Street::Turn, 8, &[0u8; 100]),
        )
        .unwrap();
        let err = go(&session(&dir, Some(10), 0, None)).err().unwrap();
        assert!(
            err.contains("turn.bkt") && err.contains("100 bytes"),
            "{err}"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn table_without_a_header_is_an_error_naming_the_file() {
        let dir = data_dir("headerless");
        std::fs::remove_file(dir.join("turn.bkt")).unwrap();
        std::fs::write(dir.join("turn.bkt"), [0u8; 100]).unwrap();
        let err = go(&session(&dir, Some(10), 0, None)).err().unwrap();
        assert!(
            err.contains("turn.bkt") && err.contains("bad magic"),
            "{err}"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn table_of_another_street_is_an_error_naming_the_file() {
        let dir = data_dir("street");
        std::fs::remove_file(dir.join("river.bkt")).unwrap();
        std::fs::hard_link(dir.join("turn.bkt"), dir.join("river.bkt")).unwrap();
        let err = go(&session(&dir, Some(10), 0, None)).err().unwrap();
        assert!(err.contains("river.bkt") && err.contains("Turn"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn memory_estimate_counts_twelve_bytes_per_action_slot() {
        let tree = Tree::build(&Preset::from_toml(TINY).unwrap());
        let tables: u64 = SIZES.iter().map(|&s| (TABLE_HEADER_LEN + s) as u64).sum();
        assert_eq!(
            memory_estimate(&tree, synthetic_tables()).unwrap(),
            tree.action_slot_count() * 12 + tables
        );
    }

    #[test]
    fn tables_built_for_fewer_buckets_are_refused_naming_the_file() {
        let dir = data_dir("bucket-count");
        std::fs::write(
            dir.join("tiny.toml"),
            TINY.replace("buckets = [8, 8, 8]", "buckets = [16, 16, 16]"),
        )
        .unwrap();
        let err = go(&session(&dir, Some(10), 0, None)).err().unwrap();
        assert!(
            err.contains("flop.bkt") && err.contains("8 buckets") && err.contains("16"),
            "{err}"
        );
        assert!(!dir.join("checkpoints").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn stop_flag_ends_an_unbounded_run_with_a_valid_checkpoint() {
        let dir = data_dir("stop");
        let stopped = train(
            &session(&dir, None, 0, None),
            &frozen,
            &AtomicBool::new(true),
        )
        .unwrap();
        assert_eq!(header(&stopped.checkpoint).iterations, stopped.iterations);
        let resumed = go(&session(&dir, Some(10), 0, None)).unwrap();
        assert_eq!(resumed.iterations, stopped.iterations + 10);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn periodic_snapshot_matches_a_run_of_its_iteration_count() {
        let dir = data_dir("snapshot");
        let calls = AtomicU64::new(0);
        let stop = AtomicBool::new(false);
        let stepping = || {
            let n = calls.fetch_add(1, Ordering::Relaxed);
            if n >= 12 {
                stop.store(true, Ordering::Relaxed);
            }
            Duration::from_secs(60 * n)
        };
        train(&session(&dir, None, 7, Some(1)), &stepping, &stop).unwrap();
        let ckpts = dir.join("checkpoints");
        let periodic = (1..)
            .map(|n| ckpts.join(format!("{n}.ckpt")))
            .take_while(|p| p.exists())
            .collect::<Vec<_>>();
        assert!(periodic.len() >= 3, "{periodic:?}");
        let snapshot = &periodic[periodic.len() - 2];
        let count = header(snapshot).iterations;
        assert!(count > 0);
        let fresh = data_dir("snapshot-fresh");
        go(&session(&fresh, Some(count), 7, Some(1))).unwrap();
        let a = std::fs::read(snapshot).unwrap();
        let b = std::fs::read(fresh.join("checkpoints/1.ckpt")).unwrap();
        assert!(
            a[66..] == b[66..],
            "snapshot at {count} differs from a fresh run"
        );
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(fresh).unwrap();
    }
}
