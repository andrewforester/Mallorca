use crate::tree::Street;

#[derive(Clone, Debug, PartialEq)]
pub struct StreetSizes {
    pub bets: Vec<f64>,
    pub raises: Vec<f64>,
    pub max_aggressive: u8,
    pub all_in_threshold: f64,
}

impl StreetSizes {
    pub fn standard() -> StreetSizes {
        StreetSizes {
            bets: vec![0.5, 1.0],
            raises: vec![1.0],
            max_aggressive: 3,
            all_in_threshold: 2.0 / 3.0,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Sizes {
    pub turn: StreetSizes,
    pub river: StreetSizes,
    pub river_in_turn: StreetSizes,
}

impl Default for Sizes {
    fn default() -> Sizes {
        Sizes {
            turn: StreetSizes::standard(),
            river: StreetSizes::standard(),
            river_in_turn: StreetSizes {
                bets: vec![1.0],
                raises: vec![],
                max_aggressive: 2,
                all_in_threshold: 2.0 / 3.0,
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Root {
    pub street: Street,
    pub pot: u32,
    pub behind: u32,
    pub big_blind: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SubAction {
    Fold,
    Check,
    Call,
    RaiseTo(u32),
}

#[derive(Clone, Debug, PartialEq)]
pub enum SubNode {
    Decision {
        seat: u8,
        river: bool,
        actions: Vec<(SubAction, usize)>,
    },
    Chance {
        child: usize,
    },
    Fold {
        folder: u8,
        contributed: [u32; 2],
    },
    Showdown {
        river: bool,
        contributed: u32,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct SubTree {
    pub root: Root,
    pub nodes: Vec<SubNode>,
}

#[derive(Clone, Copy)]
struct Round {
    base: u32,
    stack: u32,
    river: bool,
    turn_tree: bool,
    nested: bool,
}

#[derive(Clone, Copy)]
struct State {
    seat: u8,
    bets: [u32; 2],
    increment: u32,
    aggressive: u8,
    cursor: usize,
}

impl State {
    fn opening(cursor: usize) -> State {
        State {
            seat: 1,
            bets: [0, 0],
            increment: 0,
            aggressive: 0,
            cursor,
        }
    }

    fn mine(&self) -> u32 {
        self.bets[self.seat as usize]
    }

    fn theirs(&self) -> u32 {
        self.bets[1 - self.seat as usize]
    }

    fn owed(&self) -> u32 {
        self.theirs().saturating_sub(self.mine())
    }
}

struct Builder<'a> {
    root: Root,
    sizes: &'a Sizes,
    path: &'a [SubAction],
    nodes: Vec<SubNode>,
}

pub fn build(root: Root, sizes: &Sizes, path: &[SubAction]) -> SubTree {
    assert!(
        matches!(root.street, Street::Turn | Street::River),
        "subgame roots are turn or river"
    );
    let mut builder = Builder {
        root,
        sizes,
        path,
        nodes: Vec::new(),
    };
    let round = Round {
        base: root.pot / 2,
        stack: root.behind,
        river: root.street == Street::River,
        turn_tree: root.street == Street::Turn,
        nested: false,
    };
    builder.decision(round, State::opening(0));
    SubTree {
        root,
        nodes: builder.nodes,
    }
}

fn room(big_blind: u32, stack: u32, state: &State) -> Option<(u32, u32)> {
    if stack <= state.theirs() {
        return None;
    }
    let step = state.increment.max(big_blind).max(1);
    Some(((state.theirs() + step).min(stack), stack))
}

fn normalise(big_blind: u32, stack: u32, state: &State, action: SubAction) -> SubAction {
    let owed = state.owed() > 0;
    match action {
        SubAction::Fold if !owed => SubAction::Check,
        SubAction::Check if owed => SubAction::Call,
        SubAction::Call if !owed => SubAction::Check,
        SubAction::RaiseTo(x) => match room(big_blind, stack, state) {
            Some((min, all_in)) => SubAction::RaiseTo(x.clamp(min, all_in)),
            None if owed => SubAction::Call,
            None => SubAction::Check,
        },
        other => other,
    }
}

fn advance(state: State, action: SubAction) -> State {
    let next = State {
        seat: 1 - state.seat,
        ..state
    };
    match action {
        SubAction::RaiseTo(x) => {
            let mut bets = state.bets;
            bets[state.seat as usize] = x;
            State {
                bets,
                increment: state.increment.max(x - state.theirs()),
                aggressive: state.aggressive + 1,
                ..next
            }
        }
        _ => next,
    }
}

impl SubTree {
    pub fn locate(&self, path: &[SubAction]) -> Option<usize> {
        let stack = self.root.behind;
        let mut state = State::opening(0);
        let mut at = 0;
        for action in path {
            let SubNode::Decision { actions, .. } = self.nodes.get(at)? else {
                return None;
            };
            let step = normalise(self.root.big_blind, stack, &state, *action);
            at = actions.iter().find(|(a, _)| *a == step)?.1;
            state = advance(state, step);
        }
        Some(at)
    }

    pub fn node_at(&self, path: &[SubAction]) -> Option<usize> {
        let mut at = 0;
        for action in path {
            match self.nodes.get(at)? {
                SubNode::Decision { actions, .. } => {
                    at = actions.iter().find(|(a, _)| a == action)?.1;
                }
                _ => return None,
            }
        }
        Some(at)
    }

    pub fn parent_edges(&self) -> Vec<Option<(usize, usize)>> {
        let mut edges = vec![None; self.nodes.len()];
        for (index, node) in self.nodes.iter().enumerate() {
            match node {
                SubNode::Decision { actions, .. } => {
                    for (slot, (_, child)) in actions.iter().enumerate() {
                        edges[*child] = Some((index, slot));
                    }
                }
                SubNode::Chance { child } => edges[*child] = Some((index, 0)),
                _ => {}
            }
        }
        edges
    }
}

impl Builder<'_> {
    fn street_sizes(&self, round: &Round) -> &StreetSizes {
        if round.nested {
            &self.sizes.river_in_turn
        } else if round.river {
            &self.sizes.river
        } else {
            &self.sizes.turn
        }
    }

    fn bounds(&self, round: &Round, state: &State) -> Option<(u32, u32)> {
        if state.aggressive >= self.street_sizes(round).max_aggressive {
            return None;
        }
        room(self.root.big_blind, round.stack, state)
    }

    fn raise_targets(&self, round: &Round, state: &State) -> Vec<u32> {
        let Some((min, all_in)) = self.bounds(round, state) else {
            return Vec::new();
        };
        let sizes = self.street_sizes(round);
        let fractions = if state.owed() > 0 {
            &sizes.raises
        } else {
            &sizes.bets
        };
        let pot = f64::from(2 * round.base + state.bets[0] + state.bets[1] + state.owed());
        let limit = sizes.all_in_threshold * f64::from(round.stack);
        let mut targets = vec![all_in];
        for fraction in fractions {
            let raw = f64::from(state.theirs()) + fraction * pot;
            let target = if raw > limit || raw >= f64::from(all_in) {
                all_in
            } else {
                (raw.round() as u32).max(min)
            };
            targets.push(target);
        }
        targets
    }

    fn path_action(&self, round: &Round, state: &State) -> Option<SubAction> {
        let action = *self.path.get(state.cursor)?;
        Some(normalise(self.root.big_blind, round.stack, state, action))
    }

    fn legal(&self, round: &Round, state: &State) -> Vec<SubAction> {
        let mut actions = Vec::new();
        if state.owed() > 0 {
            actions.push(SubAction::Fold);
            actions.push(SubAction::Call);
        } else {
            actions.push(SubAction::Check);
        }
        let mut targets = self.raise_targets(round, state);
        if let Some(SubAction::RaiseTo(x)) = self.path_action(round, state) {
            targets.push(x);
        }
        targets.sort_unstable();
        targets.dedup();
        actions.extend(targets.into_iter().map(SubAction::RaiseTo));
        actions
    }

    fn decision(&mut self, round: Round, state: State) -> usize {
        let index = self.nodes.len();
        self.nodes.push(SubNode::Chance { child: 0 });
        let followed = self.path_action(&round, &state);
        let mut actions = Vec::new();
        for action in self.legal(&round, &state) {
            let cursor = if Some(action) == followed {
                state.cursor + 1
            } else {
                self.path.len()
            };
            let child = self.apply(round, State { cursor, ..state }, action);
            actions.push((action, child));
        }
        self.nodes[index] = SubNode::Decision {
            seat: state.seat,
            river: round.river,
            actions,
        };
        index
    }

    fn apply(&mut self, round: Round, state: State, action: SubAction) -> usize {
        let next = advance(state, action);
        match action {
            SubAction::Fold => self.push(SubNode::Fold {
                folder: state.seat,
                contributed: [round.base + state.bets[0], round.base + state.bets[1]],
            }),
            SubAction::Call => {
                let bets = [state.theirs(), state.theirs()];
                self.finish(round, State { bets, ..state })
            }
            SubAction::Check if state.seat == 0 => self.finish(round, state),
            _ => self.decision(round, next),
        }
    }

    fn push(&mut self, node: SubNode) -> usize {
        self.nodes.push(node);
        self.nodes.len() - 1
    }

    fn finish(&mut self, round: Round, state: State) -> usize {
        let bet = state.bets[0];
        let all_in = bet >= round.stack;
        if round.river || (round.turn_tree && all_in) {
            return self.push(SubNode::Showdown {
                river: round.river,
                contributed: round.base + bet,
            });
        }
        let index = self.push(SubNode::Chance { child: 0 });
        let next = Round {
            base: round.base + bet,
            stack: round.stack - bet,
            river: true,
            turn_tree: false,
            nested: true,
        };
        let child = self.decision(next, State::opening(self.path.len()));
        self.nodes[index] = SubNode::Chance { child };
        index
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(street: Street, pot: u32, behind: u32) -> Root {
        Root {
            street,
            pot,
            behind,
            big_blind: 20,
        }
    }

    fn tree(street: Street, pot: u32, behind: u32, path: &[SubAction]) -> SubTree {
        build(root(street, pot, behind), &Sizes::default(), path)
    }

    fn actions(tree: &SubTree, at: usize) -> Vec<SubAction> {
        match &tree.nodes[at] {
            SubNode::Decision { actions, .. } => actions.iter().map(|(a, _)| *a).collect(),
            other => panic!("not a decision: {other:?}"),
        }
    }

    fn child(tree: &SubTree, at: usize, action: SubAction) -> usize {
        match &tree.nodes[at] {
            SubNode::Decision { actions, .. } => {
                actions.iter().find(|(a, _)| *a == action).unwrap().1
            }
            other => panic!("not a decision: {other:?}"),
        }
    }

    use SubAction::{Call, Check, Fold, RaiseTo};

    #[test]
    fn river_root_offers_check_and_bets() {
        let t = tree(Street::River, 400, 1800, &[]);
        assert!(matches!(
            t.nodes[0],
            SubNode::Decision {
                seat: 1,
                river: true,
                ..
            }
        ));
        assert_eq!(
            actions(&t, 0),
            vec![Check, RaiseTo(200), RaiseTo(400), RaiseTo(1800)]
        );
    }

    #[test]
    fn facing_a_bet_offers_fold_call_raise() {
        let t = tree(Street::River, 400, 1800, &[]);
        let c = child(&t, 0, RaiseTo(200));
        assert!(matches!(t.nodes[c], SubNode::Decision { seat: 0, .. }));
        assert_eq!(
            actions(&t, c),
            vec![Fold, Call, RaiseTo(1000), RaiseTo(1800)]
        );
    }

    #[test]
    fn big_sizes_become_all_in() {
        let t = tree(Street::River, 400, 300, &[]);
        assert_eq!(actions(&t, 0), vec![Check, RaiseTo(200), RaiseTo(300)]);
    }

    #[test]
    fn short_stack_only_jams() {
        let t = tree(Street::River, 400, 15, &[]);
        assert_eq!(actions(&t, 0), vec![Check, RaiseTo(15)]);
        let c = child(&t, 0, RaiseTo(15));
        assert_eq!(actions(&t, c), vec![Fold, Call]);
    }

    #[test]
    fn turn_round_ends_in_a_chance_node() {
        let t = tree(Street::Turn, 400, 1800, &[]);
        let c = child(&t, 0, Check);
        let end = child(&t, c, Check);
        let SubNode::Chance { child: river } = t.nodes[end] else {
            panic!("expected chance");
        };
        assert!(matches!(
            t.nodes[river],
            SubNode::Decision {
                seat: 1,
                river: true,
                ..
            }
        ));
        let jam = child(&t, 0, RaiseTo(1800));
        let called = child(&t, jam, Call);
        assert_eq!(
            t.nodes[called],
            SubNode::Showdown {
                river: false,
                contributed: 2000
            }
        );
    }

    #[test]
    fn turn_call_of_a_bet_continues_on_the_river_with_smaller_stacks() {
        let t = tree(Street::Turn, 400, 1800, &[]);
        let bet = child(&t, 0, RaiseTo(200));
        let end = child(&t, bet, Call);
        let SubNode::Chance { child: river } = t.nodes[end] else {
            panic!("expected chance");
        };
        assert_eq!(actions(&t, river), vec![Check, RaiseTo(800), RaiseTo(1600)]);
        let bet = child(&t, river, RaiseTo(800));
        assert_eq!(actions(&t, bet), vec![Fold, Call, RaiseTo(1600)]);
        let jam = child(&t, bet, RaiseTo(1600));
        assert_eq!(actions(&t, jam), vec![Fold, Call]);
    }

    #[test]
    fn river_in_turn_defaults_to_one_pot_bet() {
        let sizes = Sizes::default();
        assert_eq!(sizes.river_in_turn.bets, vec![1.0]);
        assert!(sizes.river_in_turn.raises.is_empty());
        assert_eq!(sizes.river_in_turn.max_aggressive, 2);
        assert_eq!(sizes.river_in_turn.all_in_threshold, 2.0 / 3.0);
    }

    #[test]
    fn river_in_turn_sizes_shape_only_the_river_of_a_turn_tree() {
        let sizes = Sizes {
            river_in_turn: StreetSizes {
                bets: vec![0.5],
                raises: vec![],
                max_aggressive: 1,
                all_in_threshold: 2.0 / 3.0,
            },
            ..Sizes::default()
        };
        let r = root(Street::Turn, 400, 1800);
        let t = build(r, &sizes, &[]);
        assert_eq!(
            actions(&t, 0),
            vec![Check, RaiseTo(200), RaiseTo(400), RaiseTo(1800)]
        );
        let c = child(&t, 0, Check);
        let end = child(&t, c, Check);
        let SubNode::Chance { child: river } = t.nodes[end] else {
            panic!("expected chance");
        };
        assert_eq!(actions(&t, river), vec![Check, RaiseTo(200), RaiseTo(1800)]);
        let r = root(Street::River, 400, 1800);
        let t = build(r, &sizes, &[]);
        assert_eq!(
            actions(&t, 0),
            vec![Check, RaiseTo(200), RaiseTo(400), RaiseTo(1800)]
        );
    }

    #[test]
    fn fold_and_showdown_contributions() {
        let t = tree(Street::River, 400, 1800, &[]);
        let bet = child(&t, 0, RaiseTo(200));
        let called = child(&t, bet, Call);
        assert_eq!(
            t.nodes[called],
            SubNode::Showdown {
                river: true,
                contributed: 400
            }
        );
        let folded = child(&t, bet, Fold);
        assert_eq!(
            t.nodes[folded],
            SubNode::Fold {
                folder: 0,
                contributed: [200, 400]
            }
        );
    }

    #[test]
    fn path_inserts_an_off_tree_size() {
        let t = tree(Street::River, 400, 1800, &[RaiseTo(60)]);
        assert_eq!(
            actions(&t, 0),
            vec![
                Check,
                RaiseTo(60),
                RaiseTo(200),
                RaiseTo(400),
                RaiseTo(1800)
            ]
        );
        let at = t.node_at(&[RaiseTo(60)]).unwrap();
        assert!(matches!(t.nodes[at], SubNode::Decision { seat: 0, .. }));
        assert_eq!(t.node_at(&[RaiseTo(61)]), None);
    }

    #[test]
    fn path_clamps_an_illegal_size() {
        let t = tree(Street::River, 400, 1800, &[RaiseTo(5000)]);
        assert_eq!(
            actions(&t, 0),
            vec![Check, RaiseTo(200), RaiseTo(400), RaiseTo(1800)]
        );
        let t = tree(Street::River, 400, 1800, &[RaiseTo(5)]);
        assert_eq!(actions(&t, 0)[1], RaiseTo(20));
    }

    #[test]
    fn min_raise_holds() {
        let t = tree(Street::River, 400, 1800, &[RaiseTo(20)]);
        let at = t.node_at(&[RaiseTo(20)]).unwrap();
        for action in actions(&t, at) {
            if let RaiseTo(x) = action {
                assert!(x >= 40, "{x}");
            }
        }
    }

    #[test]
    fn max_aggressive_caps_the_fourth_raise() {
        let t = tree(Street::River, 400, 100_000, &[]);
        let bet = child(&t, 0, RaiseTo(200));
        let raise = child(&t, bet, RaiseTo(1000));
        assert!(actions(&t, raise).contains(&RaiseTo(3400)));
        let third = child(&t, raise, RaiseTo(3400));
        assert_eq!(actions(&t, third), vec![Fold, Call]);
    }

    #[test]
    fn node_at_reaches_chance_and_stops_at_terminals() {
        let t = tree(Street::Turn, 400, 1800, &[]);
        let at = t.node_at(&[Check, Check]).unwrap();
        assert!(matches!(t.nodes[at], SubNode::Chance { .. }));
        assert_eq!(t.node_at(&[Check, Check, Check]), None);
        assert_eq!(t.node_at(&[]), Some(0));
    }

    #[test]
    fn parent_edges_invert_the_children() {
        let t = tree(Street::Turn, 400, 1800, &[]);
        let edges = t.parent_edges();
        assert_eq!(edges[0], None);
        for (parent, slot) in edges.iter().flatten().copied() {
            match &t.nodes[parent] {
                SubNode::Decision { actions, .. } => assert!(slot < actions.len()),
                SubNode::Chance { .. } => assert_eq!(slot, 0),
                _ => panic!("terminal parent"),
            }
        }
        assert_eq!(edges.iter().filter(|e| e.is_none()).count(), 1);
    }

    #[test]
    fn a_fourth_raise_on_the_path_is_in_the_tree() {
        let path = [RaiseTo(200), RaiseTo(1000), RaiseTo(3400), RaiseTo(9000)];
        let t = tree(Street::River, 400, 100_000, &path);
        let at = t.locate(&path).unwrap();
        assert!(matches!(t.nodes[at], SubNode::Decision { seat: 1, .. }));
        assert_eq!(t.node_at(&path), Some(at));
    }

    #[test]
    fn an_over_stack_raise_locates_to_all_in() {
        let t = tree(Street::River, 400, 1800, &[]);
        let at = t.locate(&[RaiseTo(2300)]).unwrap();
        assert_eq!(Some(at), t.node_at(&[RaiseTo(1800)]));
        let t = tree(Street::River, 400, 1800, &[RaiseTo(2300)]);
        assert_eq!(t.locate(&[RaiseTo(2300)]), t.node_at(&[RaiseTo(1800)]));
    }

    #[test]
    fn locate_swaps_check_and_call() {
        let t = tree(Street::River, 400, 1800, &[]);
        let call = t.locate(&[RaiseTo(200), Call]);
        assert!(call.is_some());
        assert_eq!(t.locate(&[RaiseTo(200), Check]), call);
    }

    #[test]
    fn build_clamps_illegal_non_raise_path_actions() {
        let t = tree(Street::River, 400, 1800, &[RaiseTo(200), Check]);
        assert!(t.node_at(&[RaiseTo(200), Call]).is_some());
        let t = tree(Street::River, 400, 1800, &[Call]);
        assert!(t.node_at(&[Check]).is_some());
    }

    #[test]
    fn a_zero_big_blind_still_builds() {
        let r = Root {
            street: Street::River,
            pot: 400,
            behind: 100,
            big_blind: 0,
        };
        let t = build(r, &Sizes::default(), &[]);
        assert!(t.nodes.len() > 1);
    }

    #[test]
    #[should_panic]
    fn a_flop_root_is_rejected() {
        tree(Street::Flop, 400, 1800, &[]);
    }
}
