use super::range::action_probability;
use super::{target, to_real, Bot, Legal, Model, Move, Target};
use crate::pairs::{pair_cards, PAIRS};
use crate::tree::{NodeId, Street};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct SpotView {
    pub node: NodeId,
    pub street: Street,
    pub moves: Vec<Move>,
    pub approximate: bool,
}

impl Bot {
    pub fn spot(&self, model: &Model, legal: &Legal) -> Option<SpotView> {
        let hand = self.hand.as_ref()?;
        let (node, approximate) = match target(model, hand, legal) {
            Target::Passive | Target::Hold => return None,
            Target::Keep(id) => (id, hand.shifted),
            Target::Resync(id) => (id?, true),
        };
        let spot = model.spot(node)?;
        let bucket = model
            .abstraction
            .bucket(hand.street, hand.hole?, &hand.board);
        model.file.try_probabilities(node, bucket)?;
        let moves = spot
            .actions
            .iter()
            .map(|&(kind, _)| to_real(&spot, hand, kind, legal))
            .collect();
        Some(SpotView {
            node,
            street: hand.street,
            moves,
            approximate,
        })
    }

    pub fn strategy_grid(&self, model: &Model, spot: &SpotView) -> Vec<f32> {
        let n = spot.moves.len();
        let mut grid = vec![0.0; PAIRS * n];
        let Some(hand) = self.hand.as_ref() else {
            return grid;
        };
        let hole = hand.hole.unwrap_or([u8::MAX; 2]);
        let buckets = model.abstraction.buckets(spot.street, &hand.board);
        let mut rows: HashMap<u16, Vec<f32>> = HashMap::new();
        for (i, &bucket) in buckets.iter().enumerate() {
            let c = pair_cards(i);
            if bucket == u16::MAX || hole.contains(&c[0]) || hole.contains(&c[1]) {
                continue;
            }
            let row = rows.entry(bucket).or_insert_with(|| {
                (0..n)
                    .map(|k| action_probability(model, spot.node, bucket, k))
                    .collect()
            });
            grid[i * n..(i + 1) * n].copy_from_slice(row);
        }
        grid
    }
}
