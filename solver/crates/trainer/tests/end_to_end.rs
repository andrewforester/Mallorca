use mallorca_core::abstraction::{decode_table, Abstraction};
use mallorca_core::checkpoint::{read_checkpoint, CheckpointHeader};
use mallorca_core::fingerprint::fingerprint;
use mallorca_core::preset::Preset;
use mallorca_core::strategy::StrategyFile;
use mallorca_core::tree::{Node, Street, Tree};
use std::path::{Path, PathBuf};
use std::process::Command;

const TINY: &str = include_str!("../../../presets/tiny.toml");
const TINY_POTENTIAL: &str = include_str!("../../../presets/tiny-potential.toml");

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("mallorca-e2e-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn run(args: &[&str]) -> String {
    let output = Command::new(env!("CARGO_BIN_EXE_mallorca-trainer"))
        .args(args)
        .output()
        .expect("binary starts");
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    assert!(
        output.status.success(),
        "{args:?} failed: {}\n{stdout}",
        String::from_utf8_lossy(&output.stderr)
    );
    stdout
}

fn path(p: &Path) -> &str {
    p.to_str().unwrap()
}

fn latest_checkpoint(dir: &Path) -> PathBuf {
    std::fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| {
            let p = e.unwrap().path();
            let n: u32 = p.file_stem()?.to_str()?.parse().ok()?;
            (p.extension()? == "ckpt").then_some((n, p))
        })
        .max()
        .expect("a checkpoint exists")
        .1
}

fn check_file(file: &StrategyFile, expected: &[u8; 32], mask: u8) {
    assert_eq!(&file.fingerprint, expected);
    assert_eq!(file.streets, mask);
    let mut infosets = 0u64;
    for (id, node) in file.tree.nodes().iter().enumerate() {
        let Node::Decision { street, .. } = node else {
            continue;
        };
        if !file.includes(*street) {
            continue;
        }
        for bucket in 0..file.tree.buckets()[street.as_index()] {
            let sum: u32 = file
                .probabilities(id as u32, bucket)
                .iter()
                .map(|&p| u32::from(p))
                .sum();
            assert_eq!(sum, 255, "node {id} bucket {bucket}");
            infosets += 1;
        }
    }
    assert!(infosets > 0);
}

fn assert_prints_number(output: &str, marker: &str) {
    let line = output
        .lines()
        .find(|l| l.contains(marker))
        .unwrap_or_else(|| panic!("no {marker} line in:\n{output}"));
    let words: Vec<&str> = line.split_whitespace().collect();
    let unit = words
        .iter()
        .position(|&w| w == "mbb/hand" || w == "bb/100")
        .filter(|&i| i > 0)
        .unwrap_or_else(|| panic!("no mbb/hand or bb/100 figure in {line}"));
    let figure = words[unit - 1];
    assert!(
        figure.parse::<f64>().is_ok_and(f64::is_finite),
        "{figure} before {} is not a finite figure in {line}",
        words[unit]
    );
}

#[test]
fn figure_check_accepts_a_finite_figure() {
    assert_prints_number(
        "x\nlbr: +12.50 mbb/hand ± 3.00 over 2000 hands\n",
        "mbb/hand",
    );
    assert_prints_number("call: -0.50 bb/100 ± 3.21 over 2000 deals", "call: ");
}

#[test]
#[should_panic(expected = "not a finite figure")]
fn figure_check_rejects_nan_next_to_the_unit() {
    assert_prints_number("lbr: NaN mbb/hand ± 3.00 over 2000 hands", "mbb/hand");
}

#[test]
#[should_panic(expected = "not a finite figure")]
fn figure_check_rejects_infinity_next_to_the_unit() {
    assert_prints_number("random: +inf bb/100 ± 3.21 over 2000 deals", "random: ");
}

fn export(preset: &Path, data: &Path, streets: &str, out: &Path) {
    run(&[
        "export",
        "--preset",
        path(preset),
        "--data",
        path(data),
        "--streets",
        streets,
        "--out",
        path(out),
    ]);
}

fn build_and_train(dir: &Path, text: &str) -> (PathBuf, PathBuf) {
    let preset = dir.join("preset.toml");
    std::fs::write(&preset, text).unwrap();
    let data = dir.join("data");
    std::fs::create_dir_all(&data).unwrap();
    let (preset_arg, data_arg) = (path(&preset), path(&data));
    run(&["buckets", "--preset", preset_arg, "--out", data_arg]);
    let tree_out = run(&["tree", "--preset", preset_arg]);
    assert!(tree_out.contains("action slots"));
    run(&[
        "train",
        "--preset",
        preset_arg,
        "--data",
        data_arg,
        "--iterations",
        "20000",
        "--threads",
        "2",
    ]);
    (preset, data)
}

fn trained_header(text: &str, data: &Path) -> CheckpointHeader {
    let preset_value = Preset::from_toml(text).unwrap();
    let tree = Tree::build(&preset_value);
    let read = |name: &str| {
        let (_, table) = decode_table(std::fs::read(data.join(name)).unwrap()).unwrap();
        table
    };
    let abstraction = Abstraction::new([read("flop.bkt"), read("turn.bkt"), read("river.bkt")]);
    let expected = fingerprint(&preset_value, &tree, &abstraction);
    let checkpoint = std::fs::read(latest_checkpoint(&data.join("checkpoints"))).unwrap();
    let (header, _) = read_checkpoint(&checkpoint, &expected).expect("checkpoint fingerprint");
    assert!(header.iterations >= 20000);
    header
}

fn measure(strategy: &Path, hands: &str) {
    let lbr = run(&[
        "lbr",
        "--strategy",
        path(strategy),
        "--hands",
        hands,
        "--threads",
        "2",
    ]);
    assert_prints_number(&lbr, "mbb/hand");

    let matches = run(&[
        "match",
        "--strategy",
        path(strategy),
        "--opponent",
        "all",
        "--deals",
        "2000",
    ]);
    for name in ["call", "raise", "random"] {
        assert_prints_number(&matches, &format!("{name}: "));
    }
}

#[test]
#[ignore]
fn tiny_runs_through_every_subcommand() {
    let dir = scratch("tiny");
    let (preset, data) = build_and_train(&dir, TINY);

    let browser = dir.join("browser.bin");
    let all = dir.join("all.bin");
    export(&preset, &data, "browser", &browser);
    export(&preset, &data, "all", &all);

    let header = trained_header(TINY, &data);
    let browser_file = StrategyFile::from_bytes(&std::fs::read(&browser).unwrap()).unwrap();
    let all_file = StrategyFile::from_bytes(&std::fs::read(&all).unwrap()).unwrap();
    check_file(&browser_file, &header.fingerprint, 0b0011);
    check_file(&all_file, &header.fingerprint, 0b1111);
    assert_eq!(browser_file.iterations, header.iterations);

    measure(&all, "2000");

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[ignore]
fn tiny_potential_runs_through_every_subcommand() {
    let dir = scratch("tiny-potential");
    let (preset, data) = build_and_train(&dir, TINY_POTENTIAL);
    for name in ["river_hs.f32", "centroids.bin"] {
        assert!(data.join(name).is_file(), "{name} is written");
    }

    let browser = dir.join("browser.bin");
    let play = dir.join("play.bin");
    export(&preset, &data, "browser", &browser);
    export(&preset, &data, "play", &play);

    let header = trained_header(TINY_POTENTIAL, &data);
    let browser_file = StrategyFile::from_bytes(&std::fs::read(&browser).unwrap()).unwrap();
    check_file(&browser_file, &header.fingerprint, 0b0011);

    let play_bytes = std::fs::read(&play).unwrap();
    assert_eq!(u16::from_le_bytes([play_bytes[4], play_bytes[5]]), 3);
    let play_file = StrategyFile::from_bytes(&play_bytes).unwrap();
    check_file(&play_file, &header.fingerprint, 0b1111);
    assert_eq!(play_file.iterations, header.iterations);
    for street in [Street::Turn, Street::River] {
        assert!(play_file.centroids_of(street).is_some(), "{street:?}");
    }
    Abstraction::from_strategy(&play_file).expect("live turn and river buckets");

    measure(&play, "100");

    let _ = std::fs::remove_dir_all(&dir);
}
