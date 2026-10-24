use super::*;
use crate::cards::parse_cards;
use crate::rng::Rng;
use crate::subgame::combos::{combo_cards, combo_index, COMBOS};
use crate::subgame::tree::{build, Root, Sizes, StreetSizes, SubAction, SubNode};
use crate::tree::Street;

fn cards(s: &str) -> Vec<Card> {
    parse_cards(s).unwrap()
}

fn hole(s: &str) -> [Card; 2] {
    let c = cards(s);
    [c[0], c[1]]
}

fn index(s: &str) -> usize {
    let h = hole(s);
    combo_index(h[0], h[1])
}

fn empty() -> Range {
    Range {
        weights: vec![0.0; COMBOS],
    }
}

fn value_hands() -> Vec<&'static str> {
    vec!["7c 7d", "7c 7s", "7d 7s"]
}

fn air_hands() -> Vec<String> {
    let mut out = Vec::new();
    for a in "cdhs".chars() {
        for b in "cdhs".chars() {
            out.push(format!("5{a} 4{b}"));
        }
    }
    out
}

fn catchers() -> Vec<String> {
    let mut out = Vec::new();
    for a in "cdh".chars() {
        for b in "cdhs".chars() {
            out.push(format!("K{a} Q{b}"));
        }
    }
    out
}

fn polarised_ranges() -> [Range; 2] {
    let mut catcher = empty();
    for h in catchers() {
        catcher.weights[index(&h)] = 1.0;
    }
    let mut bettor = empty();
    for h in value_hands() {
        bettor.weights[index(h)] = 1.0;
    }
    for h in air_hands() {
        bettor.weights[index(&h)] = 3.0 / 16.0;
    }
    [catcher, bettor]
}

fn polarised() -> Solver {
    let root = Root {
        street: Street::River,
        pot: 200,
        behind: 200,
        big_blind: 20,
    };
    let sizes = Sizes {
        turn: StreetSizes::standard(),
        river: StreetSizes {
            bets: vec![1.0],
            raises: vec![],
            max_aggressive: 1,
            all_in_threshold: 2.0 / 3.0,
        },
    };
    let tree = build(root, &sizes, &[]);
    Solver::new(tree, &cards("2c 3d 7h 8s Ks"), polarised_ranges())
}

fn action_slot(solver: &Solver, node: usize, want: fn(&SubAction) -> bool) -> (usize, usize) {
    let SubNode::Decision { actions, .. } = &solver.tree().nodes[node] else {
        panic!("not a decision");
    };
    let slot = actions.iter().position(|(a, _)| want(a)).unwrap();
    (slot, actions[slot].1)
}

fn is_bet(a: &SubAction) -> bool {
    matches!(a, SubAction::RaiseTo(_))
}

fn is_call(a: &SubAction) -> bool {
    matches!(a, SubAction::Call)
}

fn sums_to_one(p: &[f32]) -> bool {
    p.iter().all(|x| x.is_finite() && *x >= 0.0) && (p.iter().sum::<f32>() - 1.0).abs() < 1e-5
}

fn solver(street: Street, board: &str, behind: u32, ranges: [Range; 2]) -> Solver {
    let root = Root {
        street,
        pot: 400,
        behind,
        big_blind: 20,
    };
    let tree = build(root, &Sizes::default(), &[]);
    Solver::new(tree, &cards(board), ranges)
}

fn random_range(rng: &mut Rng) -> Range {
    Range {
        weights: (0..COMBOS).map(|_| rng.next_f64() as f32).collect(),
    }
}

#[test]
fn uniform_before_running() {
    let mut s = polarised();
    let p = s.strategy(0, None, hole("7c 7d"));
    assert_eq!(p.len(), 2);
    assert!(p.iter().all(|&x| (x - 0.5).abs() < 1e-6));
    s.run(50);
    assert_eq!(s.iterations(), 50);
    let zero = s.strategy(0, None, hole("Ac Ad"));
    assert!(sums_to_one(&zero), "{zero:?}");
    let on_board = s.strategy(0, None, hole("Ks Ac"));
    assert!(sums_to_one(&on_board), "{on_board:?}");
}

#[test]
fn polarised_river_matches_the_equilibrium() {
    let mut s = polarised();
    s.run(2000);
    let (bet, facing) = action_slot(&s, 0, is_bet);
    let value: f32 = value_hands()
        .iter()
        .map(|h| s.strategy(0, None, hole(h))[bet])
        .sum();
    let air: f32 = air_hands()
        .iter()
        .map(|h| 3.0 / 16.0 * s.strategy(0, None, hole(h))[bet])
        .sum();
    let share = air / (air + value);
    assert!((share - 1.0 / 3.0).abs() < 0.03, "air share {share}");
    let (call, _) = action_slot(&s, facing, is_call);
    let calls: f32 = catchers()
        .iter()
        .map(|h| s.strategy(facing, None, hole(h))[call])
        .sum::<f32>()
        / 12.0;
    assert!((calls - 0.5).abs() < 0.03, "call frequency {calls}");
}

#[test]
fn ranges_at_follows_the_strategy() {
    let mut s = polarised();
    s.run(300);
    let (bet, facing) = action_slot(&s, 0, is_bet);
    let root = polarised_ranges();
    let at = s.ranges_at(facing, None);
    for c in 0..COMBOS {
        let want = root[1].weights[c] * s.strategy(0, None, combo_cards(c))[bet];
        assert!((at[1].weights[c] - want).abs() < 1e-6, "{c}");
        assert!((at[0].weights[c] - root[0].weights[c]).abs() < 1e-6, "{c}");
    }
}

#[test]
fn action_evs_are_finite_and_bounded() {
    let mut s = polarised();
    s.run(300);
    let (_, facing) = action_slot(&s, 0, is_bet);
    let evs = s.action_evs(facing, None, hole("Kc Qd"));
    assert_eq!(evs.len(), 2);
    assert!((evs[0] + 100.0).abs() < 1e-3, "{evs:?}");
    assert!(evs[1].is_finite() && evs[1].abs() <= 300.0, "{evs:?}");
    assert!(s
        .action_evs(facing, None, hole("Ks Qd"))
        .iter()
        .all(|&v| v == 0.0));
}

#[test]
fn river_exploitability_falls_below_half_a_percent() {
    let mut rng = Rng::new(5);
    let ranges = [random_range(&mut rng), random_range(&mut rng)];
    let mut s = solver(Street::River, "Ah 9c 6d 4s 2h", 1800, ranges);
    s.run(300);
    let e = s.exploitability();
    assert!((0.0..0.005 * 400.0).contains(&e), "{e}");
}

#[test]
fn turn_exploitability_falls_on_a_short_stack() {
    let ranges = [Range::uniform(), Range::uniform()];
    let mut s = solver(Street::Turn, "Ah 9c 6d 4s", 300, ranges);
    s.run(5);
    let e5 = s.exploitability();
    s.run(35);
    let e40 = s.exploitability();
    assert!(e5 > e40, "{e5} {e40}");
}

#[test]
fn turn_queries_take_a_river_card() {
    let ranges = [Range::uniform(), Range::uniform()];
    let mut s = solver(Street::Turn, "Ah 9c 6d 4s", 300, ranges);
    s.run(3);
    let checked = s
        .tree()
        .node_at(&[SubAction::Check, SubAction::Check])
        .unwrap();
    let SubNode::Chance { child } = s.tree().nodes[checked] else {
        panic!("expected chance");
    };
    let river = cards("Kd")[0];
    let p = s.strategy(child, Some(river), hole("Qc Jc"));
    assert!(sums_to_one(&p), "{p:?}");
    let blocked = s.strategy(child, Some(river), hole("Kd Jc"));
    assert!(sums_to_one(&blocked), "{blocked:?}");
    let at = s.ranges_at(child, Some(river));
    assert_eq!(at[0].weights[index("Kd Jc")], 0.0);
    assert!(at[0].weights[index("Qc Jc")] > 0.0);
    let evs = s.action_evs(child, Some(river), hole("Qc Jc"));
    assert!(evs.iter().all(|v| v.is_finite()), "{evs:?}");
}

#[test]
#[ignore]
fn turn_exploitability_falls_with_iterations() {
    let ranges = [Range::uniform(), Range::uniform()];
    let mut s = solver(Street::Turn, "Ah 9c 6d 4s", 1800, ranges);
    s.run(10);
    let e10 = s.exploitability();
    s.run(40);
    let e50 = s.exploitability();
    s.run(150);
    let e200 = s.exploitability();
    assert!(e10 > e50 && e50 > e200, "{e10} {e50} {e200}");
    assert!(e200 < 0.01 * 400.0, "{e200}");
}

#[test]
#[ignore]
fn turn_solve_of_a_hundred_iterations() {
    let ranges = [Range::uniform(), Range::uniform()];
    let mut s = solver(Street::Turn, "Ah 9c 6d 4s", 1800, ranges);
    s.run(100);
    assert_eq!(s.iterations(), 100);
}

#[test]
#[ignore]
fn river_solve_of_three_hundred_iterations() {
    let ranges = [Range::uniform(), Range::uniform()];
    let mut s = solver(Street::River, "Ah 9c 6d 4s 2h", 1800, ranges);
    s.run(300);
    assert_eq!(s.iterations(), 300);
}
