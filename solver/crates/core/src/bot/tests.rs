use super::*;
use crate::measure::fixtures::{trained, trained_multi_open};
use crate::pairs::{pair_cards, pair_index, PAIRS};
use crate::rng::Rng;
use crate::tree::{ActionKind, Node};
use range::range_of;
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

#[test]
fn raises_the_minimum_when_raising_is_the_only_legal_move() {
    let legal = Legal {
        fold: false,
        check: false,
        call: None,
        raise: Some((40, 400)),
    };
    assert_eq!(passive(&legal), Move::RaiseTo(40));
    for hole in [[48, 49], [0, 5], [48, 48]] {
        for k in 0..20 {
            let mut bot = started(true, [400, 400], [10, 20], hole);
            let mv = bot.decide(model(), &legal, f64::from(k) / 20.0);
            assert!(is_legal(mv, &legal), "{hole:?} {k} {mv:?}");
        }
    }
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

fn play_random_hand(rng: &mut Rng) {
    let bb = [20, 50, 100][rng.below(3) as usize];
    let hero = rng.below(2) as usize;
    let stacks = [bb * (5 + rng.below(200)), bb * (5 + rng.below(200))];
    let mut deck: Vec<Card> = (0..52).collect();
    rng.shuffle(&mut deck);
    let mut bot = started(
        hero == 0,
        [stacks[hero], stacks[1 - hero]],
        [bb / 2, bb],
        [deck[0], deck[1]],
    );
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
                mv
            } else {
                random_move(&legal, rng)
            };
            bot.acted(model(), sim.to_act == hero, mv, rng.next_f64());
            sim.apply(mv);
        }
        if sim.over {
            return;
        }
    }
}

#[test]
fn random_hands_at_any_depth_and_blind_get_legal_moves() {
    let mut rng = Rng::new(2026);
    for _ in 0..400 {
        play_random_hand(&mut rng);
    }
}

fn smallest_raise(id: NodeId) -> (f64, ActionKind, NodeId) {
    let spot = model().spot(id).unwrap();
    spot.actions
        .iter()
        .filter_map(|&(kind, child)| {
            let to = model().raise_to(&spot, kind)?;
            let f = fraction(to, spot.street_bets[1 - spot.seat], spot.pot_after_call());
            Some((f, kind, child))
        })
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .unwrap()
}

fn after_small_open_raise(draw: f64) -> Bot {
    let mut bot = started(false, [400, 400], [10, 20], [48, 49]);
    bot.acted(model(), false, Move::RaiseTo(40), draw);
    bot
}

fn facing_small_open_raise() -> Legal {
    Legal {
        fold: true,
        check: false,
        call: Some(20),
        raise: Some((60, 400)),
    }
}

#[test]
fn a_raise_below_the_smallest_size_maps_to_the_call_or_that_size() {
    let root = model().file.tree.root();
    let (smallest, _, raised) = smallest_raise(root);
    assert!(smallest > 0.5, "the fixture opens smaller than a min-raise");
    assert_eq!(
        after_small_open_raise(0.0).cursor(),
        Some(child(root, ActionKind::Call))
    );
    assert_eq!(after_small_open_raise(0.999).cursor(), Some(raised));
}

#[test]
fn a_small_raise_taken_as_a_call_is_never_folded() {
    let root = model().file.tree.root();
    let limped = child(root, ActionKind::Call);
    let legal = facing_small_open_raise();
    for i in 0..100 {
        let mut bot = after_small_open_raise(0.0);
        let mv = bot.decide(model(), &legal, f64::from(i) / 100.0);
        assert!(is_legal(mv, &legal), "{mv:?}");
        assert_ne!(mv, Move::Fold);
        assert_eq!(bot.cursor(), Some(limped));
    }
}

#[test]
fn a_tree_bet_over_a_small_raise_taken_as_a_call_keeps_its_fraction() {
    let root = model().file.tree.root();
    let limped = child(root, ActionKind::Call);
    let hole = [48, 49];
    let bucket = model().abstraction.bucket(Street::Preflop, hole, &[]);
    let (f, kind, bet) = smallest_raise(limped);
    let draw = draw_for(limped, bucket, kind);
    assert!(
        draw >= 0.0,
        "the fixture never raises this hand after a limp"
    );
    let legal = facing_small_open_raise();
    let mut bot = after_small_open_raise(0.0);
    let mv = bot.decide(model(), &legal, draw);
    assert_eq!(mv, Move::RaiseTo(scaled_raise(f, 40, 80, (60, 400))));
    bot.acted(model(), true, mv, 0.0);
    assert_eq!(bot.cursor(), Some(bet));
}

#[test]
fn a_small_raise_taken_as_a_street_closing_call_is_called() {
    let root = model().file.tree.root();
    let opened = child(root, ActionKind::RaiseTo(50));
    let (smallest, _, _) = smallest_raise(opened);
    assert!(
        smallest > 0.3,
        "the fixture re-raises smaller than a min-raise"
    );
    let flop = child(opened, ActionKind::Call);
    let mut bot = started(true, [400, 400], [10, 20], [48, 49]);
    bot.acted(model(), true, Move::RaiseTo(50), 0.0);
    bot.acted(model(), false, Move::RaiseTo(80), 0.0);
    assert_eq!(bot.cursor(), Some(flop));
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(30),
        raise: Some((110, 400)),
    };
    let mv = bot.decide(model(), &legal, 0.5);
    assert_eq!(mv, Move::Call);
    bot.acted(model(), true, mv, 0.0);
    bot.street(model(), &[10, 20, 30]);
    assert_eq!(bot.cursor(), Some(flop));
}

#[test]
fn a_small_bet_after_a_lost_cursor_is_rarely_folded() {
    let flop_bet = Legal {
        fold: true,
        check: false,
        call: Some(20),
        raise: Some((40, 1800)),
    };
    let mut folds = 0;
    for i in 0..100 {
        let mut bot = started(false, [2000, 2000], [10, 20], [48, 49]);
        bot.acted(model(), false, Move::Check, 0.0);
        bot.acted(model(), false, Move::RaiseTo(200), 0.0);
        bot.acted(model(), true, Move::Call, 0.0);
        bot.street(model(), &[10, 20, 30]);
        bot.acted(model(), true, Move::Check, 0.0);
        bot.acted(model(), false, Move::RaiseTo(20), 0.0);
        assert_eq!(bot.cursor(), None);
        let mv = bot.decide(model(), &flop_bet, f64::from(i) / 100.0);
        assert!(is_legal(mv, &flop_bet), "{mv:?}");
        if mv == Move::Fold {
            folds += 1;
        }
        if i == 0 {
            let spot = model().spot(bot.cursor().unwrap()).unwrap();
            assert_eq!(spot.to_call(), 0);
        }
    }
    assert!(folds <= 15, "{folds} folds to a twentieth of the pot");
}

fn multi_model() -> &'static Model {
    static M: OnceLock<Model> = OnceLock::new();
    M.get_or_init(|| Model::new(trained_multi_open().clone()).unwrap())
}

const DRAWS: usize = 2000;

fn draw_at(k: usize) -> f64 {
    (k as f64 + 0.5) / DRAWS as f64
}

fn open_children() -> Vec<(ActionKind, NodeId)> {
    let tree = &multi_model().file.tree;
    let Node::Decision { actions, .. } = tree.node(tree.root()) else {
        panic!("not a decision");
    };
    actions
        .iter()
        .copied()
        .filter(|a| matches!(a.0, ActionKind::RaiseTo(_) | ActionKind::AllIn))
        .collect()
}

fn open_child(kind: ActionKind) -> NodeId {
    open_children().iter().find(|a| a.0 == kind).unwrap().1
}

fn opponent_opens(to: u32, draw: f64) -> Bot {
    let mut bot = Bot::new();
    bot.hand_started(multi_model(), false, [2000, 2000], [10, 20]);
    bot.hole_cards([0, 5]);
    bot.acted(multi_model(), false, Move::RaiseTo(to), draw);
    bot
}

fn root_fraction(to: u32) -> f64 {
    fraction(to, 20, 40)
}

#[test]
fn the_multi_open_tree_has_three_opens_and_an_all_in() {
    let kinds: Vec<ActionKind> = open_children().iter().map(|a| a.0).collect();
    assert_eq!(
        kinds,
        vec![
            ActionKind::RaiseTo(40),
            ActionKind::RaiseTo(60),
            ActionKind::RaiseTo(80),
            ActionKind::AllIn
        ]
    );
}

#[test]
fn a_five_bb_open_maps_to_the_four_bb_child_mostly() {
    let four = open_child(ActionKind::RaiseTo(80));
    let hits = (0..DRAWS)
        .filter(|&k| opponent_opens(100, draw_at(k)).cursor() == Some(four))
        .count();
    let share = hits as f64 / DRAWS as f64;
    let expected = pseudo_harmonic(root_fraction(80), root_fraction(2000), root_fraction(100));
    assert!((share - expected).abs() < 0.03, "{share} vs {expected}");
    assert!(share >= 0.8, "{share}");
}

#[test]
fn a_two_and_a_half_bb_open_splits_between_two_and_three() {
    let two = open_child(ActionKind::RaiseTo(40));
    let three = open_child(ActionKind::RaiseTo(60));
    let (mut twos, mut threes) = (0, 0);
    for k in 0..DRAWS {
        let cursor = opponent_opens(50, draw_at(k)).cursor();
        if cursor == Some(two) {
            twos += 1;
        } else if cursor == Some(three) {
            threes += 1;
        }
    }
    assert!(twos > 0 && threes > 0, "{twos} {threes}");
    assert_eq!(twos + threes, DRAWS);
}

#[test]
fn a_ten_bb_open_is_answered_legally() {
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(180),
        raise: Some((380, 2000)),
    };
    let mut on_tree = 0;
    for k in 0..DRAWS {
        let mut bot = opponent_opens(200, draw_at(k));
        on_tree += usize::from(bot.cursor().is_some());
        let mv = bot.decide(multi_model(), &legal, draw_at((k * 7919) % DRAWS));
        assert!(is_legal(mv, &legal), "{mv:?}");
    }
    assert_eq!(on_tree, DRAWS);
}

fn opening_raise_draw(hole: [Card; 2]) -> f64 {
    let root = model().file.tree.root();
    let bucket = model().abstraction.bucket(Street::Preflop, hole, &[]);
    let draw = draw_for(root, bucket, ActionKind::RaiseTo(50));
    assert!(draw >= 0.0, "the fixture never opens this hand");
    draw
}

#[test]
fn an_inverted_raise_range_plays_passive() {
    let hole = [48, 49];
    let draw = opening_raise_draw(hole);
    let mut bot = started(true, [400, 400], [10, 20], hole);
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(10),
        raise: Some((400, 40)),
    };
    assert_eq!(bot.decide(model(), &legal, draw), Move::Call);
}

#[test]
fn invalid_hole_cards_play_passive() {
    let draw = opening_raise_draw([48, 49]);
    for hole in [[48, 48], [48, 52], [200, 49]] {
        let mut bot = started(true, [400, 400], [10, 20], hole);
        let mv = bot.decide(model(), &facing_blind(20, 400), draw);
        assert_eq!(mv, Move::Call, "{hole:?}");
    }
}

#[test]
fn a_board_that_repeats_a_card_plays_passive() {
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((20, 360)),
    };
    for board in [[48, 20, 30], [10, 10, 30], [10, 20, 52]] {
        let mut bot = started(false, [400, 400], [10, 20], [48, 49]);
        bot.acted(model(), false, Move::Call, 0.3);
        bot.acted(model(), true, Move::Check, 0.3);
        bot.street(model(), &board);
        assert_eq!(bot.decide(model(), &legal, 0.99), Move::Check, "{board:?}");
    }
}

#[test]
fn spot_arithmetic_saturates_on_a_malformed_tree() {
    let spot = Spot {
        seat: 0,
        street: Street::Flop,
        committed: [u32::MAX, u32::MAX],
        street_bets: [30, 10],
        actions: &[],
    };
    assert_eq!(spot.to_call(), 0);
    assert_eq!(spot.pot_after_call(), u32::MAX);
    let behind = Spot {
        committed: [u32::MAX, 0],
        street_bets: [u32::MAX, 0],
        ..spot
    };
    assert_eq!(model().raise_to(&behind, ActionKind::AllIn), Some(u32::MAX));
    let over = Spot {
        committed: [u32::MAX, 0],
        street_bets: [0, 0],
        ..spot
    };
    assert_eq!(model().raise_to(&over, ActionKind::AllIn), Some(0));
}

#[test]
fn huge_stacks_do_not_overflow_the_pot() {
    let mut bot = started(false, [u32::MAX, u32::MAX], [10, 20], [48, 49]);
    bot.acted(model(), false, Move::Check, 0.3);
    bot.acted(model(), false, Move::RaiseTo(u32::MAX), 0.3);
    assert_eq!(bot.cursor(), None);
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(u32::MAX - 20),
        raise: None,
    };
    let mv = bot.decide(model(), &legal, 0.5);
    assert!(is_legal(mv, &legal), "{mv:?}");
}

fn p_of(id: NodeId, bucket: u16, kind: ActionKind) -> f32 {
    let Node::Decision { actions, .. } = model().file.tree.node(id) else {
        panic!("not a decision");
    };
    let p = model().file.probabilities(id, bucket);
    let i = actions.iter().position(|a| a.0 == kind).unwrap();
    let sum: u32 = p.iter().map(|&x| u32::from(x)).sum();
    f32::from(p[i]) / sum as f32
}

fn opened(hole: [Card; 2]) -> Bot {
    let root = model().file.tree.root();
    let bucket = model().abstraction.bucket(Street::Preflop, hole, &[]);
    let draw = draw_for(root, bucket, ActionKind::RaiseTo(50));
    assert!(draw >= 0.0, "the fixture never opens this hand");
    let mut bot = started(true, [400, 400], [10, 20], hole);
    let mv = bot.decide(model(), &facing_blind(20, 400), draw);
    bot.acted(model(), true, mv, 0.0);
    bot
}

#[test]
fn a_new_hand_has_a_uniform_range() {
    let bot = started(true, [400, 400], [10, 20], [0, 5]);
    assert!(bot.history().is_empty());
    let range = bot.range(model());
    assert_eq!(range.len(), PAIRS);
    assert!(range.iter().all(|&w| w == 1.0));
}

#[test]
fn a_sampled_decision_adds_one_step() {
    let root = model().file.tree.root();
    let bot = opened([48, 49]);
    let Node::Decision { actions, .. } = model().file.tree.node(root) else {
        panic!("not a decision");
    };
    let open = actions
        .iter()
        .position(|a| a.0 == ActionKind::RaiseTo(50))
        .unwrap();
    assert_eq!(bot.history().len(), 1);
    let step = &bot.history()[0];
    assert_eq!(
        (step.node, step.action, step.street),
        (root, open, Street::Preflop)
    );
    assert!(step.board.is_empty());
}

#[test]
fn the_range_follows_the_strategy() {
    let root = model().file.tree.root();
    let range = opened([48, 49]).range(model());
    for (i, &w) in range.iter().enumerate() {
        let bucket = model()
            .abstraction
            .bucket(Street::Preflop, pair_cards(i), &[]);
        let p = p_of(root, bucket, ActionKind::RaiseTo(50));
        assert!((w - p).abs() < 1e-6, "{:?}: {w} vs {p}", pair_cards(i));
    }
    assert!(range.iter().any(|&w| w != range[0]));
}

#[test]
fn board_pairs_leave_the_range() {
    let mut bot = opened([48, 49]);
    let board = [10, 20, 30];
    bot.street(model(), &board);
    let range = bot.range(model());
    for (i, &w) in range.iter().enumerate() {
        let c = pair_cards(i);
        if board.contains(&c[0]) || board.contains(&c[1]) {
            assert_eq!(w, 0.0, "{c:?}");
        }
    }
}

#[test]
fn a_passive_play_off_the_tree_adds_no_step() {
    let mut bot = started(true, [400, 400], [10, 20], [48, 48]);
    bot.decide(model(), &facing_blind(20, 400), 0.5);
    assert!(bot.history().is_empty());
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::Check, 0.3);
    bot.street(model(), &[10, 20, 30]);
    assert!(bot.history().is_empty());
}

fn impossible_step() -> Step {
    let root = model().file.tree.root();
    let Node::Decision { actions, .. } = model().file.tree.node(root) else {
        panic!("not a decision");
    };
    Step {
        node: root,
        action: actions.len(),
        street: Street::Preflop,
        board: Vec::new(),
    }
}

#[test]
fn an_impossible_step_keeps_the_previous_range() {
    let bot = opened([48, 49]);
    let mut steps = bot.history().to_vec();
    let before = range_of(model(), &steps, &[]);
    steps.push(impossible_step());
    assert_eq!(range_of(model(), &steps, &[]), before);
}

fn on_the_flop(hole: [Card; 2]) -> (Bot, Legal) {
    let mut bot = started(false, [400, 400], [10, 20], hole);
    bot.acted(model(), false, Move::Call, 0.3);
    bot.acted(model(), true, Move::Check, 0.3);
    bot.street(model(), &[10, 20, 30]);
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((20, 360)),
    };
    (bot, legal)
}

fn preflop_spot() -> (Bot, Legal) {
    (
        started(true, [400, 400], [10, 20], [48, 49]),
        facing_blind(20, 400),
    )
}

#[test]
fn spot_is_the_node_decide_samples() {
    for (mut bot, legal) in [preflop_spot(), on_the_flop([48, 49])] {
        let spot = bot.spot(model(), &legal).unwrap();
        assert!(!spot.approximate);
        bot.decide(model(), &legal, 0.5);
        let step = bot.history().last().unwrap();
        assert_eq!((spot.node, spot.street), (step.node, step.street));
    }
}

#[test]
fn spot_moves_are_the_real_moves() {
    for setup in [preflop_spot, || on_the_flop([48, 49])] {
        let (bot, legal) = setup();
        let spot = bot.spot(model(), &legal).unwrap();
        let hand = bot.hand.as_ref().unwrap();
        let bucket = model()
            .abstraction
            .bucket(hand.street, hand.hole.unwrap(), &hand.board);
        let Node::Decision { actions, .. } = model().file.tree.node(spot.node) else {
            panic!("not a decision");
        };
        assert_eq!(spot.moves.len(), actions.len());
        for (k, &(kind, _)) in actions.iter().enumerate() {
            let draw = draw_for(spot.node, bucket, kind);
            if draw < 0.0 {
                continue;
            }
            let (mut fresh, _) = setup();
            assert_eq!(
                fresh.decide(model(), &legal, draw),
                spot.moves[k],
                "{kind:?}"
            );
        }
    }
}

#[test]
fn spot_does_not_move_the_bot() {
    for draw in [0.1, 0.5, 0.9] {
        let (mut plain, legal) = on_the_flop([48, 49]);
        let (mut asked, _) = on_the_flop([48, 49]);
        asked.spot(model(), &legal);
        asked.spot(model(), &legal);
        assert_eq!(
            asked.decide(model(), &legal, draw),
            plain.decide(model(), &legal, draw)
        );
        assert_eq!(asked.history(), plain.history());
        assert_eq!(asked.cursor(), plain.cursor());
    }
}

#[test]
fn approximate_after_a_resync() {
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::Check, 0.3);
    let legal = Legal {
        fold: false,
        check: true,
        call: None,
        raise: Some((40, 380)),
    };
    let spot = bot.spot(model(), &legal).unwrap();
    assert!(spot.approximate);
}

#[test]
fn grid_rows_are_the_strategy() {
    let (bot, legal) = on_the_flop([48, 49]);
    let spot = bot.spot(model(), &legal).unwrap();
    let n = spot.moves.len();
    let grid = bot.strategy_grid(model(), &spot);
    assert_eq!(grid.len(), PAIRS * n);
    let dead = [10, 20, 30];
    for i in 0..PAIRS {
        let c = pair_cards(i);
        let row = &grid[i * n..(i + 1) * n];
        if dead.contains(&c[0]) || dead.contains(&c[1]) {
            assert!(row.iter().all(|&x| x == 0.0), "{c:?}");
            continue;
        }
        let bucket = model().abstraction.bucket(Street::Flop, c, &[10, 20, 30]);
        let bytes = model().file.probabilities(spot.node, bucket);
        let sum: u32 = bytes.iter().map(|&x| u32::from(x)).sum();
        for (k, &x) in row.iter().enumerate() {
            assert!((x - f32::from(bytes[k]) / sum as f32).abs() < 1e-6, "{c:?}");
        }
        assert!((row.iter().sum::<f32>() - 1.0).abs() < 1e-5, "{c:?}");
    }
    let own = pair_index(48, 49);
    assert!((grid[own * n..(own + 1) * n].iter().sum::<f32>() - 1.0).abs() < 1e-5);
}

#[test]
fn no_spot_without_a_node() {
    let bot = started(true, [400, 400], [10, 20], [48, 48]);
    assert!(bot.spot(model(), &facing_blind(20, 400)).is_none());
    assert!(Bot::new().spot(model(), &facing_blind(20, 400)).is_none());
}

#[test]
fn a_facing_resync_spots_the_facing_node() {
    let mut bot = started(false, [400, 400], [10, 20], [0, 5]);
    bot.acted(model(), false, Move::Check, 0.3);
    bot.acted(model(), false, Move::RaiseTo(100), 0.3);
    assert_eq!(bot.cursor(), None);
    let legal = Legal {
        fold: true,
        check: false,
        call: Some(80),
        raise: Some((180, 380)),
    };
    let spot = bot.spot(model(), &legal).unwrap();
    assert!(spot.approximate);
    let node = model().spot(spot.node).unwrap();
    assert!(node.to_call() > 0);
    assert_eq!(node.seat, bot.hand.as_ref().unwrap().hero);
}
