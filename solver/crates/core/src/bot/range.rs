use super::bias::biased;
use super::{Bias, Bot, Model};
use crate::cards::Card;
use crate::pairs::{pair_cards, PAIRS};
use crate::tree::{NodeId, Street};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct Step {
    pub node: NodeId,
    pub action: usize,
    pub street: Street,
    pub board: Vec<Card>,
    pub bias: Bias,
}

impl Bot {
    pub fn history(&self) -> &[Step] {
        self.hand.as_ref().map_or(&[], |h| &h.history)
    }

    pub fn range(&self, model: &Model) -> Vec<f32> {
        let board = self.hand.as_ref().map_or(&[][..], |h| &h.board);
        range_of(model, self.history(), board)
    }

    pub fn opponent_range(&mut self, model: &Model) -> Vec<f32> {
        let Some(hand) = self.hand.as_mut() else {
            return range_of(model, &[], &[]);
        };
        let mut range = cached_range(model, &hand.opponent, &hand.board, &mut hand.buckets);
        if let Some(hole) = hand.hole {
            for (i, w) in range.iter_mut().enumerate() {
                let c = pair_cards(i);
                if hole.contains(&c[0]) || hole.contains(&c[1]) {
                    *w = 0.0;
                }
            }
        }
        range
    }
}

pub(crate) fn action_probability(model: &Model, node: NodeId, bucket: u16, action: usize) -> f32 {
    biased_probability(model, node, bucket, action, &Bias::NEUTRAL)
}

fn biased_probability(model: &Model, node: NodeId, bucket: u16, action: usize, bias: &Bias) -> f32 {
    let Some(p) = model.file.try_probabilities(node, bucket) else {
        return 0.0;
    };
    if *bias != Bias::NEUTRAL {
        let Some(spot) = model.spot(node) else {
            return 0.0;
        };
        let weights = biased(model, &spot, p, bucket, bias);
        let total: f64 = weights.iter().sum();
        return match weights.get(action) {
            Some(&w) if total > 0.0 => (w / total) as f32,
            _ => 0.0,
        };
    }
    let sum: u32 = p.iter().map(|&x| u32::from(x)).sum();
    match p.get(action) {
        Some(&x) if sum > 0 => f32::from(x) / sum as f32,
        _ => 0.0,
    }
}

pub(crate) type Buckets = Vec<(Street, Vec<Card>, Vec<u16>)>;

fn buckets_of<'a>(model: &Model, cache: &'a mut Buckets, step: &Step) -> &'a [u16] {
    let found = cache
        .iter()
        .position(|e| e.0 == step.street && e.1 == step.board);
    let i = found.unwrap_or_else(|| {
        let buckets = model.abstraction.buckets(step.street, &step.board);
        cache.push((step.street, step.board.clone(), buckets));
        cache.len() - 1
    });
    &cache[i].2
}

pub(crate) fn range_of(model: &Model, steps: &[Step], board: &[Card]) -> Vec<f32> {
    cached_range(model, steps, board, &mut Vec::new())
}

fn cached_range(model: &Model, steps: &[Step], board: &[Card], cache: &mut Buckets) -> Vec<f32> {
    let mut range: Vec<f32> = (0..PAIRS)
        .map(|i| {
            let c = pair_cards(i);
            if board.contains(&c[0]) || board.contains(&c[1]) {
                0.0
            } else {
                1.0
            }
        })
        .collect();
    for step in steps {
        let buckets = buckets_of(model, cache, step);
        let mut by_bucket: HashMap<u16, f32> = HashMap::new();
        let next: Vec<f32> = range
            .iter()
            .zip(buckets)
            .map(|(&w, &bucket)| {
                if w == 0.0 || bucket == u16::MAX {
                    return 0.0;
                }
                let p = *by_bucket.entry(bucket).or_insert_with(|| {
                    biased_probability(model, step.node, bucket, step.action, &step.bias)
                });
                w * p
            })
            .collect();
        if next.iter().any(|&w| w > 0.0) {
            range = next;
        }
    }
    range
}
