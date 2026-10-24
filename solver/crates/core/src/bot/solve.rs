use super::translate::sample_f32;
use super::{passive, Hand, Legal, Move};
use crate::cards::Card;
use crate::subgame::range::Range;
use crate::subgame::solver::Solver;
use crate::subgame::tree::{build, Root, Sizes, SubAction, SubNode};
use crate::tree::Street;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SolverConfig {
    pub turn_iterations: u32,
    pub river_iterations: u32,
}

impl SolverConfig {
    pub(super) fn is_on(&self) -> bool {
        self.turn_iterations > 0 || self.river_iterations > 0
    }

    fn iterations(&self, street: Street) -> u32 {
        match street {
            Street::Turn => self.turn_iterations,
            _ => self.river_iterations,
        }
    }
}

pub(super) struct Subgame {
    pub(super) root: Option<Root>,
    pub(super) path: Vec<SubAction>,
    pub(super) ranges: [Range; 2],
    pub(super) solve: Option<Solver>,
}

pub(super) struct Solved {
    pub(super) mv: Move,
    pub(super) evs: Vec<f32>,
}

impl Subgame {
    pub(super) fn new() -> Subgame {
        Subgame {
            root: None,
            path: Vec::new(),
            ranges: [Range::uniform(), Range::uniform()],
            solve: None,
        }
    }

    fn carried(&self) -> Option<[Range; 2]> {
        let solve = self.solve.as_ref()?;
        let node = solve.tree().locate(&self.path)?;
        Some(solve.ranges_at(node, None))
    }

    fn hero_node(&self, hero: usize) -> Option<usize> {
        let tree = self.solve.as_ref()?.tree();
        if Some(tree.root) != self.root {
            return None;
        }
        let node = tree.locate(&self.path)?;
        match &tree.nodes[node] {
            SubNode::Decision { seat, .. } if usize::from(*seat) == hero => Some(node),
            _ => None,
        }
    }
}

pub(super) fn street_started(hand: &mut Hand) {
    let street = hand.street;
    if !matches!(street, Street::Turn | Street::River) {
        hand.sub = Subgame::new();
        return;
    }
    let carried = match street {
        Street::River => hand.sub.carried(),
        _ => None,
    };
    let board = &hand.board;
    let ranges = carried
        .unwrap_or_else(|| hand.ranges.clone())
        .map(|r| r.without(board).or_uniform(board));
    let behind = (0..2)
        .map(|s| hand.start[s].saturating_sub(hand.committed[s]))
        .min()
        .unwrap_or(0);
    hand.sub = Subgame {
        root: Some(Root {
            street,
            pot: hand.committed[0] + hand.committed[1],
            behind,
            big_blind: hand.big_blind,
        }),
        path: Vec::new(),
        ranges,
        solve: None,
    };
}

pub(super) fn record(hand: &mut Hand, seat: usize, mv: Move) {
    if hand.sub.root.is_none() {
        return;
    }
    let action = match mv {
        Move::Fold => SubAction::Fold,
        Move::Check => SubAction::Check,
        Move::Call if hand.to_call(seat) > 0 => SubAction::Call,
        Move::Call => SubAction::Check,
        Move::RaiseTo(to) => SubAction::RaiseTo(to),
    };
    hand.sub.path.push(action);
}

pub(super) fn decide(
    hand: &mut Hand,
    config: SolverConfig,
    legal: &Legal,
    draw: f64,
) -> Option<Solved> {
    let root = hand.sub.root?;
    let hole = hand.hole?;
    let iterations = config.iterations(root.street);
    if iterations == 0 {
        return None;
    }
    let node = match hand.sub.hero_node(hand.hero) {
        Some(node) => node,
        None => {
            rebuild(&mut hand.sub, root, &hand.board, iterations);
            hand.sub.hero_node(hand.hero)?
        }
    };
    let solve = hand.sub.solve.as_ref()?;
    let SubNode::Decision { actions, .. } = &solve.tree().nodes[node] else {
        return None;
    };
    let strategy = solve.strategy(node, None, hole);
    let action = actions.get(sample_f32(&strategy, draw))?.0;
    Some(Solved {
        mv: to_move(action, legal),
        evs: solve.action_evs(node, None, hole),
    })
}

fn rebuild(sub: &mut Subgame, root: Root, board: &[Card], iterations: u32) {
    let tree = build(root, &Sizes::default(), &sub.path);
    let mut solve = Solver::new(tree, board, sub.ranges.clone());
    solve.run(iterations);
    sub.solve = Some(solve);
}

fn to_move(action: SubAction, legal: &Legal) -> Move {
    match action {
        SubAction::Fold if legal.fold && !legal.check => Move::Fold,
        SubAction::RaiseTo(to) => match legal.raise {
            Some((min, max)) => Move::RaiseTo(to.clamp(min, max)),
            None => passive(legal),
        },
        _ => passive(legal),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facing(raise: Option<(u32, u32)>) -> Legal {
        Legal {
            fold: true,
            check: false,
            call: Some(40),
            raise,
        }
    }

    #[test]
    fn fold_is_kept_only_when_facing_a_bet() {
        assert_eq!(to_move(SubAction::Fold, &facing(None)), Move::Fold);
        let free = Legal {
            fold: true,
            check: true,
            call: None,
            raise: Some((20, 400)),
        };
        assert_eq!(to_move(SubAction::Fold, &free), Move::Check);
    }

    #[test]
    fn raises_clamp_to_the_legal_range() {
        let legal = facing(Some((80, 300)));
        assert_eq!(to_move(SubAction::RaiseTo(50), &legal), Move::RaiseTo(80));
        assert_eq!(to_move(SubAction::RaiseTo(500), &legal), Move::RaiseTo(300));
        assert_eq!(to_move(SubAction::RaiseTo(120), &legal), Move::RaiseTo(120));
        assert_eq!(to_move(SubAction::RaiseTo(120), &facing(None)), Move::Call);
    }

    #[test]
    fn check_and_call_are_passive() {
        assert_eq!(to_move(SubAction::Check, &facing(None)), Move::Call);
        let free = Legal {
            fold: false,
            check: true,
            call: None,
            raise: None,
        };
        assert_eq!(to_move(SubAction::Call, &free), Move::Check);
    }
}
