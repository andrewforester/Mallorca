use super::style::styled;
use super::{to_real, Bot, Hand, Legal, Model, Move, Spot, Style};

#[derive(Debug, Clone, PartialEq)]
pub struct DecisionView {
    pub moves: Vec<Move>,
    pub base: Vec<f64>,
    pub styled: Vec<f64>,
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
    pub style: &'a Style,
    pub chosen: usize,
}

pub(super) fn explain(model: &Model, hand: &Hand, legal: &Legal, s: &Sampled<'_>) -> DecisionView {
    let raw: Vec<f64> = s.probabilities.iter().map(|&x| f64::from(x)).collect();
    let base = shares(&raw);
    let styled = if *s.style == Style::NEUTRAL {
        base.clone()
    } else {
        shares(&styled(model, s.spot, s.probabilities, s.bucket, s.style))
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
        styled,
        chosen: s.chosen,
    }
}

impl Bot {
    pub fn last_decision(&self) -> Option<&DecisionView> {
        self.last.as_ref()
    }
}
