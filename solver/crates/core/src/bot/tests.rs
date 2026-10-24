use super::*;
use crate::measure::fixtures::trained;
use crate::rng::Rng;
use crate::subgame::combos::COMBOS;
use crate::subgame::range::Range;
use crate::subgame::tree::{build, Root, Sizes, SubAction, SubNode};
use crate::tree::{ActionKind, Node};
use std::sync::OnceLock;

fn model() -> &'static Model {
    static M: OnceLock<Model> = OnceLock::new();
    M.get_or_init(|| Model::new(trained().clone()).unwrap())
}

fn child(id: NodeId, kind: ActionKind) -> NodeId {
    let Node::Decision { actions, .. } = model().file.tree.node(id) else {
        panic!("not a decision");
    };
    actions.iter().find(|a| a.0 == kind).unwrap().1
}

fn draw_for(id: NodeId, bucket: u16, kind: ActionKind) -> f64 {
    let Node::Decision { actions, .. } = model().file.tree.node(id) else {
        panic!("not a decision");
    };
    let p = model().file.probabilities(id, bucket);
    let i = actions.iter().position(|a| a.0 == kind).unwrap();
    let before: u32 = p[..i].iter().map(|&x| u32::from(x)).sum();
    if p[i] == 0 {
        return -1.0;
    }
    (f64::from(before) + 0.5) / 255.0
}

fn started(hero_button: bool, stacks: [u32; 2], blinds: [u32; 2], hole: [Card; 2]) -> Bot {
    let mut bot = Bot::new();
    bot.hand_started(model(), hero_button, stacks, blinds);
    bot.hole_cards(hole);
    bot
}

fn facing_blind(bb: u32, stack: u32) -> Legal {
    Legal {
        fold: true,
        check: false,
        call: Some(bb / 2),
        raise: Some((2 * bb, stack)),
    }
}

#[test]
fn a_new_hand_starts_at_the_root() {
    let bot = started(true, [400, 400], [10, 20], [0, 5]);
    assert_eq!(bot.cursor(), Some(model().file.tree.root()));
}

#[test]
fn own_raise_keeps_the_pot_fraction_at_a_bigger_blind() {
    let root = model().file.tree.root();
    let hole = [48, 49];
    let bucket = model().abstraction.bucket(Street::Preflop, hole, &[]);
    let draw = draw_for(root, bucket, ActionKind::RaiseTo(50));
    assert!(draw >= 0.0, "the fixture never opens this hand");
    let mut bot = started(true, [2000, 2000], [50, 100], hole);
    let mv = bot.decide(model(), &facing_blind(100, 2000), draw);
    assert_eq!(mv, Move::RaiseTo(250));
    bot.acted(model(), true, mv, 0.0);
    assert_eq!(bot.cursor(), Some(child(root, ActionKind::RaiseTo(50))));
}

#[test]
fn opponent_raise_on_a_tree_size_follows_that_size() {
    let root = model().file.tree.root();
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::RaiseTo(50), 0.3);
    assert_eq!(bot.cursor(), Some(child(root, ActionKind::RaiseTo(50))));
}

#[test]
fn opponent_jam_maps_to_all_in() {
    let root = model().file.tree.root();
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::RaiseTo(400), 0.3);
    assert_eq!(bot.cursor(), Some(child(root, ActionKind::AllIn)));
}

#[test]
fn opponent_call_follows_the_call() {
    let root = model().file.tree.root();
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::Call, 0.3);
    assert_eq!(bot.cursor(), Some(child(root, ActionKind::Call)));
}

#[test]
fn a_lost_cursor_resyncs_to_the_hero_spot() {
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::Check, 0.3);
    assert_eq!(bot.cursor(), None);
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((40, 380)),
    };
    let mv = bot.decide(model(), &legal, 0.5);
    assert!(is_legal(mv, &legal), "{mv:?}");
    bot.street(model(), &[10, 20, 30]);
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((20, 360)),
    };
    let mv = bot.decide(model(), &legal, 0.5);
    assert!(is_legal(mv, &legal), "{mv:?}");
    let id = bot.cursor().unwrap();
    let Node::Decision {
        seat,
        street,
        street_bets,
        ..
    } = model().file.tree.node(id)
    else {
        panic!("not a decision");
    };
    assert_eq!((*seat, *street), (1, Street::Flop));
    assert_eq!(street_bets[0], street_bets[1]);
}

#[test]
fn never_folds_when_checking_is_free() {
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: None,
    };
    assert_eq!(passive(&legal), Move::Check);
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(30),
        raise: None,
    };
    assert_eq!(passive(&legal), Move::Call);
}

fn is_legal(mv: Move, legal: &Legal) -> bool {
    match mv {
        Move::Fold => legal.fold,
        Move::Check => legal.check,
        Move::Call => legal.call.is_some(),
        Move::RaiseTo(to) => legal.raise.is_some_and(|(lo, hi)| (lo..=hi).contains(&to)),
    }
}

struct Sim {
    behind: [u32; 2],
    bets: [u32; 2],
    acted: [bool; 2],
    last_raise: u32,
    bb: u32,
    to_act: usize,
    over: bool,
}

impl Sim {
    fn legal(&self) -> Legal {
        let me = self.to_act;
        let top = self.bets[0].max(self.bets[1]);
        let to_call = top - self.bets[me];
        let stack = self.behind[me];
        let all_in = self.bets[me] + stack;
        let raise = (stack > to_call && self.behind[1 - me] > 0)
            .then(|| ((top + self.last_raise.max(self.bb)).min(all_in), all_in));
        Legal {
            fold: to_call > 0,
            check: to_call == 0,
            call: (to_call > 0).then(|| to_call.min(stack)),
            raise,
        }
    }

    fn apply(&mut self, mv: Move) {
        let me = self.to_act;
        let top = self.bets[0].max(self.bets[1]);
        match mv {
            Move::Fold => self.over = true,
            Move::Check => {}
            Move::Call => {
                let add = (top - self.bets[me]).min(self.behind[me]);
                self.bets[me] += add;
                self.behind[me] -= add;
            }
            Move::RaiseTo(to) => {
                self.behind[me] -= to - self.bets[me];
                self.bets[me] = to;
                self.last_raise = self.last_raise.max(to - top);
            }
        }
        self.acted[me] = true;
        self.to_act = 1 - me;
    }

    fn street_closed(&self) -> bool {
        let matched = self.bets[0] == self.bets[1];
        let stuck = self.behind[0] == 0 || self.behind[1] == 0;
        let can_act = |s: usize| self.behind[s] > 0 && self.bets[s] < self.bets[1 - s];
        (self.acted[0] && self.acted[1] && (matched || stuck)) || (stuck && !can_act(self.to_act))
    }

    fn next_street(&mut self) {
        self.bets = [0, 0];
        self.acted = [false, false];
        self.last_raise = 0;
        self.to_act = 1;
    }
}

fn random_move(legal: &Legal, rng: &mut Rng) -> Move {
    let mut options = Vec::new();
    if legal.fold {
        options.push(Move::Fold);
    }
    if legal.check {
        options.push(Move::Check);
    }
    if legal.call.is_some() {
        options.push(Move::Call);
    }
    if let Some((lo, hi)) = legal.raise {
        options.push(Move::RaiseTo(lo + rng.below(hi - lo + 1)));
        options.push(Move::RaiseTo(hi));
    }
    options[rng.below(options.len() as u32) as usize]
}

struct Table {
    big_blinds: &'static [u32],
    stack: fn(&mut Rng, u32) -> u32,
    solver: Option<SolverConfig>,
    calm: bool,
}

fn deep_in_blinds(rng: &mut Rng, bb: u32) -> u32 {
    bb * (5 + rng.below(200))
}

fn four_hundred_to_thirty_thousand(rng: &mut Rng, _: u32) -> u32 {
    400 + rng.below(29_601)
}

const BLUEPRINT: Table = Table {
    big_blinds: &[20, 50, 100],
    stack: deep_in_blinds,
    solver: None,
    calm: false,
};

fn play_random_hand(rng: &mut Rng, table: &Table) -> usize {
    let bb = table.big_blinds[rng.below(table.big_blinds.len() as u32) as usize];
    let hero = rng.below(2) as usize;
    let stacks = [(table.stack)(rng, bb), (table.stack)(rng, bb)];
    let mut deck: Vec<Card> = (0..52).collect();
    rng.shuffle(&mut deck);
    let mut bot = started(
        hero == 0,
        [stacks[hero], stacks[1 - hero]],
        [bb / 2, bb],
        [deck[0], deck[1]],
    );
    bot.set_solver(table.solver);
    let blinds = [(bb / 2).min(stacks[0]), bb.min(stacks[1])];
    let mut sim = Sim {
        behind: [stacks[0] - blinds[0], stacks[1] - blinds[1]],
        bets: blinds,
        acted: [false, false],
        last_raise: bb,
        bb,
        to_act: 0,
        over: false,
    };
    let mut solved = 0;
    for board_len in [0usize, 3, 4, 5] {
        if board_len > 0 {
            sim.next_street();
            bot.street(model(), &deck[4..4 + board_len]);
        }
        while !sim.over && !sim.street_closed() {
            let legal = sim.legal();
            let mv = if sim.to_act == hero {
                let mv = bot.decide(model(), &legal, rng.next_f64());
                assert!(is_legal(mv, &legal), "{mv:?} under {legal:?}");
                solved += usize::from(bot.last_evs().is_some());
                mv
            } else if table.calm && rng.below(4) != 0 {
                passive(&legal)
            } else {
                random_move(&legal, rng)
            };
            bot.acted(model(), sim.to_act == hero, mv, rng.next_f64());
            sim.apply(mv);
        }
        if sim.over {
            return solved;
        }
    }
    solved
}

#[test]
fn random_hands_at_any_depth_and_blind_get_legal_moves() {
    let mut rng = Rng::new(2026);
    let solved: usize = (0..400)
        .map(|_| play_random_hand(&mut rng, &BLUEPRINT))
        .sum();
    assert_eq!(solved, 0);
}

fn solved_random_hands(hands: usize, turn_iterations: u32, river_iterations: u32) -> usize {
    let table = Table {
        big_blinds: &[20, 100],
        stack: four_hundred_to_thirty_thousand,
        solver: Some(SolverConfig {
            turn_iterations,
            river_iterations,
        }),
        calm: true,
    };
    let mut rng = Rng::new(2027);
    (0..hands).map(|_| play_random_hand(&mut rng, &table)).sum()
}

#[test]
fn a_few_random_hands_with_the_solver_get_legal_moves() {
    let solved = solved_random_hands(8, 1, 2);
    assert!(solved >= 1, "{solved}");
}

#[test]
#[ignore]
fn random_hands_with_the_solver_get_legal_moves() {
    let solved = solved_random_hands(60, 4, 8);
    assert!(solved >= 10, "{solved}");
}

fn expected_after(id: NodeId, kind: ActionKind, street: Street, board: &[Card]) -> Range {
    let Node::Decision { actions, .. } = model().file.tree.node(id) else {
        panic!("not a decision");
    };
    let i = actions.iter().position(|a| a.0 == kind).unwrap();
    let mut range = Range::uniform().without(board);
    range.update(|combo| {
        let bucket = model().abstraction.bucket(street, combo, board);
        let p = model().file.probabilities(id, bucket)[i];
        f32::from(p.max(1)) / 255.0
    });
    range
}

#[test]
fn ranges_start_uniform() {
    let bot = started(true, [400, 400], [10, 20], [0, 5]);
    let ranges = bot.ranges().unwrap();
    assert_eq!(ranges[0], Range::uniform());
    assert_eq!(ranges[1], Range::uniform());
}

#[test]
fn a_preflop_raise_reweights_the_raiser() {
    let root = model().file.tree.root();
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::RaiseTo(50), 0.3);
    let ranges = bot.ranges().unwrap();
    let expected = expected_after(root, ActionKind::RaiseTo(50), Street::Preflop, &[]);
    assert_eq!(ranges[0], expected);
    assert_ne!(ranges[0], Range::uniform());
    assert_eq!(ranges[1], Range::uniform());
}

#[test]
fn own_actions_reweight_our_range() {
    let root = model().file.tree.root();
    let hole = [48, 49];
    let bucket = model().abstraction.bucket(Street::Preflop, hole, &[]);
    let draw = draw_for(root, bucket, ActionKind::RaiseTo(50));
    assert!(draw >= 0.0, "the fixture never opens this hand");
    let mut bot = started(true, [400, 400], [10, 20], hole);
    let mv = bot.decide(model(), &facing_blind(20, 400), draw);
    bot.acted(model(), true, mv, 0.0);
    let ranges = bot.ranges().unwrap();
    let expected = expected_after(root, ActionKind::RaiseTo(50), Street::Preflop, &[]);
    assert_eq!(ranges[0], expected);
    assert_eq!(ranges[1], Range::uniform());
}

#[test]
fn the_board_zeroes_dead_combos() {
    let mut bot = started(true, [400, 400], [10, 20], [0, 5]);
    let flop = [10, 20, 30];
    bot.street(model(), &flop);
    let dead = Range::uniform().without(&flop);
    let ranges = bot.ranges().unwrap();
    assert_eq!(ranges[0], dead);
    assert_eq!(ranges[1], dead);
}

#[test]
fn ranges_never_empty() {
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    let flop = [10, 20, 30];
    bot.hand.as_mut().unwrap().ranges[0] = Range {
        weights: vec![0.0; COMBOS],
    };
    bot.street(model(), &flop);
    let ranges = bot.ranges().unwrap();
    assert_eq!(ranges[0], Range::uniform().without(&flop));
}

#[test]
fn a_flop_action_reweights_by_the_flop_bucket() {
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    let flop = [10, 20, 30];
    bot.acted(model(), false, Move::Call, 0.3);
    bot.acted(model(), true, Move::Check, 0.3);
    bot.street(model(), &flop);
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((20, 360)),
    };
    bot.decide(model(), &legal, 0.5);
    let id = bot.cursor().unwrap();
    let before = bot.ranges().unwrap().clone();
    bot.acted(model(), true, Move::Check, 0.0);
    let after = bot.ranges().unwrap();
    assert_eq!(after[0], before[0]);
    assert_ne!(after[1], before[1]);
    let mut expected = before[1].clone();
    let i = match model().file.tree.node(id) {
        Node::Decision { actions, .. } => actions.iter().position(|a| Some(a.1) == bot.cursor()),
        _ => None,
    }
    .unwrap();
    expected.update(|combo| {
        let bucket = model().abstraction.bucket(Street::Flop, combo, &flop);
        f32::from(model().file.probabilities(id, bucket)[i].max(1)) / 255.0
    });
    assert_eq!(after[1], expected);
}

const QUICK: SolverConfig = SolverConfig {
    turn_iterations: 2,
    river_iterations: 4,
};

const TURN: [Card; 4] = [10, 20, 30, 40];

fn limped_to_the_turn(hero_button: bool, stacks: [u32; 2], solver: Option<SolverConfig>) -> Bot {
    let bot = solver.map_or_else(Bot::new, Bot::with_solver);
    limp(bot, hero_button, stacks)
}

fn limp(mut bot: Bot, hero_button: bool, stacks: [u32; 2]) -> Bot {
    bot.hand_started(model(), hero_button, stacks, [10, 20]);
    bot.hole_cards([0, 5]);
    bot.acted(model(), hero_button, Move::Call, 0.3);
    bot.acted(model(), !hero_button, Move::Check, 0.3);
    bot.street(model(), &TURN[..3]);
    bot.acted(model(), !hero_button, Move::Check, 0.3);
    bot.acted(model(), hero_button, Move::Check, 0.3);
    bot.street(model(), &TURN);
    bot
}

fn first_to_act() -> Legal {
    Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((20, 380)),
    }
}

fn root_actions(root: Root, path: &[SubAction]) -> Vec<SubAction> {
    let tree = build(root, &Sizes::default(), path);
    let node = tree.locate(path).unwrap();
    let SubNode::Decision { actions, .. } = &tree.nodes[node] else {
        panic!("not a decision");
    };
    actions.iter().map(|a| a.0).collect()
}

fn turn_root(behind: u32) -> Root {
    Root {
        street: Street::Turn,
        pot: 40,
        behind,
        big_blind: 20,
    }
}

#[test]
fn a_turn_decision_goes_through_the_solver() {
    let mut bot = limped_to_the_turn(false, [400, 400], Some(QUICK));
    let legal = first_to_act();
    let mv = bot.decide(model(), &legal, 0.5);
    assert!(is_legal(mv, &legal), "{mv:?}");
    let evs = bot.last_evs().expect("a solved decision");
    assert_eq!(evs.len(), root_actions(turn_root(380), &[]).len());
    assert!(evs.iter().all(|v| v.is_finite()));
}

#[test]
fn an_off_tree_turn_bet_is_answered_legally() {
    let mut bot = limped_to_the_turn(true, [400, 400], Some(QUICK));
    bot.acted(model(), false, Move::RaiseTo(20), 0.3);
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(20),
        raise: Some((40, 380)),
    };
    let mv = bot.decide(model(), &legal, 0.5);
    assert!(is_legal(mv, &legal), "{mv:?}");
    let actions = root_actions(turn_root(380), &[SubAction::RaiseTo(20)]);
    assert!(actions.contains(&SubAction::Fold));
    assert!(actions.contains(&SubAction::Call));
    assert!(actions.iter().any(|a| matches!(a, SubAction::RaiseTo(_))));
    assert_eq!(
        bot.last_evs().expect("a solved decision").len(),
        actions.len()
    );
}

#[test]
fn a_short_stack_turn_still_answers() {
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(60),
        raise: None,
    };
    for draw in [0.01, 0.5, 0.99] {
        let mut bot = limped_to_the_turn(true, [80, 80], Some(QUICK));
        bot.acted(model(), false, Move::RaiseTo(60), 0.3);
        let mv = bot.decide(model(), &legal, draw);
        assert!(matches!(mv, Move::Fold | Move::Call), "{mv:?}");
        assert_eq!(bot.last_evs().expect("a solved decision").len(), 2);
    }
}

#[test]
fn no_solver_means_no_evs() {
    let mut bot = limped_to_the_turn(false, [400, 400], None);
    assert_eq!(
        bot.decide(model(), &first_to_act(), 0.9),
        Move::RaiseTo(380)
    );
    assert_eq!(bot.last_evs(), None);
}

#[test]
fn a_zero_config_is_off() {
    let off = SolverConfig {
        turn_iterations: 0,
        river_iterations: 0,
    };
    let mut bot = limp(Bot::with_solver(off), false, [400, 400]);
    assert_eq!(
        bot.decide(model(), &first_to_act(), 0.9),
        Move::RaiseTo(380)
    );
    assert_eq!(bot.last_evs(), None);
}

#[test]
fn a_new_hand_clears_the_evs() {
    let mut bot = limped_to_the_turn(false, [400, 400], Some(QUICK));
    bot.decide(model(), &first_to_act(), 0.5);
    assert!(bot.last_evs().is_some());
    bot.hand_started(model(), false, [400, 400], [10, 20]);
    assert_eq!(bot.last_evs(), None);
}

#[test]
fn the_river_starts_from_the_turn_solve() {
    let mut bot = limped_to_the_turn(false, [400, 400], Some(QUICK));
    bot.decide(model(), &first_to_act(), 0.5);
    bot.acted(model(), true, Move::Check, 0.3);
    bot.acted(model(), false, Move::Check, 0.3);
    let hand = bot.hand.as_ref().unwrap();
    let solve = hand.sub.solve.as_ref().expect("a turn solve");
    let chance = solve.tree().locate(&hand.sub.path).unwrap();
    assert!(matches!(solve.tree().nodes[chance], SubNode::Chance { .. }));
    let river = [10, 20, 30, 40, 50];
    let expected = solve
        .ranges_at(chance, None)
        .map(|r| r.without(&river).or_uniform(&river));
    let tracked = hand.ranges.clone().map(|r| r.without(&river));
    bot.street(model(), &river);
    let sub = &bot.hand.as_ref().unwrap().sub;
    assert_eq!(sub.ranges, expected);
    assert_ne!(sub.ranges[1], tracked[1]);
    assert!(sub.solve.is_none());
    assert!(sub.path.is_empty());
}

fn first_raise(actions: &[SubAction]) -> u32 {
    actions
        .iter()
        .find_map(|a| match a {
            SubAction::RaiseTo(to) => Some(*to),
            _ => None,
        })
        .expect("an on-tree raise")
}

#[test]
fn an_on_tree_second_decision_reuses_the_street_solve() {
    let mut bot = limped_to_the_turn(false, [400, 400], Some(QUICK));
    bot.decide(model(), &first_to_act(), 0.5);
    let bet = first_raise(&root_actions(turn_root(380), &[]));
    let raise = first_raise(&root_actions(turn_root(380), &[SubAction::RaiseTo(bet)]));
    bot.acted(model(), true, Move::RaiseTo(bet), 0.3);
    bot.acted(model(), false, Move::RaiseTo(raise), 0.3);
    let marked = QUICK.turn_iterations + 1;
    let sub = &mut bot.hand.as_mut().unwrap().sub;
    sub.solve.as_mut().expect("a turn solve").run(1);
    assert_eq!(sub.solve.as_ref().unwrap().iterations(), marked);
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(raise - bet),
        raise: Some((2 * raise - bet, 380)),
    };
    let mv = bot.decide(model(), &legal, 0.5);
    assert!(is_legal(mv, &legal), "{mv:?}");
    assert!(bot.last_evs().is_some());
    let solve = bot.hand.as_ref().unwrap().sub.solve.as_ref().unwrap();
    assert_eq!(solve.iterations(), marked);
}
