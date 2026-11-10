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

pub struct Situation {
    pub bluffing: bool,
}

pub const LOOSE_SHIFT: f64 = 0.35;
pub const AGGRESSIVE_SHIFT: f64 = 0.2;
pub const STICKY_SHIFT: f64 = 0.2;

fn factor(kind: ActionKind, bias: &Bias, situation: &Situation) -> f64 {
    match kind {
        ActionKind::Fold => 1.0,
        ActionKind::Check | ActionKind::Call => 1.0 / bias.aggression,
        _ if situation.bluffing => bias.aggression * bias.bluff,
        _ => bias.aggression,
    }
}

pub fn reweight(row: &[f64], kinds: &[ActionKind], bias: &Bias, situation: &Situation) -> Vec<f64> {
    row.iter()
        .zip(kinds)
        .map(|(&p, &kind)| p * factor(kind, bias, situation))
        .collect()
}

pub fn shift(bias: &Bias, street: Street, kinds: &[ActionKind]) -> f64 {
    if !kinds.contains(&ActionKind::Fold) {
        return AGGRESSIVE_SHIFT * bias.aggression.ln();
    }
    if street == Street::Preflop {
        LOOSE_SHIFT * (1.0 / bias.tightness).ln()
    } else {
        STICKY_SHIFT * bias.stickiness.ln()
    }
}

pub fn fold_only(real: &[f64], shifted: &[f64], kinds: &[ActionKind], delta: f64) -> Vec<f64> {
    let Some(fold) = kinds.iter().position(|&k| k == ActionKind::Fold) else {
        return shifted.to_vec();
    };
    let (total, shifted_total) = (real.iter().sum::<f64>(), shifted.iter().sum::<f64>());
    if total <= 0.0 || shifted_total <= 0.0 {
        return shifted.to_vec();
    }
    let target = shifted[fold] * total / shifted_total;
    let fold_weight = if delta > 0.0 {
        target.min(real[fold])
    } else {
        target.max(real[fold])
    };
    let mut row = real.to_vec();
    row[fold] = fold_weight;
    if fold_weight < real[fold] {
        let passive = kinds
            .iter()
            .position(|&k| matches!(k, ActionKind::Call | ActionKind::Check));
        let Some(passive) = passive else {
            return shifted.to_vec();
        };
        row[passive] += real[fold] - fold_weight;
        return row;
    }
    let rest = total - real[fold];
    if rest <= 0.0 {
        return real.to_vec();
    }
    let scale = (total - fold_weight) / rest;
    for (i, w) in row.iter_mut().enumerate() {
        if i != fold {
            *w *= scale;
        }
    }
    row
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

pub(super) fn shifted_row(
    model: &Model,
    spot: &Spot<'_>,
    probabilities: &[u8],
    bucket: u16,
    delta: f64,
) -> Vec<f64> {
    if delta == 0.0 {
        return probabilities.iter().map(|&p| f64::from(p)).collect();
    }
    let order = model.order(spot.street);
    let q = (order.percentile(bucket) + delta).clamp(0.0, 1.0);
    let (lo, hi, t) = order.around(q);
    let row = |b: u16| {
        model
            .file
            .try_probabilities(spot.id, b)
            .filter(|r| r.len() == probabilities.len())
            .unwrap_or(probabilities)
    };
    row(lo)
        .iter()
        .zip(row(hi))
        .map(|(&a, &b)| (1.0 - t) * f64::from(a) + t * f64::from(b))
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
    let delta = shift(bias, spot.street, &kinds);
    let real: Vec<f64> = probabilities.iter().map(|&p| f64::from(p)).collect();
    let row = fold_only(
        &real,
        &shifted_row(model, spot, probabilities, bucket, delta),
        &kinds,
        delta,
    );
    let late = matches!(spot.street, Street::Turn | Street::River);
    let buckets = model.file.tree.buckets()[spot.street.as_index()];
    let low = f64::from(bucket) < 0.35 * f64::from(buckets);
    let situation = Situation {
        bluffing: low && late,
    };
    reweight(&row, &kinds, bias, &situation)
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

    fn at(bluffing: bool) -> Situation {
        Situation { bluffing }
    }

    #[test]
    fn neutral_bias_keeps_weights() {
        let w = reweight(
            &[100.0, 55.0, 100.0],
            &[Fold, Call, RaiseTo(60)],
            &Bias::NEUTRAL,
            &at(false),
        );
        assert_eq!(w, vec![100.0, 55.0, 100.0]);
        assert_eq!(Bias::default(), Bias::NEUTRAL);
    }

    #[test]
    fn aggression_moves_mass_to_raises() {
        let p = [50.0, 80.0, 70.0, 55.0];
        let kinds = [Fold, Call, RaiseTo(60), AllIn];
        let neutral = shares(&reweight(&p, &kinds, &Bias::NEUTRAL, &at(false)));
        let hot = shares(&reweight(&p, &kinds, &bias(1.25, 1.0, 1.0), &at(false)));
        let cold = shares(&reweight(&p, &kinds, &bias(0.8, 1.0, 1.0), &at(false)));
        assert!(hot[2] > neutral[2] && hot[3] > neutral[3], "{hot:?}");
        assert!(hot[1] < neutral[1], "{hot:?}");
        assert!(cold[2] < neutral[2] && cold[3] < neutral[3], "{cold:?}");
        assert!(cold[1] > neutral[1], "{cold:?}");
        let w = reweight(
            &[100.0, 100.0],
            &[Check, RaiseTo(30)],
            &bias(1.25, 1.0, 1.0),
            &at(false),
        );
        assert_eq!(w, vec![80.0, 125.0]);
    }

    #[test]
    fn bluff_acts_only_when_bluffing() {
        let p = [100.0, 100.0, 50.0];
        let kinds = [Check, RaiseTo(30), AllIn];
        let bluffer = bias(1.0, 1.3, 1.0);
        let neutral = shares(&reweight(&p, &kinds, &Bias::NEUTRAL, &at(true)));
        let w = shares(&reweight(&p, &kinds, &bluffer, &at(false)));
        assert_eq!(w, neutral);
        let w = shares(&reweight(&p, &kinds, &bluffer, &at(true)));
        assert!(w[1] > neutral[1] && w[2] > neutral[2], "{w:?}");
        assert!(w[0] < neutral[0], "{w:?}");
    }

    #[test]
    fn folds_are_not_scaled_by_any_axis() {
        let w = reweight(
            &[80.0, 60.0, 20.0],
            &[Fold, Call, RaiseTo(300)],
            &Bias {
                tightness: 0.5,
                stickiness: 2.0,
                sizing: 2.0,
                ..Bias::NEUTRAL
            },
            &at(false),
        );
        assert_eq!(w, vec![80.0, 60.0, 20.0]);
    }

    #[test]
    fn tightness_shifts_preflop_and_stickiness_after_the_flop_only_facing_a_bet() {
        let facing = [Fold, Call, RaiseTo(60)];
        let open = [Check, RaiseTo(60)];
        let loose = bias(1.0, 1.0, 0.5);
        let sticky = Bias {
            stickiness: 2.0,
            ..Bias::NEUTRAL
        };
        let expected = LOOSE_SHIFT * 2f64.ln();
        assert!((shift(&loose, Street::Preflop, &facing) - expected).abs() < 1e-12);
        assert!((shift(&bias(1.0, 1.0, 2.0), Street::Preflop, &facing) + expected).abs() < 1e-12);
        assert_eq!(shift(&loose, Street::Flop, &facing), 0.0);
        assert_eq!(shift(&loose, Street::Preflop, &open), 0.0);
        let expected = STICKY_SHIFT * 2f64.ln();
        assert!((shift(&sticky, Street::River, &facing) - expected).abs() < 1e-12);
        assert_eq!(shift(&sticky, Street::Preflop, &facing), 0.0);
        assert_eq!(shift(&sticky, Street::Turn, &open), 0.0);
        assert_eq!(shift(&Bias::NEUTRAL, Street::Preflop, &facing), 0.0);
        assert_eq!(shift(&Bias::NEUTRAL, Street::Flop, &facing), 0.0);
    }

    #[test]
    fn aggression_shifts_strength_only_where_there_is_no_bet() {
        let facing = [Fold, Call, RaiseTo(60)];
        let open = [Check, RaiseTo(60)];
        let hot = bias(2.0, 1.0, 1.0);
        let cold = bias(0.5, 1.0, 1.0);
        let expected = AGGRESSIVE_SHIFT * 2f64.ln();
        for street in [Street::Preflop, Street::Flop, Street::River] {
            assert!((shift(&hot, street, &open) - expected).abs() < 1e-12);
            assert!((shift(&cold, street, &open) + expected).abs() < 1e-12);
            assert_eq!(shift(&hot, street, &facing), 0.0);
        }
        assert_eq!(shift(&Bias::NEUTRAL, Street::Turn, &open), 0.0);
    }

    #[test]
    fn a_loose_shift_moves_only_folds_into_the_call() {
        let kinds = [Fold, Call, RaiseTo(60), AllIn];
        let real = [100.0, 60.0, 30.0, 10.0];
        let shifted = [20.0, 30.0, 120.0, 30.0];
        assert_eq!(
            fold_only(&real, &shifted, &kinds, 0.1),
            vec![20.0, 140.0, 30.0, 10.0]
        );
        let pure_fold = [200.0, 0.0, 0.0, 0.0];
        assert_eq!(
            fold_only(&pure_fold, &shifted, &kinds, 0.1),
            vec![20.0, 180.0, 0.0, 0.0]
        );
        let folds_more = [100.0, 50.0, 50.0];
        let real = [0.0, 50.0, 150.0];
        assert_eq!(
            fold_only(&real, &folds_more, &kinds[..3], 0.1),
            real.to_vec()
        );
    }

    #[test]
    fn a_tight_shift_folds_more_and_keeps_the_continuing_mix() {
        let kinds = [Fold, Call, RaiseTo(60)];
        let real = [40.0, 40.0, 120.0];
        let shifted = [100.0, 50.0, 50.0];
        assert_eq!(
            fold_only(&real, &shifted, &kinds, -0.1),
            vec![100.0, 25.0, 75.0]
        );
        let folds_less = [0.0, 100.0, 100.0];
        assert_eq!(fold_only(&real, &folds_less, &kinds, -0.1), real.to_vec());
    }

    #[test]
    fn without_a_fold_the_shifted_row_stays() {
        let open = [Check, RaiseTo(60)];
        assert_eq!(
            fold_only(&[50.0, 50.0], &[10.0, 90.0], &open, 0.1),
            vec![10.0, 90.0]
        );
        let no_call = [Fold, AllIn];
        assert_eq!(
            fold_only(&[50.0, 50.0], &[10.0, 90.0], &no_call, 0.1),
            vec![10.0, 90.0]
        );
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
