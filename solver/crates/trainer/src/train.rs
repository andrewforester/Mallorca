use crate::schedule::{Claim, Schedule};
use crate::tree::load_preset;
use clap::Args;
use mallorca_core::abstraction::{decode_table, Abstraction};
use mallorca_core::cfr::{iterate, Game, Storage, SLOT_BYTES};
use mallorca_core::checkpoint::{
    read_checkpoint, write_checkpoint, CheckpointHeader, FORMAT_VERSION,
};
use mallorca_core::fingerprint::fingerprint;
use mallorca_core::holdem::Holdem;
use mallorca_core::preset::{CfrParams, Preset};
use mallorca_core::rng::{splitmix64, Rng};
use mallorca_core::tree::{Street, Tree};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

const TABLES: [(&str, Street); 3] = [
    ("flop.bkt", Street::Flop),
    ("turn.bkt", Street::Turn),
    ("river.bkt", Street::River),
];
const POLL: Duration = Duration::from_millis(50);
const PAUSE_POLL: Duration = Duration::from_millis(1);
const NIGHTS: [u64; 2] = [8, 10];

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

#[derive(Args)]
pub struct CalibrateArgs {
    #[arg(long)]
    pub preset: PathBuf,
    #[arg(long)]
    pub data: PathBuf,
    #[arg(long, default_value_t = 30)]
    pub minutes: u64,
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

pub struct Resume {
    pub storage: Storage,
    pub iterations: u64,
    pub elapsed_seconds: u64,
    pub checkpoint: u32,
}

fn read_file(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

fn memory_estimate(tree: &Tree, tables: &Path) -> Result<u64, String> {
    let mut bytes = tree.action_slot_count() * SLOT_BYTES as u64;
    for (name, _) in TABLES {
        let path = tables.join(name);
        let meta =
            std::fs::metadata(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        bytes += meta.len();
    }
    Ok(bytes)
}

pub fn read_table(path: &Path, street: Street, buckets: u16) -> Result<Vec<u8>, String> {
    let (header, table) =
        decode_table(read_file(path)?).map_err(|e| format!("{}: {e}", path.display()))?;
    if header.street != street {
        return Err(format!(
            "{}: a {:?} table, expected {street:?}",
            path.display(),
            header.street
        ));
    }
    if header.buckets != buckets {
        return Err(format!(
            "{}: built for {} buckets, the preset has {buckets}; rebuild it with `buckets`",
            path.display(),
            header.buckets
        ));
    }
    Ok(table)
}

pub fn load_abstraction(preset: &Preset, dir: &Path) -> Result<Abstraction, String> {
    let mut tables: [Vec<u8>; 3] = Default::default();
    for (i, (slot, (name, street))) in tables.iter_mut().zip(TABLES).enumerate() {
        *slot = read_table(&dir.join(name), street, preset.buckets[i])?;
    }
    let abstraction = Abstraction::new(tables);
    for (i, (name, street)) in TABLES.into_iter().enumerate() {
        let path = dir.join(name);
        let table = abstraction.table_bytes(street);
        let classes = abstraction.class_count(street);
        if table.len() as u64 != classes {
            return Err(format!(
                "{}: {} bytes, expected {classes}",
                path.display(),
                table.len()
            ));
        }
        let buckets = preset.buckets[i];
        if let Some(&b) = table.iter().find(|&&b| u16::from(b) >= buckets) {
            return Err(format!(
                "{}: bucket {b} out of range for {buckets} buckets",
                path.display()
            ));
        }
    }
    Ok(abstraction)
}

fn checkpoint_path(dir: &Path, n: u32) -> PathBuf {
    dir.join(format!("{n}.ckpt"))
}

pub fn latest_checkpoint(dir: &Path) -> Result<Option<u32>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
    let mut latest = None;
    for entry in entries {
        let entry = entry.map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
        let name = entry.file_name();
        let Some(n) = name
            .to_str()
            .and_then(|s| s.strip_suffix(".ckpt"))
            .and_then(|s| s.parse::<u32>().ok())
        else {
            continue;
        };
        latest = latest.max(Some(n));
    }
    Ok(latest)
}

pub fn load_checkpoint(
    dir: &Path,
    n: u32,
    expected: &[u8; 32],
    slots: u64,
) -> Result<Resume, String> {
    let path = checkpoint_path(dir, n);
    let bytes = read_file(&path)?;
    let (header, storage) =
        read_checkpoint(&bytes, expected).map_err(|e| format!("{}: {e}", path.display()))?;
    if storage.len() != slots {
        return Err(format!(
            "{}: {} action slots, the tree has {slots}",
            path.display(),
            storage.len()
        ));
    }
    Ok(Resume {
        storage,
        iterations: header.iterations,
        elapsed_seconds: header.elapsed_seconds,
        checkpoint: n,
    })
}

fn resume(dir: &Path, expected: &[u8; 32], slots: u64) -> Result<Option<Resume>, String> {
    let Some(n) = latest_checkpoint(dir)? else {
        return Ok(None);
    };
    load_checkpoint(dir, n, expected, slots).map(Some)
}

fn save(dir: &Path, header: &CheckpointHeader, storage: &Storage) -> Result<PathBuf, String> {
    let path = checkpoint_path(dir, header.checkpoint);
    let tmp = dir.join(format!("{}.ckpt.tmp", header.checkpoint));
    let failed = |e: std::io::Error| format!("cannot write {}: {e}", tmp.display());
    let mut out = BufWriter::new(File::create(&tmp).map_err(failed)?);
    write_checkpoint(&mut out, header, storage).map_err(failed)?;
    let file = out.into_inner().map_err(|e| failed(e.into_error()))?;
    file.sync_all().map_err(failed)?;
    drop(file);
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("cannot rename {} to {}: {e}", tmp.display(), path.display()))?;
    File::open(dir)
        .and_then(|d| d.sync_all())
        .map_err(|e| format!("cannot sync {}: {e}", dir.display()))?;
    Ok(path)
}

pub fn average_positive_regret(storage: &Storage, iterations: u64) -> f64 {
    if iterations == 0 {
        return 0.0;
    }
    let sum: f64 = (0..storage.len())
        .map(|i| f64::from(storage.regret(i).max(0.0)))
        .sum();
    sum / iterations as f64
}

fn worker_seed(seed: u64, worker: u64, start: u64) -> u64 {
    let mut state = seed;
    let mut state = splitmix64(&mut state) ^ worker;
    let mut state = splitmix64(&mut state) ^ start;
    splitmix64(&mut state)
}

struct Shared<'a, G: Game> {
    game: &'a G,
    storage: &'a Storage,
    cfr: &'a CfrParams,
    schedule: &'a Schedule,
    halt: &'a AtomicBool,
    pause: &'a AtomicBool,
    idle: &'a AtomicUsize,
}

fn work<G: Game>(s: &Shared<'_, G>, rng: &mut Rng) {
    while !s.halt.load(Ordering::Relaxed) {
        if s.pause.load(Ordering::Acquire) {
            s.idle.fetch_add(1, Ordering::AcqRel);
            while s.pause.load(Ordering::Acquire) && !s.halt.load(Ordering::Relaxed) {
                std::thread::sleep(PAUSE_POLL);
            }
            s.idle.fetch_sub(1, Ordering::AcqRel);
            continue;
        }
        match s.schedule.claim() {
            Claim::Done => break,
            Claim::Wait => std::thread::sleep(PAUSE_POLL),
            Claim::Run(i) => {
                iterate(s.game, s.storage, (i % 2) as u8, rng);
                s.schedule.complete(|k| s.storage.discount(k, s.cfr));
            }
        }
    }
}

struct Finished<'a> {
    count: &'a AtomicUsize,
    halt: &'a AtomicBool,
}

impl Drop for Finished<'_> {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.halt.store(true, Ordering::Relaxed);
        }
        self.count.fetch_add(1, Ordering::AcqRel);
    }
}

struct Progress<'a> {
    dir: &'a Path,
    fingerprint: [u8; 32],
    start_iterations: u64,
    start_elapsed: u64,
    next: u32,
}

impl Progress<'_> {
    fn checkpoint(
        &mut self,
        storage: &Storage,
        iterations: u64,
        session: Duration,
    ) -> Result<PathBuf, String> {
        let header = CheckpointHeader {
            format_version: FORMAT_VERSION,
            fingerprint: self.fingerprint,
            iterations,
            elapsed_seconds: self.start_elapsed + session.as_secs(),
            checkpoint: self.next,
        };
        let path = save(self.dir, &header, storage)?;
        self.next += 1;
        let secs = session.as_secs_f64();
        let rate = if secs > 0.0 {
            (iterations - self.start_iterations) as f64 / secs
        } else {
            0.0
        };
        println!(
            "checkpoint {}: {iterations} iterations, {rate:.1} it/s, avg positive regret {:.6e} per iteration, {}",
            header.checkpoint,
            average_positive_regret(storage, iterations),
            path.display()
        );
        Ok(path)
    }
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

fn wall_clock() -> impl Fn() -> Duration + Sync {
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

pub fn calibrate(args: &CalibrateArgs, stop: &AtomicBool) -> Result<(), String> {
    let scratch = args.data.join("calibrate");
    let clear = || match std::fs::remove_dir_all(&scratch) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("cannot remove {}: {e}", scratch.display()))
        }
        _ => Ok(()),
    };
    clear()?;
    let session = Session {
        preset: args.preset.clone(),
        tables: args.data.clone(),
        checkpoints: scratch.clone(),
        minutes: Some(args.minutes),
        iterations: None,
        seed: 0,
        threads: args.threads,
    };
    let outcome = train(&session, &wall_clock(), stop);
    clear()?;
    let outcome = outcome?;
    let rate = if outcome.seconds > 0.0 {
        outcome.trained as f64 / outcome.seconds
    } else {
        0.0
    };
    println!(
        "calibrated {} iterations in {:.1}s: {rate:.1} iterations per second",
        outcome.trained, outcome.seconds
    );
    for hours in NIGHTS {
        println!(
            "{hours} hours: {:.0} iterations",
            rate * (hours * 3600) as f64
        );
    }
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use mallorca_core::abstraction::{encode_table, TABLE_HEADER_LEN};
    use std::sync::atomic::AtomicU64;
    use std::sync::OnceLock;

    const TINY: &str = include_str!("../../../presets/tiny.toml");
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

    #[test]
    fn panicking_worker_counts_as_finished_and_halts_the_others() {
        let count = AtomicUsize::new(0);
        let halt = AtomicBool::new(false);
        let joined = std::thread::scope(|scope| {
            let clean = scope.spawn(|| {
                let _guard = Finished {
                    count: &count,
                    halt: &halt,
                };
            });
            clean.join().unwrap();
            assert!(!halt.load(Ordering::Relaxed));
            scope
                .spawn(|| {
                    let _guard = Finished {
                        count: &count,
                        halt: &halt,
                    };
                    std::panic::resume_unwind(Box::new("worker failed"));
                })
                .join()
        });
        assert!(joined.is_err());
        assert_eq!(count.load(Ordering::Relaxed), 2);
        assert!(halt.load(Ordering::Relaxed));
    }

    #[test]
    fn worker_seeds_are_distinct_across_seeds_workers_and_starts() {
        let mut seen = std::collections::HashSet::new();
        for start in [0, 1000, 4000] {
            for seed in 0..64 {
                for w in 0..64 {
                    assert!(
                        seen.insert(worker_seed(seed, w, start)),
                        "seed {seed} worker {w} start {start}"
                    );
                }
            }
        }
    }

    #[test]
    fn average_positive_regret_ignores_negative_regrets() {
        let s = Storage::new(3);
        s.add_regret(0, 2.0);
        s.add_regret(1, -1.0);
        s.add_regret(2, 4.0);
        assert_eq!(average_positive_regret(&s, 3), 2.0);
        assert_eq!(average_positive_regret(&s, 0), 0.0);
    }
}
