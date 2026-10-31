use crate::schedule::{Claim, Schedule};
use mallorca_core::cfr::{iterate, Game, Storage};
use mallorca_core::preset::CfrParams;
use mallorca_core::rng::{splitmix64, Rng};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;

pub const PAUSE_POLL: Duration = Duration::from_millis(1);

pub fn worker_seed(seed: u64, worker: u64, start: u64) -> u64 {
    let mut state = seed;
    let mut state = splitmix64(&mut state) ^ worker;
    let mut state = splitmix64(&mut state) ^ start;
    splitmix64(&mut state)
}

pub struct Shared<'a, G: Game> {
    pub game: &'a G,
    pub storage: &'a Storage,
    pub cfr: &'a CfrParams,
    pub schedule: &'a Schedule,
    pub halt: &'a AtomicBool,
    pub pause: &'a AtomicBool,
    pub idle: &'a AtomicUsize,
}

pub fn work<G: Game>(s: &Shared<'_, G>, rng: &mut Rng) {
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

pub struct Finished<'a> {
    pub count: &'a AtomicUsize,
    pub halt: &'a AtomicBool,
}

impl Drop for Finished<'_> {
    fn drop(&mut self) {
        if std::thread::panicking() {
            self.halt.store(true, Ordering::Relaxed);
        }
        self.count.fetch_add(1, Ordering::AcqRel);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
