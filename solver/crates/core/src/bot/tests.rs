use super::*;
use crate::measure::fixtures::trained;
use crate::rng::Rng;
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
