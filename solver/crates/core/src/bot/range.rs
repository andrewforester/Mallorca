use super::style::styled;
use super::{Bot, Model, Style};
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
    pub style: Style,
}

impl Bot {
    pub fn history(&self) -> &[Step] {
        self.hand.as_ref().map_or(&[], |h| &h.history)
    }

    pub fn range(&self, model: &Model) -> Vec<f32> {
        let board = self.hand.as_ref().map_or(&[][..], |h| &h.board);
        range_of(model, self.history(), board)
    }
}

pub(crate) fn action_probability(model: &Model, node: NodeId, bucket: u16, action: usize) -> f32 {
    styled_probability(model, node, bucket, action, &Style::NEUTRAL)
}

fn styled_probability(
    model: &Model,
    node: NodeId,
    bucket: u16,
    action: usize,
    style: &Style,
) -> f32 {
    let Some(p) = model.file.try_probabilities(node, bucket) else {
        return 0.0;
    };
    if *style != Style::NEUTRAL {
        let Some(spot) = model.spot(node) else {
            return 0.0;
        };
        let weights = styled(model, &spot, p, bucket, style);
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

pub(crate) fn range_of(model: &Model, steps: &[Step], board: &[Card]) -> Vec<f32> {
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
        let buckets = model.abstraction.buckets(step.street, &step.board);
        let mut by_bucket: HashMap<u16, f32> = HashMap::new();
        let next: Vec<f32> = range
            .iter()
            .zip(&buckets)
            .map(|(&w, &bucket)| {
                if w == 0.0 || bucket == u16::MAX {
                    return 0.0;
                }
                let p = *by_bucket.entry(bucket).or_insert_with(|| {
                    styled_probability(model, step.node, bucket, step.action, &step.style)
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
