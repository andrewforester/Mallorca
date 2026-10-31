use crate::abstraction::{aggregate_squares, LIVE_OPPONENTS};
use crate::cards::Card;
use crate::eval::rank;
use crate::iso::street_indexer;
use crate::tree::Street;

pub fn percentile_thresholds(values: &[f32], buckets: u16) -> Vec<f32> {
    assert!((1..=256).contains(&buckets));
    let mut sorted = values.to_vec();
    sorted.sort_unstable_by(f32::total_cmp);
    let n = sorted.len();
    (1..buckets as usize)
        .map(|b| sorted[(b * n / buckets as usize).min(n - 1)])
        .collect()
}

pub fn bucket_of(thresholds: &[f32], value: f32) -> u16 {
    thresholds.partition_point(|&t| t <= value) as u16
}

pub fn river_hs(hole: [Card; 2], board: &[Card; 5]) -> f32 {
    let mut seven = [0 as Card; 7];
    seven[..2].copy_from_slice(&hole);
    seven[2..].copy_from_slice(board);
    let mine = rank(&seven);
    let live: Vec<Card> = (0..52u8).filter(|c| !seven.contains(c)).collect();
    let mut theirs = seven;
    let mut wins = 0usize;
    let mut ties = 0usize;
    for i in 0..live.len() {
        for j in (i + 1)..live.len() {
            theirs[0] = live[i];
            theirs[1] = live[j];
            let r = rank(&theirs);
            if r < mine {
                wins += 1;
            } else if r == mine {
                ties += 1;
            }
        }
    }
    (wins as f32 + 0.5 * ties as f32) / LIVE_OPPONENTS
}

pub fn turn_value(hole: [Card; 2], board: &[Card; 4]) -> f32 {
    let mut six = [0 as Card; 6];
    six[..2].copy_from_slice(&hole);
    six[2..].copy_from_slice(board);
    let indexer = street_indexer(Street::Turn);
    let canonical = indexer.unindex(1, indexer.index(&six));
    aggregate_squares(canonical, |c| {
        river_hs([c[0], c[1]], c[2..7].try_into().expect("five board cards"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::abstraction::{aggregate_hs2, percentile_buckets, river_strength};
    use crate::iso::street_indexers;
    use crate::rng::Rng;
    use crate::tree::Street;
    use std::collections::HashMap;

    fn deal(rng: &mut Rng, n: usize) -> Vec<Card> {
        let mut deck: Vec<Card> = (0..52).collect();
        rng.shuffle(&mut deck);
        deck.truncate(n);
        deck
    }

    #[test]
    fn river_hs_is_bit_identical_to_river_strength() {
        let indexers = street_indexers();
        let mut rng = Rng::new(17);
        for _ in 0..40 {
            let cards = deal(&mut rng, 7);
            let board: [Card; 5] = cards[2..7].try_into().unwrap();
            let by_index: HashMap<u64, f32> = river_strength(&board).into_iter().collect();
            let expected = by_index[&indexers[3].index(&cards)];
            let got = river_hs([cards[0], cards[1]], &board);
            assert_eq!(got.to_bits(), expected.to_bits(), "{got} vs {expected}");
        }
    }

    #[test]
    fn turn_value_is_bit_identical_to_aggregate_hs2() {
        let indexers = street_indexers();
        let mut rng = Rng::new(23);
        for _ in 0..3 {
            let cards = deal(&mut rng, 6);
            let index = indexers[2].index(&cards);
            let canonical = indexers[2].unindex(1, index);
            let mut next = vec![0.0f32; indexers[3].size(1) as usize];
            for c in 0..52u8 {
                if canonical.contains(&c) {
                    continue;
                }
                let mut board: Vec<Card> = canonical[2..].to_vec();
                board.push(c);
                let board: [Card; 5] = board.try_into().unwrap();
                for (i, hs) in river_strength(&board) {
                    next[i as usize] = hs;
                }
            }
            let expected = aggregate_hs2(indexers, Street::Turn, index, &next);
            let got = turn_value([cards[0], cards[1]], &cards[2..6].try_into().unwrap());
            assert_eq!(got.to_bits(), expected.to_bits(), "{got} vs {expected}");
        }
    }

    #[test]
    fn thresholds_reproduce_percentile_buckets() {
        let mut rng = Rng::new(5);
        let values: Vec<f32> = (0..5000).map(|_| rng.below(997) as f32 / 997.0).collect();
        for buckets in [1u16, 8, 128, 256] {
            let thresholds = percentile_thresholds(&values, buckets);
            assert_eq!(thresholds.len(), usize::from(buckets) - 1);
            let table = percentile_buckets(&values, buckets);
            for (&v, &b) in values.iter().zip(&table) {
                assert_eq!(bucket_of(&thresholds, v), u16::from(b));
            }
        }
    }

    #[test]
    fn stronger_river_hands_have_higher_strength() {
        let board: [Card; 5] = crate::cards::parse_cards("2c 7d 9h Js Kc")
            .unwrap()
            .try_into()
            .unwrap();
        let aces = crate::cards::parse_cards("As Ad").unwrap();
        let trash = crate::cards::parse_cards("3c 4d").unwrap();
        assert!(river_hs([aces[0], aces[1]], &board) > river_hs([trash[0], trash[1]], &board));
    }
}
