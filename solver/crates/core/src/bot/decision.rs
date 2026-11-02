use super::bias::biased;
use super::{to_real, Bias, Bot, Hand, Legal, Model, Move, Spot};

#[derive(Debug, Clone, PartialEq)]
pub struct DecisionView {
    pub moves: Vec<Move>,
    pub base: Vec<f64>,
    pub biased: Vec<f64>,
    pub chosen: usize,
}

fn shares(weights: &[f64]) -> Vec<f64> {
    let total: f64 = weights.iter().sum();
    if total <= 0.0 {
        return vec![0.0; weights.len()];
    }
    weights.iter().map(|w| w / total).collect()
}

pub(super) struct Sampled<'a> {
    pub spot: &'a Spot<'a>,
    pub probabilities: &'a [u8],
    pub bucket: u16,
    pub bias: &'a Bias,
    pub chosen: usize,
}

pub(super) fn explain(model: &Model, hand: &Hand, legal: &Legal, s: &Sampled<'_>) -> DecisionView {
    let raw: Vec<f64> = s.probabilities.iter().map(|&x| f64::from(x)).collect();
    let base = shares(&raw);
    let biased = if *s.bias == Bias::NEUTRAL {
        base.clone()
    } else {
        shares(&biased(model, s.spot, s.probabilities, s.bucket, s.bias))
    };
    let moves = s
        .spot
        .actions
        .iter()
        .map(|&(kind, _)| to_real(s.spot, hand, kind, legal))
        .collect();
    DecisionView {
        moves,
        base,
        biased,
        chosen: s.chosen,
    }
}

impl Bot {
    pub fn last_decision(&self) -> Option<&DecisionView> {
        self.last.as_ref()
    }
}
