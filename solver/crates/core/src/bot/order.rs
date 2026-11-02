use crate::iso::street_indexers;

pub(super) struct Order {
    sorted: Vec<u16>,
    ascending: Vec<f64>,
    of: Vec<f64>,
}

impl Order {
    pub(super) fn by_strength(strength: &[f64], mass: &[f64]) -> Order {
        let mut sorted: Vec<u16> = (0..strength.len() as u16).collect();
        sorted.sort_by(|&a, &b| strength[usize::from(a)].total_cmp(&strength[usize::from(b)]));
        let total: f64 = mass.iter().sum();
        let mut of = vec![0.0; strength.len()];
        let mut ascending = Vec::with_capacity(strength.len());
        let mut below = 0.0;
        for &b in &sorted {
            let m = mass[usize::from(b)];
            let q = (below + m / 2.0) / total;
            of[usize::from(b)] = q;
            ascending.push(q);
            below += m;
        }
        Order {
            sorted,
            ascending,
            of,
        }
    }

    pub(super) fn uniform(buckets: u16) -> Order {
        let strength: Vec<f64> = (0..buckets).map(f64::from).collect();
        Order::by_strength(&strength, &vec![1.0; usize::from(buckets)])
    }

    pub(super) fn preflop() -> Order {
        let indexer = &street_indexers()[0];
        let strength: Vec<f64> = PREFLOP_EQUITY.iter().map(|&e| f64::from(e)).collect();
        let mass: Vec<f64> = (0..PREFLOP_EQUITY.len() as u64)
            .map(|c| f64::from(indexer.class_weight(0, c)))
            .collect();
        Order::by_strength(&strength, &mass)
    }

    pub(super) fn percentile(&self, bucket: u16) -> f64 {
        self.of.get(usize::from(bucket)).copied().unwrap_or(0.5)
    }

    pub(super) fn around(&self, q: f64) -> (u16, u16, f64) {
        let k = self.ascending.partition_point(|&p| p < q);
        if k == 0 {
            return (self.sorted[0], self.sorted[0], 0.0);
        }
        if k == self.sorted.len() {
            let last = self.sorted[k - 1];
            return (last, last, 0.0);
        }
        if self.ascending[k] == q {
            return (self.sorted[k], self.sorted[k], 0.0);
        }
        let (lo, hi) = (self.ascending[k - 1], self.ascending[k]);
        (self.sorted[k - 1], self.sorted[k], (q - lo) / (hi - lo))
    }

    pub(super) fn of_tree(buckets: [u16; 4]) -> [Order; 4] {
        [
            Order::preflop(),
            Order::uniform(buckets[1]),
            Order::uniform(buckets[2]),
            Order::uniform(buckets[3]),
        ]
    }
}

const PREFLOP_EQUITY: [f32; 169] = [
    0.5038, 0.3236, 0.5360, 0.3326, 0.3534, 0.5693, 0.3430, 0.3622, 0.3804, 0.6034, 0.3419, 0.3598,
    0.3800, 0.3990, 0.6337, 0.3463, 0.3665, 0.3850, 0.4050, 0.4234, 0.6617, 0.3686, 0.3777, 0.3940,
    0.4140, 0.4347, 0.4506, 0.6914, 0.3901, 0.3996, 0.4049, 0.4262, 0.4450, 0.4631, 0.4811, 0.7207,
    0.4174, 0.4255, 0.4348, 0.4429, 0.4606, 0.4798, 0.4976, 0.5147, 0.7488, 0.4438, 0.4526, 0.4625,
    0.4706, 0.4781, 0.4965, 0.5138, 0.5312, 0.5513, 0.7749, 0.4740, 0.4835, 0.4914, 0.5011, 0.5115,
    0.5162, 0.5363, 0.5537, 0.5731, 0.5815, 0.7991, 0.5055, 0.5137, 0.5225, 0.5335, 0.5432, 0.5517,
    0.5590, 0.5792, 0.5980, 0.6048, 0.6150, 0.8246, 0.5487, 0.5588, 0.5675, 0.5776, 0.5757, 0.5878,
    0.5975, 0.6072, 0.6270, 0.6360, 0.6433, 0.6523, 0.8526, 0.3576, 0.3688, 0.3865, 0.3791, 0.3970,
    0.4150, 0.3759, 0.3959, 0.4123, 0.4309, 0.3822, 0.4017, 0.4177, 0.4381, 0.4547, 0.4016, 0.4072,
    0.4281, 0.4455, 0.4635, 0.4785, 0.4238, 0.4325, 0.4385, 0.4570, 0.4741, 0.4907, 0.5055, 0.4489,
    0.4553, 0.4644, 0.4722, 0.4882, 0.5069, 0.5243, 0.5393, 0.4735, 0.4819, 0.4904, 0.5000, 0.5057,
    0.5239, 0.5405, 0.5566, 0.5762, 0.5007, 0.5097, 0.5197, 0.5268, 0.5367, 0.5421, 0.5588, 0.5753,
    0.5941, 0.6019, 0.5335, 0.5422, 0.5486, 0.5573, 0.5664, 0.5759, 0.5836, 0.6005, 0.6189, 0.6241,
    0.6330, 0.5740, 0.5839, 0.5915, 0.5993, 0.5993, 0.6108, 0.6189, 0.6270, 0.6452, 0.6548, 0.6628,
    0.6707,
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::{parse_cards, Card};
    use crate::eval::rank;
    use crate::rng::Rng;

    fn sampled_equity(samples: u32, seed: u64) -> Vec<f64> {
        let indexer = &street_indexers()[0];
        let mut rng = Rng::new(seed);
        (0..169u64)
            .map(|i| {
                let hole = indexer.unindex(0, i);
                let mut deck: Vec<Card> = (0..52).filter(|c| !hole.contains(c)).collect();
                let mut score = 0.0;
                for _ in 0..samples {
                    for k in 0..7 {
                        let j = k + rng.below((deck.len() - k) as u32) as usize;
                        deck.swap(k, j);
                    }
                    let mine = [
                        hole[0], hole[1], deck[2], deck[3], deck[4], deck[5], deck[6],
                    ];
                    let theirs = [
                        deck[0], deck[1], deck[2], deck[3], deck[4], deck[5], deck[6],
                    ];
                    let (a, b) = (rank(&mine), rank(&theirs));
                    score += if a > b {
                        1.0
                    } else if a == b {
                        0.5
                    } else {
                        0.0
                    };
                }
                score / f64::from(samples)
            })
            .collect()
    }

    #[test]
    fn uniform_percentiles_are_the_middles_of_equal_masses() {
        let order = Order::uniform(4);
        let p: Vec<f64> = (0..4).map(|b| order.percentile(b)).collect();
        assert_eq!(p, vec![0.125, 0.375, 0.625, 0.875]);
    }

    #[test]
    fn percentiles_follow_strength_and_mass() {
        let order = Order::by_strength(&[0.9, 0.1, 0.5], &[2.0, 1.0, 1.0]);
        assert_eq!(order.percentile(1), 0.125);
        assert_eq!(order.percentile(2), 0.375);
        assert_eq!(order.percentile(0), 0.75);
    }

    #[test]
    fn around_brackets_a_percentile_between_neighbours() {
        let order = Order::by_strength(&[0.9, 0.1, 0.5], &[2.0, 1.0, 1.0]);
        assert_eq!(order.around(0.375), (2, 2, 0.0));
        let (lo, hi, t) = order.around(0.5);
        assert_eq!((lo, hi), (2, 0));
        assert!((t - 0.125 / 0.375).abs() < 1e-12);
        assert_eq!(order.around(0.0), (1, 1, 0.0));
        assert_eq!(order.around(1.0), (0, 0, 0.0));
    }

    #[test]
    fn preflop_order_puts_aces_on_top_and_three_deuce_at_the_bottom() {
        let order = Order::preflop();
        let class = |s: &str| {
            let cards = parse_cards(s).unwrap();
            street_indexers()[0].index(&cards) as u16
        };
        let aces = order.percentile(class("Ac Ad"));
        let kings = order.percentile(class("Kc Kd"));
        let three_deuce = order.percentile(class("3c 2d"));
        let suited = order.percentile(class("3c 2c"));
        assert!(aces > 0.99 && aces > kings, "{aces} {kings}");
        assert!(three_deuce < 0.01, "{three_deuce}");
        assert!(suited > three_deuce);
        let total: f64 = (0..169)
            .map(|c| f64::from(street_indexers()[0].class_weight(0, c)))
            .sum();
        assert_eq!(total, 1326.0);
    }

    #[test]
    #[ignore]
    fn preflop_equity_table_matches_a_simulation() {
        let sampled = sampled_equity(40_000, 7);
        for (i, (&table, &sim)) in PREFLOP_EQUITY.iter().zip(&sampled).enumerate() {
            assert!(
                (f64::from(table) - sim).abs() < 0.01,
                "{i}: {table} vs {sim}"
            );
        }
    }
}
