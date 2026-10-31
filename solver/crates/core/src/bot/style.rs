use super::translate::sample;
use super::{Model, Spot};
use crate::tree::{ActionKind, Street};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Style {
    pub aggression: f64,
    pub bluff: f64,
    pub tightness: f64,
}

impl Style {
    pub const NEUTRAL: Style = Style {
        aggression: 1.0,
        bluff: 1.0,
        tightness: 1.0,
    };
}

impl Default for Style {
    fn default() -> Style {
        Style::NEUTRAL
    }
}

fn factor(kind: ActionKind, style: &Style, bluffing: bool) -> f64 {
    match kind {
        ActionKind::Fold => style.tightness,
        ActionKind::Check | ActionKind::Call => 1.0 / style.aggression,
        ActionKind::RaiseTo(_) | ActionKind::AllIn if bluffing => style.aggression * style.bluff,
        ActionKind::RaiseTo(_) | ActionKind::AllIn => style.aggression,
    }
}

pub fn reweight(
    probabilities: &[u8],
    kinds: &[ActionKind],
    style: &Style,
    low_bucket: bool,
    late_street: bool,
) -> Vec<f64> {
    let bluffing = low_bucket && late_street;
    probabilities
        .iter()
        .zip(kinds)
        .map(|(&p, &kind)| f64::from(p) * factor(kind, style, bluffing))
        .collect()
}

pub fn sample_weighted(weights: &[f64], draw: f64) -> usize {
    let total: f64 = weights.iter().sum();
    let target = draw * total;
    let mut cumulative = 0.0;
    for (i, &w) in weights.iter().enumerate() {
        cumulative += w;
        if w > 0.0 && target < cumulative {
            return i;
        }
    }
    weights
        .iter()
        .rposition(|&w| w > 0.0)
        .unwrap_or(weights.len() - 1)
}

pub(super) fn choose(
    model: &Model,
    spot: &Spot<'_>,
    probabilities: &[u8],
    bucket: u16,
    style: &Style,
    draw: f64,
) -> usize {
    if *style == Style::NEUTRAL {
        return sample(probabilities, draw);
    }
    let kinds: Vec<ActionKind> = spot.actions.iter().map(|a| a.0).collect();
    let late = matches!(spot.street, Street::Turn | Street::River);
    let buckets = model.file.tree.buckets()[spot.street.as_index()];
    let low = late && f64::from(bucket) < 0.35 * f64::from(buckets);
    sample_weighted(&reweight(probabilities, &kinds, style, low, late), draw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree::ActionKind::{AllIn, Call, Check, Fold, RaiseTo};

    fn shares(weights: &[f64]) -> Vec<f64> {
        let total: f64 = weights.iter().sum();
        weights.iter().map(|w| w / total).collect()
    }

    fn style(aggression: f64, bluff: f64, tightness: f64) -> Style {
        Style {
            aggression,
            bluff,
            tightness,
        }
    }

    #[test]
    fn neutral_style_keeps_weights() {
        let w = reweight(
            &[100, 55, 100],
            &[Fold, Call, RaiseTo(60)],
            &Style::NEUTRAL,
            false,
            false,
        );
        assert_eq!(w, vec![100.0, 55.0, 100.0]);
        assert_eq!(Style::default(), Style::NEUTRAL);
    }

    #[test]
    fn aggression_moves_mass_to_raises() {
        let p = [50, 80, 70, 55];
        let kinds = [Fold, Call, RaiseTo(60), AllIn];
        let neutral = shares(&reweight(&p, &kinds, &Style::NEUTRAL, false, false));
        let hot = shares(&reweight(&p, &kinds, &style(1.25, 1.0, 1.0), false, false));
        let cold = shares(&reweight(&p, &kinds, &style(0.8, 1.0, 1.0), false, false));
        assert!(hot[2] > neutral[2] && hot[3] > neutral[3], "{hot:?}");
        assert!(hot[1] < neutral[1], "{hot:?}");
        assert!(cold[2] < neutral[2] && cold[3] < neutral[3], "{cold:?}");
        assert!(cold[1] > neutral[1], "{cold:?}");
        let w = reweight(
            &[100, 100],
            &[Check, RaiseTo(30)],
            &style(1.25, 1.0, 1.0),
            false,
            false,
        );
        assert_eq!(w, vec![80.0, 125.0]);
    }

    #[test]
    fn tightness_scales_fold() {
        let w = reweight(
            &[100, 55, 100],
            &[Fold, Call, RaiseTo(60)],
            &style(1.0, 1.0, 1.2),
            false,
            false,
        );
        assert_eq!(w, vec![120.0, 55.0, 100.0]);
    }

    #[test]
    fn bluff_only_low_buckets_late() {
        let p = [100, 100, 50];
        let kinds = [Check, RaiseTo(30), AllIn];
        let bluffer = style(1.0, 1.3, 1.0);
        let neutral = shares(&reweight(&p, &kinds, &Style::NEUTRAL, true, true));
        for (low, late) in [(false, false), (true, false), (false, true)] {
            let w = shares(&reweight(&p, &kinds, &bluffer, low, late));
            assert_eq!(w, neutral, "{low} {late}");
        }
        let w = shares(&reweight(&p, &kinds, &bluffer, true, true));
        assert!(w[1] > neutral[1] && w[2] > neutral[2], "{w:?}");
        assert!(w[0] < neutral[0], "{w:?}");
    }

    #[test]
    fn sample_weighted_matches_cumulative() {
        let w = [0.0, 1.0, 0.0, 3.0, 0.0];
        assert_eq!(sample_weighted(&w, 0.0), 1);
        assert_eq!(sample_weighted(&w, 0.2), 1);
        assert_eq!(sample_weighted(&w, 0.25), 3);
        assert_eq!(sample_weighted(&w, 0.5), 3);
        assert_eq!(sample_weighted(&w, 0.999), 3);
        assert_eq!(sample_weighted(&w, 1.0), 3);
        assert_eq!(sample_weighted(&[2.0, 2.0, 4.0], 0.5), 2);
        for i in 0..1000 {
            let k = sample_weighted(&w, f64::from(i) / 1000.0);
            assert!(w[k] > 0.0, "{i} chose {k}");
        }
    }
}
