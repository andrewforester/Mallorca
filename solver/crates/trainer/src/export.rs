use crate::thresholds::play_thresholds;
use crate::train::checkpoints::{latest_checkpoint, load_checkpoint};
use crate::train::tables::load_abstraction;
use crate::tree::load_preset;
use crate::verify::play_centroids;
use clap::{Args, ValueEnum};
use flate2::write::GzEncoder;
use flate2::Compression;
use mallorca_core::fingerprint::fingerprint;
use mallorca_core::preset::Bucketing;
use mallorca_core::strategy::{quantize, StrategyFile, StrategyHeader};
use mallorca_core::tree::{Node, Street, Tree};
use std::io::Write;
use std::path::{Path, PathBuf};

const ALL_STREETS: u8 = 0b1111;

#[derive(Clone, Copy, ValueEnum)]
pub enum StreetSet {
    All,
    Play,
}

#[derive(Args)]
pub struct ExportArgs {
    #[arg(long)]
    pub preset: PathBuf,
    #[arg(long)]
    pub data: PathBuf,
    #[arg(long)]
    pub checkpoint: Option<u32>,
    #[arg(long, value_enum, default_value = "play")]
    pub streets: StreetSet,
    #[arg(long)]
    pub out: PathBuf,
}

pub fn build(
    preset_path: &Path,
    data: &Path,
    checkpoint: Option<u32>,
    streets: StreetSet,
) -> Result<StrategyFile, String> {
    let preset = load_preset(&preset_path.to_path_buf())?;
    let tree = Tree::build(&preset);
    let abstraction = load_abstraction(&preset, data)?;
    let fp = fingerprint(&preset, &tree, &abstraction);
    let dir = data.join("checkpoints");
    let n = match checkpoint {
        Some(n) => n,
        None => latest_checkpoint(&dir)?
            .ok_or_else(|| format!("no checkpoints in {}", dir.display()))?,
    };
    let loaded = load_checkpoint(&dir, n, &fp, tree.action_slot_count())?;
    let mut probabilities = Vec::new();
    for (id, node) in tree.nodes().iter().enumerate() {
        let Node::Decision {
            street, actions, ..
        } = node
        else {
            continue;
        };
        for bucket in 0..tree.buckets()[street.as_index()] {
            let offset = tree.offset(id as u32, bucket);
            let average = loaded.storage.average_strategy(offset, actions.len());
            probabilities.extend(quantize(&average));
        }
    }
    let tables = match streets {
        StreetSet::Play => vec![abstraction.table_bytes(Street::Flop).to_vec()],
        StreetSet::All => [Street::Flop, Street::Turn, Street::River]
            .into_iter()
            .map(|street| abstraction.table_bytes(street).to_vec())
            .collect(),
    };
    let header = StrategyHeader {
        fingerprint: fp,
        small_blind: preset.small_blind,
        big_blind: preset.big_blind,
        stack: preset.stack,
        streets: ALL_STREETS,
        iterations: loaded.iterations,
        checkpoint: loaded.checkpoint,
    };
    let file = StrategyFile::new(header, tree, tables, probabilities);
    match (streets, preset.bucketing) {
        (StreetSet::Play, Bucketing::Hs2) => {
            Ok(file.with_thresholds(play_thresholds(data, &preset, &abstraction)?))
        }
        (StreetSet::Play, Bucketing::Potential) => {
            let centroids = play_centroids(data, &preset, &abstraction)?;
            Ok(file.with_centroids(
                vec![
                    (Street::Turn, centroids.turn),
                    (Street::River, centroids.river),
                ],
                centroids.clusters,
            ))
        }
        (StreetSet::All, _) => Ok(file),
    }
}

fn gzip_size(bytes: &[u8]) -> Result<usize, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(bytes)
        .map_err(|e| format!("cannot compress: {e}"))?;
    let out = encoder
        .finish()
        .map_err(|e| format!("cannot compress: {e}"))?;
    Ok(out.len())
}

pub fn run(args: &ExportArgs) -> Result<(), String> {
    let file = build(&args.preset, &args.data, args.checkpoint, args.streets)?;
    let bytes = file.to_bytes();
    let tmp = args.out.with_extension("tmp");
    let failed = |e: std::io::Error| format!("cannot write {}: {e}", args.out.display());
    std::fs::write(&tmp, &bytes).map_err(failed)?;
    std::fs::rename(&tmp, &args.out).map_err(failed)?;
    let gzipped = gzip_size(&bytes)?;
    println!(
        "checkpoint {}: {} iterations, streets mask {:#06b}",
        file.checkpoint, file.iterations, file.streets
    );
    println!(
        "wrote {}: {} bytes raw ({:.2} MB), {gzipped} bytes gzipped ({:.2} MB)",
        args.out.display(),
        bytes.len(),
        bytes.len() as f64 / 1e6,
        gzipped as f64 / 1e6
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::train::tables::read_table;
    use crate::train::tests::{data_dir, go, session};
    use mallorca_core::strategy::StrategyError;

    fn trained(name: &str, iterations: u64) -> PathBuf {
        let dir = data_dir(name);
        go(&session(&dir, Some(iterations), 3, Some(1))).unwrap();
        dir
    }

    fn export(dir: &Path, streets: StreetSet) -> Result<StrategyFile, String> {
        build(&dir.join("tiny.toml"), dir, None, streets)
    }

    #[derive(clap::Parser)]
    struct Cli {
        #[command(flatten)]
        export: ExportArgs,
    }

    #[test]
    fn streets_default_to_the_play_file() {
        use clap::Parser;
        let cli =
            Cli::try_parse_from(["export", "--preset", "p", "--data", "d", "--out", "o"]).unwrap();
        assert!(matches!(cli.export.streets, StreetSet::Play));
    }

    #[test]
    fn export_carries_the_checkpoint_and_normalised_slices() {
        let dir = trained("export-header", 200);
        let file = export(&dir, StreetSet::All).unwrap();
        assert_eq!(file.streets, 0b1111);
        assert_eq!(
            file.tables[0],
            read_table(&dir.join("flop.bkt"), Street::Flop, 8).unwrap()
        );
        assert_eq!((file.iterations, file.checkpoint), (200, 1));
        assert_eq!(
            (file.small_blind, file.big_blind, file.stack),
            (10, 20, 400)
        );
        let ckpt = std::fs::read(dir.join("checkpoints/1.ckpt")).unwrap();
        assert_eq!(&file.fingerprint[..], &ckpt[6..38]);
        let mut slices = 0;
        for (id, node) in file.tree.nodes().iter().enumerate() {
            if let Node::Decision { street, .. } = node {
                assert!(file.includes(*street));
                for bucket in 0..file.tree.buckets()[street.as_index()] {
                    let p = file.probabilities(id as u32, bucket);
                    assert_eq!(p.iter().map(|&x| u32::from(x)).sum::<u32>(), 255);
                    slices += 1;
                }
            }
        }
        assert!(slices > 0);
        let again = StrategyFile::from_bytes(&file.to_bytes()).unwrap();
        assert_eq!(again, file);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn export_matches_the_average_strategy() {
        let dir = trained("export-average", 300);
        let file = export(&dir, StreetSet::All).unwrap();
        let preset = load_preset(&dir.join("tiny.toml")).unwrap();
        let tree = Tree::build(&preset);
        let abstraction = load_abstraction(&preset, &dir).unwrap();
        let fp = fingerprint(&preset, &tree, &abstraction);
        let loaded =
            load_checkpoint(&dir.join("checkpoints"), 1, &fp, tree.action_slot_count()).unwrap();
        let root = tree.root();
        let Node::Decision { actions, .. } = tree.node(root) else {
            panic!("root is a decision");
        };
        for bucket in [0u16, 50, 168] {
            let average = loaded
                .storage
                .average_strategy(tree.offset(root, bucket), actions.len());
            assert_eq!(file.probabilities(root, bucket), quantize(&average));
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn all_streets_export_has_every_table() {
        let dir = trained("export-all", 100);
        let file = export(&dir, StreetSet::All).unwrap();
        assert_eq!(file.streets, 0b1111);
        assert_eq!(file.tables.len(), 3);
        let streets = [Street::Flop, Street::Turn, Street::River];
        for ((table, name), street) in file
            .tables
            .iter()
            .zip(["flop", "turn", "river"])
            .zip(streets)
        {
            assert_eq!(
                table,
                &read_table(&dir.join(format!("{name}.bkt")), street, 8).unwrap()
            );
        }
        assert_eq!(
            file.probabilities.len() as u64,
            file.tree.action_slot_count()
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn play_export_needs_the_river_strengths() {
        let dir = trained("export-play-missing", 100);
        let err = export(&dir, StreetSet::Play).err().unwrap();
        assert!(err.contains("river_hs.f32"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    #[ignore]
    fn play_export_on_real_tables_reproduces_every_bucket() {
        let dir = data_dir("export-play-real");
        let threads = std::thread::available_parallelism().map_or(2, |n| n.get());
        let text = std::fs::read_to_string(dir.join("tiny.toml")).unwrap();
        std::fs::write(
            dir.join("tiny.toml"),
            text.replace("threads = 2", &format!("threads = {threads}")),
        )
        .unwrap();
        for table in ["flop.bkt", "turn.bkt", "river.bkt"] {
            std::fs::remove_file(dir.join(table)).unwrap();
        }
        crate::buckets::run(&crate::buckets::BucketsArgs {
            preset: dir.join("tiny.toml"),
            out: dir.clone(),
        })
        .unwrap();
        go(&session(&dir, Some(100), 3, Some(1))).unwrap();
        let file = export(&dir, StreetSet::Play).unwrap();
        assert_eq!(file.streets, 0b1111);
        assert_eq!(file.tables.len(), 1);
        let again = StrategyFile::from_bytes(&file.to_bytes()).unwrap();
        assert_eq!(again, file);
        assert!(mallorca_core::bot::Model::new(again.clone()).is_ok());
        let live = mallorca_core::abstraction::Abstraction::from_strategy(&again).unwrap();
        let preset = load_preset(&dir.join("tiny.toml")).unwrap();
        let tables = load_abstraction(&preset, &dir).unwrap();
        let mut rng = mallorca_core::rng::Rng::new(11);
        for _ in 0..300 {
            let mut deck: Vec<u8> = (0..52).collect();
            rng.shuffle(&mut deck);
            let hole = [deck[0], deck[1]];
            for (street, n) in [(Street::Flop, 5), (Street::Turn, 6), (Street::River, 7)] {
                assert_eq!(
                    live.bucket(street, hole, &deck[2..n]),
                    tables.bucket(street, hole, &deck[2..n]),
                    "{street:?} {deck:?}"
                );
            }
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn potential_dir(name: &str, tamper: Option<usize>) -> PathBuf {
        let shared = crate::potential::tests::tiny_potential();
        let dir =
            Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../../target/tmp/trainer-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for file in ["flop.bkt", "river.bkt", "river_hs.f32", "centroids.bin"] {
            std::fs::hard_link(shared.join(file), dir.join(file)).unwrap();
        }
        let mut turn = std::fs::read(shared.join("turn.bkt")).unwrap();
        if let Some(class) = tamper {
            let at = mallorca_core::abstraction::TABLE_HEADER_LEN + class;
            turn[at] = (turn[at] + 1) % 8;
        }
        std::fs::write(dir.join("turn.bkt"), turn).unwrap();
        std::fs::copy(shared.join("tiny-potential.toml"), dir.join("tiny.toml")).unwrap();
        go(&session(&dir, Some(2000), 3, None)).unwrap();
        dir
    }

    #[test]
    #[ignore]
    fn play_export_with_centroids_reproduces_every_bucket() {
        let dir = potential_dir("export-play-centroids", None);
        let file = export(&dir, StreetSet::Play).unwrap();
        assert_eq!(file.streets, 0b1111);
        assert_eq!(file.tables.len(), 1);
        assert!(file.thresholds_of(Street::Turn).is_none());
        assert!(file.thresholds_of(Street::River).is_none());
        let centroids = mallorca_core::centroids::Centroids::decode(
            &std::fs::read(dir.join("centroids.bin")).unwrap(),
        )
        .unwrap();
        assert_eq!(file.centroids_of(Street::Turn), Some(&centroids.turn[..]));
        assert_eq!(file.centroids_of(Street::River), Some(&centroids.river[..]));
        assert_eq!(file.clusters, Some(centroids.clusters));
        let bytes = file.to_bytes();
        assert_eq!(u16::from_le_bytes([bytes[4], bytes[5]]), 3);
        let again = StrategyFile::from_bytes(&bytes).unwrap();
        assert_eq!(again, file);
        assert!(mallorca_core::bot::Model::new(again.clone()).is_ok());
        let live = mallorca_core::abstraction::Abstraction::from_strategy(&again).unwrap();
        let preset = load_preset(&dir.join("tiny.toml")).unwrap();
        let tables = load_abstraction(&preset, &dir).unwrap();
        let mut rng = mallorca_core::rng::Rng::new(29);
        for _ in 0..10_000 {
            let mut deck: Vec<u8> = (0..52).collect();
            rng.shuffle(&mut deck);
            let hole = [deck[0], deck[1]];
            for (street, n) in [(Street::Flop, 5), (Street::Turn, 6), (Street::River, 7)] {
                assert_eq!(
                    live.bucket(street, hole, &deck[2..n]),
                    tables.bucket(street, hole, &deck[2..n]),
                    "{street:?} {deck:?}"
                );
            }
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    #[ignore]
    fn a_tampered_table_is_refused() {
        let class = 123_457;
        let dir = potential_dir("export-play-tampered", Some(class));
        let err = export(&dir, StreetSet::Play).err().unwrap();
        assert!(
            err.contains("turn") && err.contains(&class.to_string()),
            "{err}"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn explicit_checkpoint_is_chosen() {
        let dir = trained("export-explicit", 100);
        go(&session(&dir, Some(100), 3, Some(1))).unwrap();
        let first = build(&dir.join("tiny.toml"), &dir, Some(1), StreetSet::All).unwrap();
        let latest = export(&dir, StreetSet::All).unwrap();
        assert_eq!((first.checkpoint, first.iterations), (1, 100));
        assert_eq!((latest.checkpoint, latest.iterations), (2, 200));
        let missing = build(&dir.join("tiny.toml"), &dir, Some(9), StreetSet::All);
        assert!(missing.err().unwrap().contains("9.ckpt"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn checkpoint_of_another_preset_is_refused() {
        let dir = trained("export-foreign", 100);
        let text = std::fs::read_to_string(dir.join("tiny.toml")).unwrap();
        std::fs::write(
            dir.join("other.toml"),
            text.replace("stack = 400", "stack = 500"),
        )
        .unwrap();
        let err = build(&dir.join("other.toml"), &dir, None, StreetSet::All)
            .err()
            .unwrap();
        assert!(err.contains("another preset"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn no_checkpoint_is_an_error() {
        let dir = data_dir("export-none");
        std::fs::create_dir_all(dir.join("checkpoints")).unwrap();
        let err = export(&dir, StreetSet::All).err().unwrap();
        assert!(err.contains("no checkpoints"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn written_file_is_readable_and_gzip_is_smaller() {
        let dir = trained("export-write", 100);
        let out = dir.join("strategy.bin");
        run(&ExportArgs {
            preset: dir.join("tiny.toml"),
            data: dir.clone(),
            checkpoint: None,
            streets: StreetSet::All,
            out: out.clone(),
        })
        .unwrap();
        let bytes = std::fs::read(&out).unwrap();
        assert!(StrategyFile::from_bytes(&bytes).is_ok());
        assert!(gzip_size(&bytes).unwrap() < bytes.len());
        assert!(!dir.join("strategy.tmp").exists());
        let mut cut = bytes.clone();
        cut.truncate(10);
        assert_eq!(
            StrategyFile::from_bytes(&cut).err(),
            Some(StrategyError::Truncated)
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
