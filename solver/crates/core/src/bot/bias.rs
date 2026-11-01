use super::translate::sample;
use super::{Model, Spot};
use crate::tree::{ActionKind, Street};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bias {
    pub aggression: f64,
    pub bluff: f64,
    pub tightness: f64,
    pub sizing: f64,
    pub stickiness: f64,
}

impl Bias {
    pub const NEUTRAL: Bias = Bias {
        aggression: 1.0,
        bluff: 1.0,
        tightness: 1.0,
        sizing: 1.0,
        stickiness: 1.0,
    };
}

impl Default for Bias {
    fn default() -> Bias {
        Bias::NEUTRAL
    }
}

pub struct Situation<'a> {
    pub bluffing: bool,
    pub preflop: bool,
    pub raise_ratios: &'a [f64],
}

fn is_raise(kind: ActionKind) -> bool {
    matches!(kind, ActionKind::RaiseTo(_) | ActionKind::AllIn)
}

fn factor(kind: ActionKind, bias: &Bias, situation: &Situation<'_>) -> f64 {
    match kind {
        ActionKind::Fold if situation.preflop => bias.tightness,
        ActionKind::Fold => 1.0 / bias.stickiness,
        ActionKind::Check | ActionKind::Call => 1.0 / bias.aggression,
        _ if situation.bluffing => bias.aggression * bias.bluff,
        _ => bias.aggression,
    }
}

pub fn size_position(pot_fraction: f64) -> f64 {
    pot_fraction.log2().clamp(-1.0, 1.0)
}

fn resize(weights: &mut [f64], kinds: &[ActionKind], ratios: &[f64], sizing: f64) {
    if sizing == 1.0 {
        return;
    }
    let raises: Vec<usize> = (0..kinds.len()).filter(|&i| is_raise(kinds[i])).collect();
    let before: f64 = raises.iter().map(|&i| weights[i]).sum();
    for &i in &raises {
        let ratio = ratios.get(i).copied().unwrap_or(1.0);
        weights[i] *= sizing.powf(size_position(ratio));
    }
    let after: f64 = raises.iter().map(|&i| weights[i]).sum();
    if after > 0.0 {
        for &i in &raises {
            weights[i] *= before / after;
        }
    }
}

pub fn reweight(
    probabilities: &[u8],
    kinds: &[ActionKind],
    bias: &Bias,
    situation: &Situation<'_>,
) -> Vec<f64> {
    let mut weights: Vec<f64> = probabilities
        .iter()
        .zip(kinds)
        .map(|(&p, &kind)| f64::from(p) * factor(kind, bias, situation))
        .collect();
    resize(&mut weights, kinds, situation.raise_ratios, bias.sizing);
    weights
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

fn raise_ratios(model: &Model, spot: &Spot<'_>) -> Vec<f64> {
    let pot = f64::from(spot.committed[0].saturating_add(spot.committed[1])).max(1.0);
    let mine = spot.street_bets[spot.seat];
    let behind = model.file.stack.saturating_sub(spot.committed[spot.seat]);
    spot.actions
        .iter()
        .map(|&(kind, _)| match kind {
            ActionKind::RaiseTo(to) => f64::from(to.saturating_sub(mine)) / pot,
            ActionKind::AllIn => f64::from(behind) / pot,
            _ => 0.0,
        })
        .collect()
}

pub(super) fn biased(
    model: &Model,
    spot: &Spot<'_>,
    probabilities: &[u8],
    bucket: u16,
    bias: &Bias,
) -> Vec<f64> {
    let kinds: Vec<ActionKind> = spot.actions.iter().map(|a| a.0).collect();
    let late = matches!(spot.street, Street::Turn | Street::River);
    let buckets = model.file.tree.buckets()[spot.street.as_index()];
    let low = late && f64::from(bucket) < 0.35 * f64::from(buckets);
    let ratios = raise_ratios(model, spot);
    let situation = Situation {
        bluffing: low && late,
        preflop: spot.street == Street::Preflop,
        raise_ratios: &ratios,
    };
    reweight(probabilities, &kinds, bias, &situation)
}

pub(super) fn choose(
    model: &Model,
    spot: &Spot<'_>,
    probabilities: &[u8],
    bucket: u16,
    bias: &Bias,
    draw: f64,
) -> usize {
    if *bias == Bias::NEUTRAL {
        return sample(probabilities, draw);
    }
    sample_weighted(&biased(model, spot, probabilities, bucket, bias), draw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree::ActionKind::{AllIn, Call, Check, Fold, RaiseTo};

    fn shares(weights: &[f64]) -> Vec<f64> {
        let total: f64 = weights.iter().sum();
        weights.iter().map(|w| w / total).collect()
    }

    fn bias(aggression: f64, bluff: f64, tightness: f64) -> Bias {
        Bias {
            aggression,
            bluff,
            tightness,
            ..Bias::NEUTRAL
        }
    }

    fn at(low_bucket: bool, late_street: bool) -> Situation<'static> {
        Situation {
            bluffing: low_bucket && late_street,
            preflop: true,
            raise_ratios: &[],
        }
    }

    fn postflop(raise_ratios: &[f64]) -> Situation<'_> {
        Situation {
            bluffing: false,
            preflop: false,
            raise_ratios,
        }
    }

    #[test]
    fn neutral_bias_keeps_weights() {
        let w = reweight(
            &[100, 55, 100],
            &[Fold, Call, RaiseTo(60)],
            &Bias::NEUTRAL,
            &at(false, false),
        );
        assert_eq!(w, vec![100.0, 55.0, 100.0]);
        assert_eq!(Bias::default(), Bias::NEUTRAL);
    }

    #[test]
    fn aggression_moves_mass_to_raises() {
        let p = [50, 80, 70, 55];
        let kinds = [Fold, Call, RaiseTo(60), AllIn];
        let neutral = shares(&reweight(&p, &kinds, &Bias::NEUTRAL, &at(false, false)));
        let hot = shares(&reweight(
            &p,
            &kinds,
            &bias(1.25, 1.0, 1.0),
            &at(false, false),
        ));
        let cold = shares(&reweight(
            &p,
            &kinds,
            &bias(0.8, 1.0, 1.0),
            &at(false, false),
        ));
        assert!(hot[2] > neutral[2] && hot[3] > neutral[3], "{hot:?}");
        assert!(hot[1] < neutral[1], "{hot:?}");
        assert!(cold[2] < neutral[2] && cold[3] < neutral[3], "{cold:?}");
        assert!(cold[1] > neutral[1], "{cold:?}");
        let w = reweight(
            &[100, 100],
            &[Check, RaiseTo(30)],
            &bias(1.25, 1.0, 1.0),
            &at(false, false),
        );
        assert_eq!(w, vec![80.0, 125.0]);
    }

    #[test]
    fn tightness_scales_fold() {
        let w = reweight(
            &[100, 55, 100],
            &[Fold, Call, RaiseTo(60)],
            &bias(1.0, 1.0, 1.2),
            &at(false, false),
        );
        assert_eq!(w, vec![120.0, 55.0, 100.0]);
    }

    #[test]
    fn bluff_only_low_buckets_late() {
        let p = [100, 100, 50];
        let kinds = [Check, RaiseTo(30), AllIn];
        let bluffer = bias(1.0, 1.3, 1.0);
        let neutral = shares(&reweight(&p, &kinds, &Bias::NEUTRAL, &at(true, true)));
        for (low, late) in [(false, false), (true, false), (false, true)] {
            let w = shares(&reweight(&p, &kinds, &bluffer, &at(low, late)));
            assert_eq!(w, neutral, "{low} {late}");
        }
        let w = shares(&reweight(&p, &kinds, &bluffer, &at(true, true)));
        assert!(w[1] > neutral[1] && w[2] > neutral[2], "{w:?}");
        assert!(w[0] < neutral[0], "{w:?}");
    }

    #[test]
    fn sizing_moves_raise_mass_to_larger_sizes_and_keeps_the_raise_total() {
        let p = [100, 60, 30, 10];
        let kinds = [Check, RaiseTo(100), RaiseTo(200), AllIn];
        let ratios = [0.0, 0.5, 1.0, 9.0];
        let neutral = reweight(&p, &kinds, &Bias::NEUTRAL, &postflop(&ratios));
        let big = Bias {
            sizing: 1.3,
            ..Bias::NEUTRAL
        };
        let w = reweight(&p, &kinds, &big, &postflop(&ratios));
        assert_eq!(w[0], neutral[0]);
        let total: f64 = w[1..].iter().sum();
        assert!((total - 100.0).abs() < 1e-9, "{w:?}");
        assert!(w[1] < neutral[1] && w[3] > neutral[3], "{w:?}");
        let ratio_small = w[1] / w[2];
        let ratio_big = w[3] / w[2];
        assert!((ratio_small - 60.0 / 30.0 / 1.3).abs() < 1e-9, "{w:?}");
        assert!((ratio_big - 10.0 / 30.0 * 1.3).abs() < 1e-9, "{w:?}");
        let small = Bias {
            sizing: 0.7,
            ..Bias::NEUTRAL
        };
        let w = reweight(&p, &kinds, &small, &postflop(&ratios));
        assert!(w[1] > neutral[1] && w[3] < neutral[3], "{w:?}");
    }

    #[test]
    fn sizing_does_not_change_a_single_raise() {
        let big = Bias {
            sizing: 1.5,
            ..Bias::NEUTRAL
        };
        let w = reweight(
            &[70, 30],
            &[Check, RaiseTo(150)],
            &big,
            &postflop(&[0.0, 0.75]),
        );
        assert_eq!(w, vec![70.0, 30.0]);
    }

    #[test]
    fn size_position_is_the_log_of_the_pot_fraction() {
        assert_eq!(size_position(0.5), -1.0);
        assert_eq!(size_position(1.0), 0.0);
        assert_eq!(size_position(2.0), 1.0);
        assert_eq!(size_position(0.1), -1.0);
        assert_eq!(size_position(20.0), 1.0);
        assert!((size_position(0.75) - 0.75f64.log2()).abs() < 1e-12);
    }

    #[test]
    fn stickiness_scales_folds_after_the_flop_and_tightness_before_it() {
        let sticky = Bias {
            tightness: 1.2,
            stickiness: 1.6,
            ..Bias::NEUTRAL
        };
        let p = [80, 60, 20];
        let kinds = [Fold, Call, RaiseTo(300)];
        let after = reweight(&p, &kinds, &sticky, &postflop(&[0.0, 0.0, 1.0]));
        assert_eq!(after, vec![50.0, 60.0, 20.0]);
        let before = reweight(&p, &kinds, &sticky, &at(false, false));
        assert_eq!(before, vec![96.0, 60.0, 20.0]);
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
