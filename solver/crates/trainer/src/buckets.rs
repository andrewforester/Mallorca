use crate::parallel::{atomic_cells, parallel_chunks};
use crate::potential;
use crate::tree::load_preset;
use clap::Args;
use mallorca_core::abstraction::{aggregate_hs2, encode_table, percentile_buckets, river_strength};
use mallorca_core::cards::Card;
use mallorca_core::iso::{board_indexer, street_indexers, HandIndexer};
use mallorca_core::preset::{Bucketing, Preset};
use mallorca_core::tree::Street;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Instant;

#[derive(Args)]
pub struct BucketsArgs {
    #[arg(long)]
    pub preset: PathBuf,
    #[arg(long)]
    pub out: PathBuf,
}

fn into_floats(cells: Vec<AtomicU32>) -> Vec<f32> {
    cells
        .into_iter()
        .map(|c| f32::from_bits(c.into_inner()))
        .collect()
}

pub(crate) fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

pub(crate) fn write_floats(path: &Path, values: &[f32]) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    let mut writer = BufWriter::new(file);
    for chunk in values.chunks(1 << 16) {
        let mut buf = Vec::with_capacity(chunk.len() * 4);
        for v in chunk {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        writer
            .write_all(&buf)
            .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    }
    writer
        .flush()
        .map_err(|e| format!("cannot write {}: {e}", path.display()))
}

pub fn turn_values(indexers: &[HandIndexer; 4], river_hs: &[f32], threads: usize) -> Vec<f32> {
    let turn_count = indexers[2].size(1) as usize;
    let turn_cells = atomic_cells(turn_count, 0.0);
    parallel_chunks("turn", turn_count, threads, |range| {
        for i in range {
            let v = aggregate_hs2(indexers, Street::Turn, i as u64, river_hs);
            turn_cells[i].store(v.to_bits(), Ordering::Relaxed);
        }
    });
    into_floats(turn_cells)
}

pub(crate) fn canonical_board(boards: &HandIndexer, b: usize) -> [Card; 5] {
    boards
        .unindex(0, b as u64)
        .try_into()
        .expect("five board cards")
}

pub(crate) fn river_pass(indexers: &[HandIndexer; 4], threads: usize) -> Result<Vec<f32>, String> {
    let boards = board_indexer(5);
    let board_count = boards.size(0) as usize;
    let river_count = indexers[3].size(1) as usize;
    println!("river: {board_count} canonical boards, {river_count} classes, {threads} threads");
    let river_cells = atomic_cells(river_count, f32::NAN);
    parallel_chunks("river", board_count, threads, |range| {
        for b in range {
            for (index, hs) in river_strength(&canonical_board(&boards, b)) {
                river_cells[index as usize].store(hs.to_bits(), Ordering::Relaxed);
            }
        }
    });
    let river_hs = into_floats(river_cells);
    if let Some(missing) = river_hs.iter().position(|v| v.is_nan()) {
        return Err(format!("river class {missing} was never computed"));
    }
    Ok(river_hs)
}

pub fn run(args: &BucketsArgs) -> Result<(), String> {
    let preset = load_preset(&args.preset)?;
    std::fs::create_dir_all(&args.out)
        .map_err(|e| format!("cannot create {}: {e}", args.out.display()))?;
    match preset.bucketing {
        Bucketing::Hs2 => run_hs2(&preset, &args.out),
        Bucketing::Potential => potential::run(&preset, &args.out),
    }
}

fn run_hs2(preset: &Preset, out: &Path) -> Result<(), String> {
    let threads = preset.threads;
    let started = Instant::now();
    let indexers = street_indexers();
    let turn_count = indexers[2].size(1) as usize;
    let flop_count = indexers[1].size(1) as usize;
    let river_hs = river_pass(indexers, threads)?;

    println!("turn: {turn_count} classes");
    let turn_values = turn_values(indexers, &river_hs, threads);

    println!("flop: {flop_count} classes");
    let flop_cells = atomic_cells(flop_count, 0.0);
    parallel_chunks("flop", flop_count, threads, |range| {
        for i in range {
            let v = aggregate_hs2(indexers, Street::Flop, i as u64, &turn_values);
            flop_cells[i].store(v.to_bits(), Ordering::Relaxed);
        }
    });
    let flop_values = into_floats(flop_cells);

    let tables = [
        ("flop.bkt", Street::Flop, &flop_values, preset.buckets[0]),
        ("turn.bkt", Street::Turn, &turn_values, preset.buckets[1]),
        ("river.bkt", Street::River, &river_hs, preset.buckets[2]),
    ];
    for (name, street, values, buckets) in tables {
        let table = encode_table(street, buckets, &percentile_buckets(values, buckets));
        write_bytes(&out.join(name), &table)?;
        println!("wrote {name}: {} bytes", table.len());
    }
    write_floats(&out.join("river_hs.f32"), &river_hs)?;
    println!("wrote river_hs.f32: {} bytes", river_hs.len() * 4);
    println!("total {:.1}s", started.elapsed().as_secs_f64());
    Ok(())
}
