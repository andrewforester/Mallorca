use std::ops::Range;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::time::Instant;

const CHUNK: usize = 512;

fn for_chunks<F>(total: usize, threads: usize, work: F)
where
    F: Fn(Range<usize>) + Sync,
{
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..threads.max(1) {
            scope.spawn(|| loop {
                let from = next.fetch_add(CHUNK, Ordering::Relaxed);
                if from >= total {
                    break;
                }
                work(from..(from + CHUNK).min(total));
            });
        }
    });
}

pub(crate) fn parallel_chunks<F>(label: &str, total: usize, threads: usize, work: F)
where
    F: Fn(Range<usize>) + Sync,
{
    let done = AtomicUsize::new(0);
    let printed = AtomicUsize::new(0);
    let start = Instant::now();
    for_chunks(total, threads, |range| {
        let size = range.len();
        work(range);
        let finished = done.fetch_add(size, Ordering::Relaxed) + size;
        let step = finished * 20 / total;
        if printed.fetch_max(step, Ordering::Relaxed) < step {
            println!(
                "{label}: {}% ({:.0}s)",
                step * 5,
                start.elapsed().as_secs_f64()
            );
        }
    });
}

pub(crate) fn atomic_cells(n: usize, value: f32) -> Vec<AtomicU32> {
    (0..n).map(|_| AtomicU32::new(value.to_bits())).collect()
}
