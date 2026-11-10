use super::bluff::{bluffed, is_bet, pull};
use super::translate::{fraction, sample};
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

pub const LOOSE_SHIFT: f64 = 0.45;
pub const AGGRESSIVE_SHIFT: f64 = 0.2;
pub const STICKY_SHIFT: f64 = 0.31;

fn factor(kind: ActionKind, bias: &Bias) -> f64 {
    match kind {
        ActionKind::Fold => 1.0,
        ActionKind::Check | ActionKind::Call => 1.0 / bias.aggression,
        _ => bias.aggression,
    }
}

pub fn reweight(row: &[f64], kinds: &[ActionKind], bias: &Bias) -> Vec<f64> {
    let weighted: Vec<f64> = row
        .iter()
        .zip(kinds)
        .map(|(&p, &kind)| p * factor(kind, bias))
        .collect();
    let Some(fold) = kinds.iter().position(|&k| k == ActionKind::Fold) else {
        return weighted;
    };
    let rest = |r: &[f64]| r.iter().sum::<f64>() - r[fold];
    let (before, after) = (rest(row), rest(&weighted));
    if after <= 0.0 {
        return weighted;
    }
    weighted
        .iter()
        .enumerate()
        .map(|(i, &w)| if i == fold { w } else { w * before / after })
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

fn rebalance(real: &[f64], class: usize, target: f64, delta: f64, receivers: &[f64]) -> Vec<f64> {
    let total: f64 = real.iter().sum();
    if total <= 0.0 {
        return real.to_vec();
    }
    let weight = if delta > 0.0 {
        (target * total).min(real[class])
    } else {
        (target * total).max(real[class])
    };
    let mut row = real.to_vec();
    row[class] = weight;
    let freed = real[class] - weight;
    let receiving: f64 = receivers.iter().sum();
    if freed > 0.0 && receiving > 0.0 {
        for (w, r) in row.iter_mut().zip(receivers) {
            *w += freed * r / receiving;
        }
        return row;
    }
    let rest = total - real[class];
    if rest <= 0.0 {
        return real.to_vec();
    }
    let scale = (total - weight) / rest;
    for (i, w) in row.iter_mut().enumerate() {
        if i != class {
            *w *= scale;
        }
    }
    row
}

pub fn fold_only(real: &[f64], target: f64, kinds: &[ActionKind], delta: f64) -> Vec<f64> {
    let Some(fold) = kinds.iter().position(|&k| k == ActionKind::Fold) else {
        return real.to_vec();
    };
    let receivers: Vec<f64> = kinds
        .iter()
        .map(|&k| f64::from(u8::from(matches!(k, ActionKind::Call | ActionKind::Check))))
        .collect();
    rebalance(real, fold, target, delta, &receivers)
}

pub fn check_only(
    real: &[f64],
    target: f64,
    kinds: &[ActionKind],
    delta: f64,
    shifted: &[f64],
) -> Vec<f64> {
    let Some(check) = kinds.iter().position(|&k| k == ActionKind::Check) else {
        return real.to_vec();
    };
    let bets = |row: &[f64]| -> Vec<f64> {
        row.iter()
            .enumerate()
            .map(|(i, &w)| if i == check { 0.0 } else { w })
            .collect()
    };
    let own = bets(real);
    let receivers = if own.iter().sum::<f64>() > 0.0 {
        own
    } else {
        bets(shifted)
    };
    rebalance(real, check, target, delta, &receivers)
}

pub const SIZE_TILT: f64 = 2.0;
pub const SIZE_SCALE: f64 = 0.25;

pub fn tilted(row: &[f64], sizes: &[Option<f64>], sizing: f64) -> Vec<f64> {
    let power = SIZE_TILT * sizing.ln();
    let raised: f64 = row
        .iter()
        .zip(sizes)
        .filter(|(_, s)| s.is_some())
        .map(|(w, _)| w)
        .sum();
    let weighted: Vec<f64> = row
        .iter()
        .zip(sizes)
        .map(|(&w, s)| s.map_or(w, |f| w * f.max(f64::MIN_POSITIVE).powf(power)))
        .collect();
    let after: f64 = weighted
        .iter()
        .zip(sizes)
        .filter(|(_, s)| s.is_some())
        .map(|(w, _)| w)
        .sum();
    if power == 0.0 || after <= 0.0 {
        return row.to_vec();
    }
    weighted
        .iter()
        .zip(sizes)
        .map(|(&w, s)| if s.is_some() { w * raised / after } else { w })
        .collect()
}

pub const NOISE: f64 = 0.1;

pub fn purified(share: f64) -> f64 {
    if share < NOISE {
        0.0
    } else if share > 1.0 - NOISE {
        1.0
    } else {
        share
    }
}

const EDGE: f64 = 1e-3;

pub fn widened(fold: f64, shift: f64) -> f64 {
    let odds = |p: f64| (p / (1.0 - p)).ln();
    let continuing = (1.0 - fold).clamp(EDGE, 1.0 - EDGE);
    let moved = odds(continuing) + 4.0 * shift;
    let target = 1.0 / (1.0 + (-moved).exp());
    (target - continuing).clamp(fold - 1.0, fold)
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

struct Shifted {
    class: usize,
    share: f64,
    row: Vec<f64>,
}

fn shifted(
    model: &Model,
    spot: &Spot<'_>,
    probabilities: &[u8],
    bucket: u16,
    delta: f64,
) -> Option<Shifted> {
    if delta == 0.0 {
        return None;
    }
    let class = spot
        .actions
        .iter()
        .position(|a| a.0 == ActionKind::Fold)
        .or_else(|| spot.actions.iter().position(|a| a.0 == ActionKind::Check))?;
    let buckets = model.file.tree.buckets()[spot.street.as_index()];
    let rows: Vec<Option<&[u8]>> = (0..buckets)
        .map(|b| {
            model
                .file
                .try_probabilities(spot.id, b)
                .filter(|r| r.len() == probabilities.len())
        })
        .collect();
    let shares: Vec<Option<f64>> = rows
        .iter()
        .map(|row| {
            let row = (*row)?;
            let total: f64 = row.iter().map(|&p| f64::from(p)).sum();
            (total > 0.0).then(|| purified(f64::from(row[class]) / total))
        })
        .collect();
    let order = model.order(spot.street).by_fold(&shares);
    let moved = widened(order.mean(&shares), delta);
    let q = (order.percentile(bucket) + moved).clamp(0.0, 1.0);
    let (lo, hi, t) = order.around(q);
    let share = |b: u16| shares[usize::from(b)].unwrap_or(0.0);
    let row = |b: u16| rows[usize::from(b)].unwrap_or(probabilities);
    let total: f64 = probabilities.iter().map(|&p| f64::from(p)).sum();
    let own = f64::from(probabilities[class]) / total.max(f64::MIN_POSITIVE);
    let phase = (4.0 * delta.abs() / NOISE).min(1.0);
    let target = (1.0 - t) * share(lo) + t * share(hi) + (1.0 - phase) * (own - purified(own));
    Some(Shifted {
        class,
        share: target.clamp(0.0, 1.0),
        row: row(lo)
            .iter()
            .zip(row(hi))
            .map(|(&a, &b)| (1.0 - t) * f64::from(a) + t * f64::from(b))
            .collect(),
    })
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
    let row = match shifted(model, spot, probabilities, bucket, delta) {
        Some(s) if kinds[s.class] == ActionKind::Fold => fold_only(&real, s.share, &kinds, delta),
        Some(s) => check_only(&real, s.share, &kinds, delta, &s.row),
        None => real,
    };
    let row = reweight(&row, &kinds, bias);
    let t = pull(
        bias.bluff,
        spot.street,
        model.order(spot.street).percentile(bucket),
    );
    let never_bets = kinds
        .iter()
        .zip(&row)
        .all(|(&k, &w)| !is_bet(k) || w == 0.0);
    let fallback = if t > 0.0 && never_bets {
        node_mix(model, spot, probabilities.len())
    } else {
        Vec::new()
    };
    let sizes: Vec<Option<f64>> = kinds
        .iter()
        .map(|&kind| match kind {
            ActionKind::RaiseTo(to) => Some(fraction(
                to,
                spot.street_bets[1 - spot.seat],
                spot.pot_after_call(),
            )),
            _ => None,
        })
        .collect();
    tilted(&bluffed(&row, &kinds, t, &fallback), &sizes, bias.sizing)
}

fn node_mix(model: &Model, spot: &Spot<'_>, width: usize) -> Vec<f64> {
    let buckets = model.file.tree.buckets()[spot.street.as_index()];
    let mut mix = vec![0.0; width];
    for b in 0..buckets {
        let Some(row) = model
            .file
            .try_probabilities(spot.id, b)
            .filter(|r| r.len() == width)
        else {
            continue;
        };
        let total: f64 = row.iter().map(|&p| f64::from(p)).sum();
        if total <= 0.0 {
            continue;
        }
        for (m, &p) in mix.iter_mut().zip(row) {
            *m += f64::from(p) / total;
        }
    }
    mix
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

    #[test]
    fn neutral_bias_keeps_weights() {
        let w = reweight(
            &[100.0, 55.0, 100.0],
            &[Fold, Call, RaiseTo(60)],
            &Bias::NEUTRAL,
        );
        assert_eq!(w, vec![100.0, 55.0, 100.0]);
        assert_eq!(Bias::default(), Bias::NEUTRAL);
    }

    #[test]
    fn aggression_moves_mass_to_raises() {
        let p = [50.0, 80.0, 70.0, 55.0];
        let kinds = [Fold, Call, RaiseTo(60), AllIn];
        let neutral = shares(&reweight(&p, &kinds, &Bias::NEUTRAL));
        let hot = shares(&reweight(&p, &kinds, &bias(1.25, 1.0, 1.0)));
        let cold = shares(&reweight(&p, &kinds, &bias(0.8, 1.0, 1.0)));
        assert!(hot[2] > neutral[2] && hot[3] > neutral[3], "{hot:?}");
        assert!(hot[1] < neutral[1], "{hot:?}");
        assert!(cold[2] < neutral[2] && cold[3] < neutral[3], "{cold:?}");
        assert!(cold[1] > neutral[1], "{cold:?}");
        let w = reweight(
            &[100.0, 100.0],
            &[Check, RaiseTo(30)],
            &bias(1.25, 1.0, 1.0),
        );
        assert_eq!(w, vec![80.0, 125.0]);
    }

    #[test]
    fn aggression_keeps_the_fold_share() {
        let p = [50.0, 80.0, 70.0, 55.0];
        let kinds = [Fold, Call, RaiseTo(60), AllIn];
        for aggression in [0.6, 1.4] {
            let w = shares(&reweight(&p, &kinds, &bias(aggression, 1.3, 1.0)));
            assert!((w[0] - 50.0 / 255.0).abs() < 1e-12, "{aggression}: {w:?}");
        }
        let hot = shares(&reweight(&p, &kinds, &bias(1.4, 1.0, 1.0)));
        assert!(hot[2] > 70.0 / 255.0 && hot[1] < 80.0 / 255.0, "{hot:?}");
    }

    #[test]
    fn the_kind_reweight_leaves_bluffing_to_its_own_pull() {
        let p = [100.0, 100.0, 50.0];
        let kinds = [Check, RaiseTo(30), AllIn];
        let w = reweight(&p, &kinds, &bias(1.0, 2.0, 1.0));
        assert_eq!(w, p.to_vec());
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
        assert_eq!(
            fold_only(&real, 0.1, &kinds, 0.1),
            vec![20.0, 140.0, 30.0, 10.0]
        );
        let pure_fold = [200.0, 0.0, 0.0, 0.0];
        assert_eq!(
            fold_only(&pure_fold, 0.1, &kinds, 0.1),
            vec![20.0, 180.0, 0.0, 0.0]
        );
        let real = [0.0, 50.0, 150.0];
        assert_eq!(fold_only(&real, 0.5, &kinds[..3], 0.1), real.to_vec());
    }

    #[test]
    fn a_tight_shift_folds_more_and_keeps_the_continuing_mix() {
        let kinds = [Fold, Call, RaiseTo(60)];
        let real = [40.0, 40.0, 120.0];
        assert_eq!(fold_only(&real, 0.5, &kinds, -0.1), vec![100.0, 25.0, 75.0]);
        assert_eq!(fold_only(&real, 0.0, &kinds, -0.1), real.to_vec());
    }

    #[test]
    fn without_a_call_a_loose_shift_scales_the_continuing_actions() {
        let open = [Check, RaiseTo(60)];
        assert_eq!(fold_only(&[50.0, 50.0], 0.1, &open, 0.1), vec![50.0, 50.0]);
        let no_call = [Fold, AllIn];
        assert_eq!(
            fold_only(&[50.0, 50.0], 0.1, &no_call, 0.1),
            vec![10.0, 90.0]
        );
    }

    #[test]
    fn an_aggressive_shift_moves_checks_into_the_bets_of_the_hand() {
        let kinds = [Check, RaiseTo(30), AllIn];
        let shifted = [0.0, 10.0, 90.0];
        let real = [100.0, 60.0, 40.0];
        assert_eq!(
            check_only(&real, 0.2, &kinds, 0.1, &shifted),
            vec![40.0, 96.0, 64.0]
        );
        let pure_check = [200.0, 0.0, 0.0];
        assert_eq!(
            check_only(&pure_check, 0.5, &kinds, 0.1, &shifted),
            vec![100.0, 10.0, 90.0]
        );
        let bets_more = [0.0, 100.0, 100.0];
        assert_eq!(
            check_only(&bets_more, 0.5, &kinds, 0.1, &shifted),
            bets_more.to_vec()
        );
    }

    #[test]
    fn a_passive_shift_moves_bets_into_the_check() {
        let kinds = [Check, RaiseTo(30), AllIn];
        let real = [40.0, 80.0, 80.0];
        let shifted = [1.0, 0.0, 0.0];
        assert_eq!(
            check_only(&real, 0.6, &kinds, -0.1, &shifted),
            vec![120.0, 40.0, 40.0]
        );
        assert_eq!(
            check_only(&real, 0.0, &kinds, -0.1, &shifted),
            real.to_vec()
        );
    }

    #[test]
    fn sizing_moves_the_raise_mass_between_sizes_and_keeps_the_rest() {
        let row = [10.0, 40.0, 30.0, 20.0, 50.0];
        let sizes = [None, None, Some(0.33), Some(1.0), None];
        assert_eq!(tilted(&row, &sizes, 1.0), row.to_vec());
        for (sizing, bigger) in [(2.0, true), (0.5, false)] {
            let w = tilted(&row, &sizes, sizing);
            assert_eq!([w[0], w[1], w[4]], [10.0, 40.0, 50.0]);
            assert!((w[2] + w[3] - 50.0).abs() < 1e-9, "{w:?}");
            assert_eq!(w[3] > 20.0, bigger, "{sizing}: {w:?}");
        }
        let one = [10.0, 0.0, 30.0, 0.0, 50.0];
        assert_eq!(tilted(&one, &sizes, 2.0), one.to_vec());
    }

    #[test]
    fn the_fold_axes_are_calibrated_to_the_archetype_edges() {
        assert_eq!((LOOSE_SHIFT, STICKY_SHIFT), (0.45, 0.31));
    }

    #[test]
    fn purification_drops_noise_at_both_ends() {
        assert_eq!(purified(0.02), 0.0);
        assert_eq!(purified(0.97), 1.0);
        assert_eq!(purified(0.4), 0.4);
    }

    #[test]
    fn a_balanced_spot_moves_by_the_shift_and_a_lopsided_one_by_less() {
        assert!((widened(0.5, 0.01) - 0.01).abs() < 1e-5);
        assert!((widened(0.5, -0.01) + 0.01).abs() < 1e-5);
        let tight = -0.35 * 1.35f64.ln();
        assert!(widened(0.92, tight).abs() < 0.03);
        assert!(widened(0.07, -tight) < 0.03);
        let middle = widened(0.42, tight);
        assert!(middle < 0.0 && middle > 1.2 * tight, "{middle}");
        for fold in [0.0, 0.3, 1.0] {
            let w = widened(fold, 0.2);
            assert!(w >= 0.0 && 1.0 - fold + w <= 1.0, "{fold} {w}");
        }
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
