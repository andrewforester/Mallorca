use std::sync::atomic::{AtomicU64, Ordering};

pub enum Claim {
    Run(u64),
    Wait,
    Done,
}

pub struct Schedule {
    claimed: AtomicU64,
    completed: AtomicU64,
    gate: AtomicU64,
    end: u64,
    interval: u64,
}

impl Schedule {
    pub fn new(start: u64, end: u64, interval: u64) -> Schedule {
        let gate = (start / interval)
            .saturating_add(1)
            .saturating_mul(interval);
        Schedule {
            claimed: AtomicU64::new(start),
            completed: AtomicU64::new(start),
            gate: AtomicU64::new(gate),
            end,
            interval,
        }
    }

    pub fn claim(&self) -> Claim {
        let mut c = self.claimed.load(Ordering::Acquire);
        loop {
            if c >= self.end {
                return Claim::Done;
            }
            if c >= self.gate.load(Ordering::Acquire) {
                return Claim::Wait;
            }
            match self
                .claimed
                .compare_exchange_weak(c, c + 1, Ordering::AcqRel, Ordering::Acquire)
            {
                Ok(_) => return Claim::Run(c),
                Err(seen) => c = seen,
            }
        }
    }

    pub fn complete(&self, discount: impl FnOnce(u64)) {
        let done = self.completed.fetch_add(1, Ordering::AcqRel) + 1;
        if done.is_multiple_of(self.interval) {
            discount(done / self.interval);
            self.gate
                .store(done.saturating_add(self.interval), Ordering::Release);
        }
    }

    pub fn completed(&self) -> u64 {
        self.completed.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct Seen {
        boundary: u64,
        finished: u64,
        highest_started: u64,
    }

    fn drive(start: u64, end: u64, interval: u64, threads: usize) -> Vec<Seen> {
        let schedule = Schedule::new(start, end, interval);
        let finished = AtomicU64::new(start);
        let highest = AtomicU64::new(0);
        let seen = Mutex::new(Vec::new());
        std::thread::scope(|scope| {
            for _ in 0..threads {
                scope.spawn(|| loop {
                    match schedule.claim() {
                        Claim::Done => break,
                        Claim::Wait => std::thread::yield_now(),
                        Claim::Run(i) => {
                            highest.fetch_max(i, Ordering::SeqCst);
                            std::thread::yield_now();
                            finished.fetch_add(1, Ordering::SeqCst);
                            schedule.complete(|k| {
                                std::thread::yield_now();
                                seen.lock().unwrap().push(Seen {
                                    boundary: k * interval,
                                    finished: finished.load(Ordering::SeqCst),
                                    highest_started: highest.load(Ordering::SeqCst),
                                });
                            });
                        }
                    }
                });
            }
        });
        assert_eq!(schedule.completed(), end);
        assert_eq!(finished.load(Ordering::SeqCst), end);
        seen.into_inner().unwrap()
    }

    fn check(start: u64, end: u64, interval: u64, threads: usize) {
        let seen = drive(start, end, interval, threads);
        let expected: Vec<u64> = (start / interval + 1..=end / interval)
            .map(|k| k * interval)
            .collect();
        let boundaries: Vec<u64> = seen.iter().map(|s| s.boundary).collect();
        assert_eq!(boundaries, expected, "threads {threads}");
        for s in &seen {
            assert_eq!(s.finished, s.boundary, "threads {threads}");
            assert_eq!(s.highest_started, s.boundary - 1, "threads {threads}");
        }
    }

    #[test]
    fn each_boundary_is_discounted_once_after_exactly_its_iterations() {
        for threads in [1, 2, 8] {
            check(0, 2000, 10, threads);
        }
    }

    #[test]
    fn a_resumed_run_discounts_from_the_next_boundary() {
        for threads in [1, 4] {
            check(1500, 4321, 100, threads);
            check(2000, 2500, 100, threads);
        }
    }

    #[test]
    fn no_iteration_is_claimed_past_the_end() {
        let schedule = Schedule::new(0, 3, 10);
        let claims: Vec<u64> = (0..3)
            .map(|_| match schedule.claim() {
                Claim::Run(i) => i,
                _ => panic!("expected a claim"),
            })
            .collect();
        assert_eq!(claims, [0, 1, 2]);
        assert!(matches!(schedule.claim(), Claim::Done));
    }

    #[test]
    fn the_next_boundary_waits_for_its_discount() {
        let schedule = Schedule::new(0, 10, 2);
        let (Claim::Run(a), Claim::Run(b)) = (schedule.claim(), schedule.claim()) else {
            panic!("expected two claims");
        };
        assert_eq!((a, b), (0, 1));
        assert!(matches!(schedule.claim(), Claim::Wait));
        let mut discounted = Vec::new();
        schedule.complete(|k| discounted.push(k));
        assert!(matches!(schedule.claim(), Claim::Wait));
        schedule.complete(|k| discounted.push(k));
        assert_eq!(discounted, [1]);
        assert!(matches!(schedule.claim(), Claim::Run(2)));
    }
}
