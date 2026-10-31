use super::{river_indexer, river_strength, Abstraction, BucketSource};
use crate::cards::Card;
use crate::pairs::{pair_index, PAIRS};
use crate::potential::{histogram, nearest, river_ochs, turn_counts, Metric};
use crate::strength::{bucket_of, turn_value_with};
use crate::tree::Street;
use std::collections::HashMap;

const NONE: u16 = u16::MAX;

#[derive(Default)]
struct RiverMemo {
    hs: HashMap<u64, f32>,
}

impl RiverMemo {
    fn value(&mut self, hole: [Card; 2], board: &[Card; 5]) -> f32 {
        let mut seven = [0 as Card; 7];
        seven[..2].copy_from_slice(&hole);
        seven[2..].copy_from_slice(board);
        let index = river_indexer().index(&seven);
        if let Some(&v) = self.hs.get(&index) {
            return v;
        }
        self.hs.extend(river_strength(board));
        self.hs[&index]
    }
}

fn live_pairs(board: &[Card]) -> Vec<[Card; 2]> {
    let live: Vec<Card> = (0..52u8).filter(|c| !board.contains(c)).collect();
    let mut out = Vec::with_capacity(live.len() * (live.len() - 1) / 2);
    for (i, &a) in live.iter().enumerate() {
        for &b in &live[i + 1..] {
            out.push([a, b]);
        }
    }
    out
}

impl Abstraction {
    pub fn buckets(&self, street: Street, board: &[Card]) -> Vec<u16> {
        let mut out = vec![NONE; PAIRS];
        let pairs = live_pairs(board);
        let live = self
            .source(street)
            .filter(|s| !matches!(s, BucketSource::Table(_)));
        let values: Vec<u16> = match (street, live) {
            (Street::Turn, Some(source)) => self.turn_buckets(source, &pairs, board),
            (Street::River, Some(source)) => river_buckets(source, &pairs, board),
            _ => pairs
                .iter()
                .map(|&hole| self.bucket(street, hole, board))
                .collect(),
        };
        for (hole, bucket) in pairs.iter().zip(values) {
            out[pair_index(hole[0], hole[1])] = bucket;
        }
        out
    }

    fn source(&self, street: Street) -> Option<&BucketSource> {
        match street {
            Street::Preflop => None,
            _ => Some(&self.sources[street.as_index() - 1]),
        }
    }

    fn turn_buckets(&self, source: &BucketSource, pairs: &[[Card; 2]], board: &[Card]) -> Vec<u16> {
        let turn: &[Card; 4] = board.try_into().expect("four board cards");
        let mut memo = RiverMemo::default();
        let mut by_class: HashMap<u64, u16> = HashMap::new();
        let mut cards = [0 as Card; 6];
        cards[2..].copy_from_slice(turn);
        pairs
            .iter()
            .map(|&hole| {
                cards[..2].copy_from_slice(&hole);
                let class = self.indexers[Street::Turn.as_index()].index(&cards);
                *by_class.entry(class).or_insert_with(|| match source {
                    BucketSource::Thresholds(t) => {
                        bucket_of(t, turn_value_with(hole, turn, |h, b| memo.value(h, b)))
                    }
                    BucketSource::Centroids {
                        centroids,
                        dimension,
                        ..
                    } => {
                        let counts = turn_counts(hole, turn, |h, b| memo.value(h, b));
                        nearest(Metric::Emd, centroids, *dimension, &histogram(&counts))
                    }
                    BucketSource::Table(_) => NONE,
                })
            })
            .collect()
    }
}

fn river_buckets(source: &BucketSource, pairs: &[[Card; 2]], board: &[Card]) -> Vec<u16> {
    let river: &[Card; 5] = board.try_into().expect("five board cards");
    let mut seven = [0 as Card; 7];
    seven[2..].copy_from_slice(river);
    let index_of = |hole: [Card; 2], seven: &mut [Card; 7]| {
        seven[..2].copy_from_slice(&hole);
        river_indexer().index(seven)
    };
    match source {
        BucketSource::Thresholds(t) => {
            let hs: HashMap<u64, f32> = river_strength(river).into_iter().collect();
            pairs
                .iter()
                .map(|&hole| bucket_of(t, hs[&index_of(hole, &mut seven)]))
                .collect()
        }
        BucketSource::Centroids {
            centroids,
            dimension,
            clusters,
        } => {
            let ochs: HashMap<u64, _> = river_ochs(river, clusters).into_iter().collect();
            pairs
                .iter()
                .map(|&hole| {
                    let feature = &ochs[&index_of(hole, &mut seven)];
                    nearest(Metric::L2, centroids, *dimension, feature)
                })
                .collect()
        }
        BucketSource::Table(_) => vec![NONE; pairs.len()],
    }
}
