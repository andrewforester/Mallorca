mod translate;

use crate::abstraction::Abstraction;
use crate::cards::Card;
use crate::strategy::{StrategyError, StrategyFile};
use crate::tree::{ActionKind, Node, NodeId, Street};
use translate::{fraction, nearest, pseudo_harmonic, sample, scaled_raise};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Move {
    Fold,
    Check,
    Call,
    RaiseTo(u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Legal {
    pub fold: bool,
    pub check: bool,
    pub call: Option<u32>,
    pub raise: Option<(u32, u32)>,
}

pub struct Model {
    pub file: StrategyFile,
    pub abstraction: Abstraction,
    spots: Vec<Vec<NodeId>>,
}

struct Spot<'a> {
    seat: usize,
    street: Street,
    committed: [u32; 2],
    street_bets: [u32; 2],
    actions: &'a [(ActionKind, NodeId)],
}

impl Spot<'_> {
    fn to_call(&self) -> u32 {
        self.street_bets[1 - self.seat].saturating_sub(self.street_bets[self.seat])
    }

    fn pot_after_call(&self) -> u32 {
        self.committed[0]
            .saturating_add(self.committed[1])
            .saturating_add(self.to_call())
    }

    fn child(&self, kind: ActionKind) -> Option<NodeId> {
        self.actions.iter().find(|a| a.0 == kind).map(|a| a.1)
    }
}

fn spot_key(street: Street, seat: usize, facing: bool) -> usize {
    street.as_index() * 4 + seat * 2 + usize::from(facing)
}

impl Model {
    pub fn new(file: StrategyFile) -> Result<Model, StrategyError> {
        let abstraction = Abstraction::from_strategy(&file)?;
        let mut model = Model {
            file,
            abstraction,
            spots: vec![Vec::new(); 16],
        };
        for id in 0..model.file.tree.nodes().len() as NodeId {
            if let Some(spot) = model.spot(id) {
                let key = spot_key(spot.street, spot.seat, spot.to_call() > 0);
                model.spots[key].push(id);
            }
        }
        Ok(model)
    }

    fn spot(&self, id: NodeId) -> Option<Spot<'_>> {
        match self.file.tree.node(id) {
            Node::Decision {
                seat,
                street,
                committed,
                street_bets,
                actions,
            } => Some(Spot {
                seat: usize::from(*seat),
                street: *street,
                committed: *committed,
                street_bets: *street_bets,
                actions,
            }),
            _ => None,
        }
    }

    fn raise_to(&self, spot: &Spot<'_>, kind: ActionKind) -> Option<u32> {
        match kind {
            ActionKind::RaiseTo(to) => Some(to),
            ActionKind::AllIn => Some(
                spot.street_bets[spot.seat]
                    .saturating_add(self.file.stack.saturating_sub(spot.committed[spot.seat])),
            ),
            _ => None,
        }
    }
}

pub fn passive(legal: &Legal) -> Move {
    if legal.check {
        Move::Check
    } else if legal.call.is_some() {
        Move::Call
    } else if legal.fold {
        Move::Fold
    } else {
        legal
            .raise
            .filter(|r| r.0 <= r.1)
            .map_or(Move::Fold, |r| Move::RaiseTo(r.0))
    }
}

struct Hand {
    hero: usize,
    start: [u32; 2],
    bets: [u32; 2],
    committed: [u32; 2],
    street: Street,
    hole: Option<[Card; 2]>,
    board: Vec<Card>,
    scale: f64,
    node: Option<NodeId>,
    pending: Option<NodeId>,
    shifted: bool,
}

impl Hand {
    fn to_call(&self, seat: usize) -> u32 {
        self.bets[1 - seat].saturating_sub(self.bets[seat])
    }

    fn pot_after_call(&self, seat: usize) -> u32 {
        self.committed[0]
            .saturating_add(self.committed[1])
            .saturating_add(self.to_call(seat))
    }

    fn pot(&self) -> f64 {
        f64::from(self.committed[0]) + f64::from(self.committed[1])
    }

    fn apply(&mut self, seat: usize, mv: Move) {
        let behind = self.start[seat].saturating_sub(self.committed[seat]);
        let add = match mv {
            Move::Fold | Move::Check => 0,
            Move::Call => self.to_call(seat).min(behind),
            Move::RaiseTo(to) => to.saturating_sub(self.bets[seat]).min(behind),
        };
        self.bets[seat] += add;
        self.committed[seat] += add;
    }
}

#[derive(Default)]
pub struct Bot {
    hand: Option<Hand>,
}

impl Bot {
    pub fn new() -> Bot {
        Bot { hand: None }
    }

    pub fn cursor(&self) -> Option<NodeId> {
        self.hand.as_ref().and_then(|h| h.node)
    }

    pub fn hand_started(
        &mut self,
        model: &Model,
        hero_button: bool,
        stacks: [u32; 2],
        blinds: [u32; 2],
    ) {
        let hero = usize::from(!hero_button);
        let mut start = stacks;
        if hero == 1 {
            start.swap(0, 1);
        }
        let bets = [blinds[0].min(start[0]), blinds[1].min(start[1])];
        self.hand = Some(Hand {
            hero,
            start,
            bets,
            committed: bets,
            street: Street::Preflop,
            hole: None,
            board: Vec::new(),
            scale: f64::from(model.file.big_blind) / f64::from(blinds[1].max(1)),
            node: Some(model.file.tree.root()),
            pending: None,
            shifted: false,
        });
    }

    pub fn hole_cards(&mut self, hole: [Card; 2]) {
        if let Some(hand) = self.hand.as_mut() {
            hand.hole = Some(hole);
        }
    }

    pub fn street(&mut self, model: &Model, board: &[Card]) {
        let Some(hand) = self.hand.as_mut() else {
            return;
        };
        hand.street = match board.len() {
            3 => Street::Flop,
            4 => Street::Turn,
            _ => Street::River,
        };
        hand.board = board.to_vec();
        hand.bets = [0, 0];
        hand.pending = None;
        hand.shifted = false;
        let on_street = hand
            .node
            .and_then(|id| model.spot(id))
            .is_some_and(|s| s.street == hand.street);
        if !on_street {
            hand.node = None;
        }
    }

    pub fn acted(&mut self, model: &Model, hero: bool, mv: Move, draw: f64) {
        let Some(hand) = self.hand.as_mut() else {
            return;
        };
        let seat = if hero { hand.hero } else { 1 - hand.hero };
        let (next, shifted) = match hand.pending.take() {
            Some(child) if hero => (Some(child), false),
            _ => follow(model, hand, seat, mv, draw),
        };
        hand.apply(seat, mv);
        hand.node = next;
        hand.shifted = shifted;
    }

    pub fn decide(&mut self, model: &Model, legal: &Legal, mut draw: f64) -> Move {
        let Some(hand) = self.hand.as_mut() else {
            return passive(legal);
        };
        let Some(hole) = hand.hole.filter(|&h| distinct_cards(h, &hand.board)) else {
            return passive(legal);
        };
        let facing = legal.call.is_some();
        let here = hand
            .node
            .and_then(|id| model.spot(id))
            .filter(|s| s.seat == hand.hero && s.street == hand.street);
        if hand.shifted && facing && here.is_none() && hand.node.is_some() {
            hand.pending = hand.node;
            return passive(legal);
        }
        let valid = here.is_some_and(|s| {
            let free = hand.shifted && facing && s.to_call() == 0;
            free || (s.to_call() > 0) == facing
        });
        if !valid {
            hand.node = resync(model, hand, facing);
            if facing {
                draw = resync_to_check(model, hand, draw);
            }
        }
        let Some(id) = hand.node else {
            return passive(legal);
        };
        let Some(spot) = model.spot(id) else {
            return passive(legal);
        };
        let bucket = model.abstraction.bucket(hand.street, hole, &hand.board);
        let Some(probabilities) = model.file.try_probabilities(id, bucket) else {
            return passive(legal);
        };
        let chosen = spot.actions[sample(probabilities, draw)];
        hand.pending = Some(chosen.1);
        to_real(&spot, hand, chosen.0, legal)
    }
}

fn follow(model: &Model, hand: &Hand, seat: usize, mv: Move, draw: f64) -> (Option<NodeId>, bool) {
    let Some(spot) = hand.node.and_then(|id| model.spot(id)) else {
        return (None, false);
    };
    if spot.seat != seat || spot.street != hand.street {
        return (None, false);
    }
    let passive = spot
        .child(ActionKind::Call)
        .or_else(|| spot.child(ActionKind::Check));
    match mv {
        Move::Fold => (spot.child(ActionKind::Fold), false),
        Move::Check => (spot.child(ActionKind::Check), false),
        Move::Call => (passive, false),
        Move::RaiseTo(to) => {
            let mut sizes: Vec<(f64, NodeId)> = spot
                .actions
                .iter()
                .filter_map(|&(kind, child)| {
                    let t = model.raise_to(&spot, kind)?;
                    let f = fraction(t, spot.street_bets[1 - seat], spot.pot_after_call());
                    Some((f, child))
                })
                .collect();
            if sizes.is_empty() {
                return (None, false);
            }
            sizes.sort_by(|a, b| a.0.total_cmp(&b.0));
            if let Some(child) = passive {
                sizes.insert(0, (0.0, child));
            }
            let x = fraction(to, hand.bets[1 - seat], hand.pot_after_call(seat));
            let fractions: Vec<f64> = sizes.iter().map(|s| s.0).collect();
            let i = nearest(&fractions, x, draw);
            (Some(sizes[i].1), i == 0 && passive.is_some())
        }
    }
}

fn spot_pot(spot: &Spot<'_>) -> f64 {
    f64::from(spot.committed[0]) + f64::from(spot.committed[1])
}

fn resync(model: &Model, hand: &Hand, facing: bool) -> Option<NodeId> {
    let pot = hand.scale * hand.pot();
    let price = hand.scale * f64::from(hand.to_call(hand.hero)) / pot;
    let distance = |spot: &Spot<'_>| {
        let p = spot_pot(spot);
        let q = f64::from(spot.to_call()) / p;
        (p / pot).ln().abs() + ((1.0 + q) / (1.0 + price)).ln().abs()
    };
    model.spots[spot_key(hand.street, hand.hero, facing)]
        .iter()
        .filter_map(|&id| model.spot(id).map(|spot| (id, distance(&spot))))
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(id, _)| id)
}

fn resync_to_check(model: &Model, hand: &mut Hand, draw: f64) -> f64 {
    let Some(spot) = hand.node.and_then(|id| model.spot(id)) else {
        return draw;
    };
    let tree_pot = spot_pot(&spot) - f64::from(spot.to_call());
    let to_call = hand.to_call(hand.hero);
    let pot = hand.pot() - f64::from(to_call);
    let p = pseudo_harmonic(
        0.0,
        f64::from(spot.to_call()) / tree_pot,
        f64::from(to_call) / pot,
    );
    if p <= 0.0 {
        return draw;
    }
    if draw >= p {
        return (draw - p) / (1.0 - p);
    }
    if let Some(id) = resync(model, hand, false) {
        hand.node = Some(id);
        hand.shifted = true;
    }
    draw / p
}

fn to_real(spot: &Spot<'_>, hand: &Hand, kind: ActionKind, legal: &Legal) -> Move {
    let Some(range) = legal.raise.filter(|r| r.0 <= r.1) else {
        return match kind {
            ActionKind::Fold if legal.fold => Move::Fold,
            _ => passive(legal),
        };
    };
    match kind {
        ActionKind::Fold if legal.fold => Move::Fold,
        ActionKind::Fold | ActionKind::Check | ActionKind::Call => passive(legal),
        ActionKind::AllIn => Move::RaiseTo(range.1),
        ActionKind::RaiseTo(t) => {
            let f = fraction(t, spot.street_bets[1 - spot.seat], spot.pot_after_call());
            let me = hand.hero;
            Move::RaiseTo(scaled_raise(
                f,
                hand.bets[1 - me],
                hand.pot_after_call(me),
                range,
            ))
        }
    }
}

fn distinct_cards(hole: [Card; 2], board: &[Card]) -> bool {
    let mut seen = 0u64;
    hole.iter().chain(board).all(|&c| {
        let bit = 1u64 << (c % 64);
        let fresh = c < 52 && seen & bit == 0;
        seen |= bit;
        fresh
    })
}

#[cfg(test)]
mod tests;
