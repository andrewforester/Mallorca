use crate::buckets::{canonical_board, river_pass, write_bytes, write_floats};
use crate::kmeans::{assign, kmeans};
use crate::parallel::{map_chunks_mut, map_ranges, parallel_chunks};
use mallorca_core::abstraction::encode_table;
use mallorca_core::cards::Card;
use mallorca_core::centroids::{Centroids, RIVER_DIMENSION};
use mallorca_core::iso::{board_indexer, street_indexers, HandIndexer};
use mallorca_core::potential::{
    bin_of, flop_counts, histogram, nearest, river_ochs, turn_counts, Metric, BINS, CLUSTERS,
};
use mallorca_core::preset::Preset;
use mallorca_core::tree::Street;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Instant;

const MAX_SAMPLE: usize = 5_000_000;
const HOLES_PER_BOARD: usize = 1081;
const PREFLOP_CLASSES: usize = 169;
const ROWS: usize = 1024;
const RIVER_RANGE: usize = 1 << 20;
const BOARD_RANGE: usize = 16;
const UNSET: u16 = u16::MAX;
const CLUSTER_SEED: u64 = 0x6f63_6873_0001;
const RIVER_SEED: u64 = 0x7269_7665_0002;
const TURN_SEED: u64 = 0x7475_726e_0003;
const FLOP_SEED: u64 = 0x666c_6f70_0004;

struct StreetJob<'a> {
    name: &'a str,
    indexer: &'a HandIndexer,
    buckets: u16,
    seed: u64,
    threads: usize,
}

pub fn run(preset: &Preset, out: &Path) -> Result<(), String> {
    let threads = preset.threads;
    let started = Instant::now();
    let indexers = street_indexers();
    let river_hs = river_pass(indexers, threads)?;
    write_floats(&out.join("river_hs.f32"), &river_hs)?;
    println!("wrote river_hs.f32: {} bytes", river_hs.len() * 4);
    let clusters = opponent_clusters(indexers, &river_hs, threads);
    let river = river_buckets(&indexers[3], &clusters, preset.buckets[2], threads)?;
    write_table(out, "river.bkt", Street::River, preset.buckets[2], &river.1)?;
    drop(river.1);
    let river_of =
        |hole: [Card; 2], board: &[Card; 5]| lookup(&indexers[3], &river_hs, hole, board);
    let turn = turn_job(indexers, preset.buckets[1], threads);
    let (turn_centroids, turn_table) = street_buckets(&turn, turn_feature(indexers, &river_hs));
    write_table(out, "turn.bkt", Street::Turn, turn.buckets, &turn_table)?;
    let flop = StreetJob {
        name: "flop",
        indexer: &indexers[1],
        buckets: preset.buckets[0],
        seed: FLOP_SEED,
        threads,
    };
    let flop_feature = |cards: &[Card]| {
        let board: [Card; 3] = cards[2..].try_into().expect("three board cards");
        histogram(&flop_counts([cards[0], cards[1]], &board, river_of))
    };
    let (_, flop_table) = street_buckets(&flop, flop_feature);
    write_table(out, "flop.bkt", Street::Flop, flop.buckets, &flop_table)?;
    let centroids = Centroids {
        clusters,
        turn: turn_centroids,
        river: river.0,
    };
    let bytes = centroids.encode();
    write_bytes(&out.join("centroids.bin"), &bytes)?;
    println!("wrote centroids.bin: {} bytes", bytes.len());
    println!("total {:.1}s", started.elapsed().as_secs_f64());
    Ok(())
}

fn turn_job(indexers: &[HandIndexer; 4], buckets: u16, threads: usize) -> StreetJob<'_> {
    StreetJob {
        name: "turn",
        indexer: &indexers[2],
        buckets,
        seed: TURN_SEED,
        threads,
    }
}

fn turn_feature<'a>(
    indexers: &'a [HandIndexer; 4],
    river_hs: &'a [f32],
) -> impl Fn(&[Card]) -> [f32; BINS] + Sync + 'a {
    move |cards: &[Card]| {
        let board: [Card; 4] = cards[2..].try_into().expect("four board cards");
        let river_of =
            |hole: [Card; 2], board: &[Card; 5]| lookup(&indexers[3], river_hs, hole, board);
        histogram(&turn_counts([cards[0], cards[1]], &board, river_of))
    }
}

pub(crate) fn turn_table(
    indexers: &[HandIndexer; 4],
    river_hs: &[f32],
    centroids: &[f32],
    threads: usize,
) -> Vec<u8> {
    let job = turn_job(indexers, (centroids.len() / BINS) as u16, threads);
    stream_assign(&job, centroids, &turn_feature(indexers, river_hs))
}

fn lookup(river: &HandIndexer, river_hs: &[f32], hole: [Card; 2], board: &[Card; 5]) -> f32 {
    let mut seven = [0 as Card; 7];
    seven[..2].copy_from_slice(&hole);
    seven[2..].copy_from_slice(board);
    river_hs[river.index(&seven) as usize]
}

fn write_table(
    out: &Path,
    name: &str,
    street: Street,
    buckets: u16,
    table: &[u8],
) -> Result<(), String> {
    let path = out.join(name);
    let error = |e: std::io::Error| format!("cannot write {}: {e}", path.display());
    let mut writer = BufWriter::new(File::create(&path).map_err(error)?);
    writer
        .write_all(&encode_table(street, buckets, &[]))
        .map_err(error)?;
    writer.write_all(table).map_err(error)?;
    writer.flush().map_err(error)?;
    println!(
        "wrote {name}: {} bytes",
        encode_table(street, buckets, &[]).len() + table.len()
    );
    Ok(())
}

fn preflop_counts(indexers: &[HandIndexer; 4], river_hs: &[f32], threads: usize) -> Vec<u32> {
    let river = &indexers[3];
    let parts = map_ranges(river_hs.len(), RIVER_RANGE, threads, |range| {
        let mut counts = vec![0u32; PREFLOP_CLASSES * BINS];
        for i in range {
            let cards = river.unindex(1, i as u64);
            let pre = indexers[0].index(&cards[..2]) as usize;
            counts[pre * BINS + bin_of(river_hs[i])] += river.class_weight(1, i as u64);
        }
        counts
    });
    let mut counts = vec![0u32; PREFLOP_CLASSES * BINS];
    for part in parts {
        for (c, p) in counts.iter_mut().zip(part) {
            *c += p;
        }
    }
    counts
}

fn opponent_clusters(indexers: &[HandIndexer; 4], river_hs: &[f32], threads: usize) -> [u8; 169] {
    println!("preflop: river strength histograms of {PREFLOP_CLASSES} classes");
    let counts = preflop_counts(indexers, river_hs, threads);
    let points: Vec<f32> = counts
        .as_chunks::<BINS>()
        .0
        .iter()
        .flat_map(histogram)
        .collect();
    let weights: Vec<u32> = (0..PREFLOP_CLASSES as u64)
        .map(|c| indexers[0].class_weight(0, c))
        .collect();
    let centroids = kmeans(
        &points,
        BINS,
        &weights,
        CLUSTERS,
        Metric::Emd,
        CLUSTER_SEED,
        threads,
    );
    let labels = assign(&points, BINS, &centroids, Metric::Emd, threads);
    println!("preflop: {CLUSTERS} opponent clusters {labels:?}");
    labels.try_into().expect("169 preflop classes")
}

fn river_sample(river: &HandIndexer, clusters: &[u8; 169], threads: usize) -> (Vec<f32>, Vec<u32>) {
    let boards = board_indexer(5);
    let board_count = boards.size(0) as usize;
    let stride = board_count.div_ceil(MAX_SAMPLE / HOLES_PER_BOARD);
    let sampled: Vec<usize> = (0..board_count).step_by(stride).collect();
    let parts = map_ranges(sampled.len(), BOARD_RANGE, threads, |range| {
        let mut points = Vec::new();
        let mut weights = Vec::new();
        for k in range {
            let mut features = river_ochs(&canonical_board(&boards, sampled[k]), clusters);
            features.sort_by_key(|f| f.0);
            features.dedup_by_key(|f| f.0);
            for (index, feature) in features {
                points.extend_from_slice(&feature);
                weights.push(river.class_weight(1, index));
            }
        }
        (points, weights)
    });
    let mut points = Vec::new();
    let mut weights = Vec::new();
    for (p, w) in parts {
        points.extend(p);
        weights.extend(w);
    }
    println!(
        "river: sample of {} classes from {} of {board_count} boards",
        weights.len(),
        sampled.len()
    );
    (points, weights)
}

fn river_buckets(
    river: &HandIndexer,
    clusters: &[u8; 169],
    buckets: u16,
    threads: usize,
) -> Result<(Vec<f32>, Vec<u8>), String> {
    let (points, weights) = river_sample(river, clusters, threads);
    println!("river: k-means into {buckets} buckets");
    let centroids = kmeans(
        &points,
        RIVER_DIMENSION,
        &weights,
        buckets as usize,
        Metric::L2,
        RIVER_SEED,
        threads,
    );
    drop(points);
    let table = river_table(river, clusters, &centroids, threads)?;
    Ok((centroids, table))
}

pub(crate) fn river_table(
    river: &HandIndexer,
    clusters: &[u8; 169],
    centroids: &[f32],
    threads: usize,
) -> Result<Vec<u8>, String> {
    let boards = board_indexer(5);
    let cells: Vec<AtomicU16> = (0..river.size(1)).map(|_| AtomicU16::new(UNSET)).collect();
    parallel_chunks("river buckets", boards.size(0) as usize, threads, |range| {
        for b in range {
            for (index, feature) in river_ochs(&canonical_board(&boards, b), clusters) {
                let label = nearest(Metric::L2, centroids, RIVER_DIMENSION, &feature);
                cells[index as usize].store(label, Ordering::Relaxed);
            }
        }
    });
    let mut table = Vec::with_capacity(cells.len());
    for (i, cell) in cells.into_iter().enumerate() {
        match cell.into_inner() {
            UNSET => return Err(format!("river class {i} was never assigned")),
            label => table.push(label as u8),
        }
    }
    Ok(table)
}

fn features<F>(street: &StreetJob, indices: &[u64], feature: &F) -> Vec<f32>
where
    F: Fn(&[Card]) -> [f32; BINS] + Sync,
{
    let mut points = vec![0.0f32; indices.len() * BINS];
    map_chunks_mut(&mut points, ROWS * BINS, street.threads, |chunk, slice| {
        for (j, row) in slice.as_chunks_mut::<BINS>().0.iter_mut().enumerate() {
            let cards = street.indexer.unindex(1, indices[chunk * ROWS + j]);
            row.copy_from_slice(&feature(&cards));
        }
    });
    points
}

fn weights(street: &StreetJob, indices: &[u64]) -> Vec<u32> {
    let mut weights = vec![0u32; indices.len()];
    map_chunks_mut(&mut weights, ROWS, street.threads, |chunk, slice| {
        for (j, w) in slice.iter_mut().enumerate() {
            *w = street.indexer.class_weight(1, indices[chunk * ROWS + j]);
        }
    });
    weights
}

fn stream_assign<F>(street: &StreetJob, centroids: &[f32], feature: &F) -> Vec<u8>
where
    F: Fn(&[Card]) -> [f32; BINS] + Sync,
{
    let mut table = vec![0u8; street.indexer.size(1) as usize];
    map_chunks_mut(&mut table, ROWS, street.threads, |chunk, slice| {
        for (j, label) in slice.iter_mut().enumerate() {
            let cards = street.indexer.unindex(1, (chunk * ROWS + j) as u64);
            *label = nearest(Metric::Emd, centroids, BINS, &feature(&cards)) as u8;
        }
    });
    table
}

fn street_buckets<F>(street: &StreetJob, feature: F) -> (Vec<f32>, Vec<u8>)
where
    F: Fn(&[Card]) -> [f32; BINS] + Sync,
{
    let count = street.indexer.size(1) as usize;
    let indices: Vec<u64> = (0..count as u64)
        .step_by(count.div_ceil(MAX_SAMPLE))
        .collect();
    println!(
        "{}: features of {} of {count} classes",
        street.name,
        indices.len()
    );
    let points = features(street, &indices, &feature);
    let weights = weights(street, &indices);
    println!("{}: k-means into {} buckets", street.name, street.buckets);
    let centroids = kmeans(
        &points,
        BINS,
        &weights,
        street.buckets as usize,
        Metric::Emd,
        street.seed,
        street.threads,
    );
    let table = if indices.len() == count {
        assign(&points, BINS, &centroids, Metric::Emd, street.threads)
    } else {
        drop(points);
        println!("{}: assigning all {count} classes", street.name);
        stream_assign(street, &centroids, &feature)
    };
    (centroids, table)
}

#[cfg(test)]
pub mod tests {
    use crate::buckets::{run, BucketsArgs};
    use mallorca_core::abstraction::decode_table;
    use mallorca_core::cards::parse_cards;
    use mallorca_core::centroids::Centroids;
    use mallorca_core::iso::street_indexers;
    use mallorca_core::tree::Street;
    use std::path::{Path, PathBuf};
    use std::sync::OnceLock;

    const PRESET: &str = include_str!("../../../presets/tiny-potential.toml");

    pub fn tiny_potential() -> &'static Path {
        static DIR: OnceLock<PathBuf> = OnceLock::new();
        DIR.get_or_init(|| {
            let dir =
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/tmp/trainer-potential");
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let threads = std::thread::available_parallelism().map_or(2, |n| n.get());
            let preset = dir.join("tiny-potential.toml");
            std::fs::write(
                &preset,
                PRESET.replace("threads = 2", &format!("threads = {threads}")),
            )
            .unwrap();
            run(&BucketsArgs {
                preset,
                out: dir.clone(),
            })
            .unwrap();
            dir
        })
    }

    fn bucket_of(table: &[u8], indexer: &mallorca_core::iso::HandIndexer, cards: &str) -> u8 {
        table[indexer.index(&parse_cards(cards).unwrap()) as usize]
    }

    #[test]
    #[ignore]
    fn potential_buckets_on_tiny() {
        let dir = tiny_potential();
        let indexers = street_indexers();
        let mut tables = Vec::new();
        for (name, street, indexer) in [
            ("flop.bkt", Street::Flop, &indexers[1]),
            ("turn.bkt", Street::Turn, &indexers[2]),
            ("river.bkt", Street::River, &indexers[3]),
        ] {
            let (header, table) = decode_table(std::fs::read(dir.join(name)).unwrap()).unwrap();
            assert_eq!((header.street, header.buckets), (street, 8), "{name}");
            assert_eq!(table.len() as u64, indexer.size(1), "{name}");
            let mut used = [false; 8];
            for &b in &table {
                assert!(b < 8, "{name}: bucket {b}");
                used[b as usize] = true;
            }
            assert_eq!(used, [true; 8], "{name}");
            tables.push(table);
        }
        let river_hs = std::fs::metadata(dir.join("river_hs.f32")).unwrap().len();
        assert_eq!(river_hs, indexers[3].size(1) * 4);
        let centroids =
            Centroids::decode(&std::fs::read(dir.join("centroids.bin")).unwrap()).unwrap();
        assert_eq!(centroids.turn.len(), 8 * 50);
        assert_eq!(centroids.river.len(), 8 * 8);
        let draw = bucket_of(&tables[1], &indexers[2], "Qh 5h Jh Th 3c 2d");
        let pair = bucket_of(&tables[1], &indexers[2], "2c 5s Jh Th 3c 2d");
        assert_ne!(
            draw, pair,
            "flush draw and weak pair share turn bucket {draw}"
        );
    }
}
