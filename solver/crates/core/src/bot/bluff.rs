use crate::tree::{ActionKind, Street};

pub const BLUFF_ZONE: f64 = 0.35;
pub const BLUFF_PULL: f64 = 1.0;

pub fn pull(bluff: f64, street: Street, percentile: f64) -> f64 {
    if street == Street::Preflop || percentile >= BLUFF_ZONE {
        return 0.0;
    }
    (BLUFF_PULL * bluff.log2()).clamp(-1.0, 1.0)
}

pub fn is_bet(kind: ActionKind) -> bool {
    matches!(kind, ActionKind::RaiseTo(_) | ActionKind::AllIn)
}

fn mass(row: &[f64], kinds: &[ActionKind], bets: bool) -> f64 {
    row.iter()
        .zip(kinds)
        .filter(|(_, &k)| is_bet(k) == bets)
        .map(|(w, _)| w)
        .sum()
}

fn spread(row: &mut [f64], kinds: &[ActionKind], mix: &[f64], bets: bool, amount: f64) {
    let total = mass(mix, kinds, bets);
    let count = kinds.iter().filter(|&&k| is_bet(k) == bets).count() as f64;
    for (i, &kind) in kinds.iter().enumerate() {
        if is_bet(kind) != bets {
            continue;
        }
        let share = if total > 0.0 {
            mix[i] / total
        } else {
            1.0 / count
        };
        row[i] += amount * share;
    }
}

fn checked_to(kinds: &[ActionKind]) -> Option<usize> {
    if kinds.contains(&ActionKind::Fold) || !kinds.iter().any(|&k| is_bet(k)) {
        return None;
    }
    kinds.iter().position(|&k| k == ActionKind::Check)
}

pub fn bluffed(row: &[f64], kinds: &[ActionKind], t: f64, fallback: &[f64]) -> Vec<f64> {
    let Some(check) = checked_to(kinds).filter(|_| t != 0.0) else {
        return row.to_vec();
    };
    let (bets, passive) = (mass(row, kinds, true), mass(row, kinds, false));
    let mut out: Vec<f64> = row
        .iter()
        .zip(kinds)
        .map(|(&w, &k)| match (is_bet(k), t > 0.0) {
            (false, true) => w * (1.0 - t),
            (true, false) => w * (1.0 + t),
            _ => w,
        })
        .collect();
    if t > 0.0 {
        let mix = if bets > 0.0 { row } else { fallback };
        spread(&mut out, kinds, mix, true, passive * t);
    } else if passive > 0.0 {
        spread(&mut out, kinds, row, false, -bets * t);
    } else {
        out[check] -= bets * t;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree::ActionKind::{AllIn, Call, Check, Fold, RaiseTo};

    fn close(a: &[f64], b: &[f64]) -> bool {
        a.len() == b.len() && a.iter().zip(b).all(|(x, y)| (x - y).abs() < 1e-9)
    }

    #[test]
    fn the_pull_acts_on_weak_hands_after_the_flop_only() {
        assert_eq!(pull(2.0, Street::Preflop, 0.1), 0.0);
        assert_eq!(pull(2.0, Street::River, BLUFF_ZONE), 0.0);
        assert_eq!(pull(2.0, Street::River, 0.9), 0.0);
        assert_eq!(pull(1.0, Street::Turn, 0.1), 0.0);
        for street in [Street::Flop, Street::Turn, Street::River] {
            assert!((pull(2.0, street, 0.1) - BLUFF_PULL).abs() < 1e-12);
            assert!((pull(0.5, street, 0.1) + BLUFF_PULL).abs() < 1e-12);
        }
        assert!((pull(2f64.sqrt(), Street::River, 0.2) - BLUFF_PULL / 2.0).abs() < 1e-12);
        assert_eq!(pull(8.0, Street::River, 0.2), 1.0);
        assert_eq!(pull(0.125, Street::River, 0.2), -1.0);
    }

    #[test]
    fn a_positive_pull_moves_passive_mass_into_the_bets_by_their_own_mix() {
        let kinds = [Check, RaiseTo(30), AllIn];
        let w = bluffed(&[80.0, 15.0, 5.0], &kinds, 0.5, &[0.0, 0.0, 9.0]);
        assert!(close(&w, &[40.0, 45.0, 15.0]), "{w:?}");
    }

    #[test]
    fn a_hand_that_never_bets_borrows_the_mix_of_the_node() {
        let kinds = [Check, RaiseTo(30), AllIn];
        let w = bluffed(&[100.0, 0.0, 0.0], &kinds, 0.8, &[50.0, 30.0, 10.0]);
        assert!(close(&w, &[20.0, 60.0, 20.0]), "{w:?}");
        let w = bluffed(&[100.0, 0.0, 0.0], &kinds, 0.8, &[100.0, 0.0, 0.0]);
        assert!(close(&w, &[20.0, 40.0, 40.0]), "{w:?}");
    }

    #[test]
    fn a_negative_pull_gives_bets_back_to_the_passive_actions() {
        let kinds = [Check, RaiseTo(30), AllIn];
        let w = bluffed(&[60.0, 30.0, 10.0], &kinds, -0.8, &[0.0, 1.0, 1.0]);
        assert!(close(&w, &[92.0, 6.0, 2.0]), "{w:?}");
    }

    #[test]
    fn a_pure_bluff_given_up_checks() {
        let open = [Check, RaiseTo(30)];
        let w = bluffed(&[0.0, 100.0], &open, -1.0, &[0.0, 1.0]);
        assert!(close(&w, &[100.0, 0.0]), "{w:?}");
    }

    #[test]
    fn no_pull_no_bet_or_a_bet_to_face_keeps_the_row() {
        let kinds = [Check, RaiseTo(30)];
        assert_eq!(
            bluffed(&[70.0, 30.0], &kinds, 0.0, &[0.0, 1.0]),
            vec![70.0, 30.0]
        );
        let calls = [Fold, Call];
        assert_eq!(
            bluffed(&[70.0, 30.0], &calls, 0.8, &[0.0, 0.0]),
            vec![70.0, 30.0]
        );
        let facing = [Fold, Call, RaiseTo(90)];
        let row = [60.0, 20.0, 20.0];
        assert_eq!(bluffed(&row, &facing, 0.8, &[0.0, 0.0, 1.0]), row.to_vec());
        assert_eq!(bluffed(&row, &facing, -0.8, &[0.0, 0.0, 1.0]), row.to_vec());
    }
}
