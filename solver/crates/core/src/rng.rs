pub struct Rng {
    s: [u64; 4],
}

pub fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let mut sm = seed;
        let s = [
            splitmix64(&mut sm),
            splitmix64(&mut sm),
            splitmix64(&mut sm),
            splitmix64(&mut sm),
        ];
        Rng { s }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[0]
            .wrapping_add(self.s[3])
            .rotate_left(23)
            .wrapping_add(self.s[0]);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    pub fn below(&mut self, n: u32) -> u32 {
        debug_assert!(n > 0);
        let mut x = self.next_u64() as u32;
        let mut m = (x as u64) * (n as u64);
        let mut low = m as u32;
        if low < n {
            let threshold = n.wrapping_neg() % n;
            while low < threshold {
                x = self.next_u64() as u32;
                m = (x as u64) * (n as u64);
                low = m as u32;
            }
        }
        (m >> 32) as u32
    }

    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i as u32 + 1) as usize;
            items.swap(i, j);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_outputs_are_stable() {
        let mut r = Rng::new(1);
        let got = [r.next_u64(), r.next_u64(), r.next_u64()];
        assert_eq!(
            got,
            [
                14971601782005023387,
                13781649495232077965,
                1847458086238483744
            ]
        );
    }

    #[test]
    fn next_f64_in_unit_interval() {
        let mut r = Rng::new(7);
        for _ in 0..10_000 {
            let x = r.next_f64();
            assert!((0.0..1.0).contains(&x));
        }
    }

    #[test]
    fn below_hits_every_value() {
        let mut r = Rng::new(3);
        let mut seen = [false; 10];
        for _ in 0..1000 {
            let v = r.below(10);
            assert!(v < 10);
            seen[v as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }

    #[test]
    fn shuffle_is_a_permutation_and_seeded() {
        let make = |seed| {
            let mut v: Vec<u32> = (0..52).collect();
            Rng::new(seed).shuffle(&mut v);
            v
        };
        let a = make(1);
        let mut sorted = a.clone();
        sorted.sort();
        assert_eq!(sorted, (0..52).collect::<Vec<u32>>());
        assert_eq!(a, make(1));
        assert_ne!(a, make(2));
    }
}
