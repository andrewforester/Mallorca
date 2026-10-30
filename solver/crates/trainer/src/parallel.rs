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

#[cfg(test)]
pub(crate) fn map_chunks_mut<T, R, F>(
    data: &mut [T],
    size: usize,
    threads: usize,
    work: F,
) -> Vec<R>
where
    T: Send,
    R: Send,
    F: Fn(usize, &mut [T]) -> R + Sync,
{
    let count = data.len().div_ceil(size);
    let queue = std::sync::Mutex::new(data.chunks_mut(size).enumerate());
    let results: std::sync::Mutex<Vec<Option<R>>> =
        std::sync::Mutex::new((0..count).map(|_| None).collect());
    std::thread::scope(|scope| {
        for _ in 0..threads.clamp(1, count.max(1)) {
            scope.spawn(|| loop {
                let next = queue.lock().expect("chunk queue").next();
                let Some((index, chunk)) = next else {
                    break;
                };
                let result = work(index, chunk);
                results.lock().expect("chunk results")[index] = Some(result);
            });
        }
    });
    results
        .into_inner()
        .expect("chunk results")
        .into_iter()
        .map(|r| r.expect("every chunk ran"))
        .collect()
}

pub(crate) fn atomic_cells(n: usize, value: f32) -> Vec<AtomicU32> {
    (0..n).map(|_| AtomicU32::new(value.to_bits())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_chunks_mut_keeps_chunk_order_for_any_thread_count() {
        for threads in [1, 3, 8] {
            let mut data: Vec<u32> = (0..10).collect();
            let sums = map_chunks_mut(&mut data, 4, threads, |index, chunk| {
                for v in chunk.iter_mut() {
                    *v *= 2;
                }
                (index, chunk.iter().sum::<u32>())
            });
            assert_eq!(sums, vec![(0, 12), (1, 44), (2, 34)]);
            assert_eq!(data, (0..10).map(|v| v * 2).collect::<Vec<u32>>());
        }
    }

    #[test]
    fn map_chunks_mut_on_empty_data_returns_nothing() {
        let mut data: Vec<u32> = Vec::new();
        let out: Vec<()> = map_chunks_mut(&mut data, 4, 4, |_, _| ());
        assert!(out.is_empty());
    }
}
