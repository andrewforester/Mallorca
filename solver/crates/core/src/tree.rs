use crate::preset::Preset;
use std::fmt;

pub type NodeId = u32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Street {
    Preflop,
    Flop,
    Turn,
    River,
}

impl Street {
    pub fn as_index(self) -> usize {
        match self {
            Street::Preflop => 0,
            Street::Flop => 1,
            Street::Turn => 2,
            Street::River => 3,
        }
    }

    pub fn from_index(i: u8) -> Option<Street> {
        match i {
            0 => Some(Street::Preflop),
            1 => Some(Street::Flop),
            2 => Some(Street::Turn),
            3 => Some(Street::River),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActionKind {
    Fold,
    Check,
    Call,
    RaiseTo(u32),
    AllIn,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Node {
    Decision {
        seat: u8,
        street: Street,
        committed: [u32; 2],
        street_bets: [u32; 2],
        actions: Vec<(ActionKind, NodeId)>,
    },
    Fold {
        folder: u8,
        committed: [u32; 2],
    },
    Showdown {
        committed: [u32; 2],
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TreeError {
    Truncated,
    TrailingBytes,
    Empty,
    BadTag(u8),
    BadValue(&'static str),
    BadChild { node: NodeId, child: NodeId },
}

impl fmt::Display for TreeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TreeError::Truncated => write!(f, "serialized tree is truncated"),
            TreeError::TrailingBytes => write!(f, "serialized tree has trailing bytes"),
            TreeError::Empty => write!(f, "serialized tree has no nodes"),
            TreeError::BadTag(t) => write!(f, "unknown tag {t} in serialized tree"),
            TreeError::BadValue(what) => write!(f, "invalid {what} in serialized tree"),
            TreeError::BadChild { node, child } => {
                write!(f, "node {node} has invalid child {child}")
            }
        }
    }
}

impl std::error::Error for TreeError {}

#[derive(Debug, Clone, PartialEq)]
pub struct Tree {
    nodes: Vec<Node>,
    decision_offsets: Vec<u64>,
    buckets: [u16; 4],
}

impl Tree {
    pub fn build(preset: &Preset) -> Tree {
        let mut builder = Builder {
            preset,
            nodes: Vec::new(),
        };
        builder.decision(State {
            street: Street::Preflop,
            committed: [preset.small_blind, preset.big_blind],
            street_bets: [preset.small_blind, preset.big_blind],
            to_act: 0,
            acted: [false, false],
            aggressive: 0,
            last_inc: preset.big_blind,
        });
        Tree::from_nodes(builder.nodes, preset.tree_buckets())
    }

    fn from_nodes(nodes: Vec<Node>, buckets: [u16; 4]) -> Tree {
        let mut decision_offsets = Vec::with_capacity(nodes.len());
        let mut next = 0u64;
        for n in &nodes {
            decision_offsets.push(next);
            if let Node::Decision {
                street, actions, ..
            } = n
            {
                next += u64::from(buckets[street.as_index()]) * actions.len() as u64;
            }
        }
        decision_offsets.push(next);
        Tree {
            nodes,
            decision_offsets,
            buckets,
        }
    }

    pub fn root(&self) -> NodeId {
        0
    }

    pub fn node(&self, id: NodeId) -> &Node {
        &self.nodes[id as usize]
    }

    pub fn nodes(&self) -> &[Node] {
        &self.nodes
    }

    pub fn buckets(&self) -> [u16; 4] {
        self.buckets
    }

    pub fn infoset_count(&self) -> u64 {
        self.nodes
            .iter()
            .map(|n| match n {
                Node::Decision { street, .. } => u64::from(self.buckets[street.as_index()]),
                _ => 0,
            })
            .sum()
    }

    pub fn action_slot_count(&self) -> u64 {
        *self.decision_offsets.last().expect("offsets end marker")
    }

    pub fn offset(&self, node: NodeId, bucket: u16) -> u64 {
        match self.node(node) {
            Node::Decision {
                street, actions, ..
            } => {
                assert!(
                    bucket < self.buckets[street.as_index()],
                    "bucket {bucket} out of range for {street:?}"
                );
                self.decision_offsets[node as usize] + u64::from(bucket) * actions.len() as u64
            }
            other => panic!("node {node} is not a decision: {other:?}"),
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        let mut out = Vec::new();
        for b in self.buckets {
            out.extend_from_slice(&b.to_le_bytes());
        }
        out.extend_from_slice(&(self.nodes.len() as u32).to_le_bytes());
        let put_pair = |out: &mut Vec<u8>, v: &[u32; 2]| {
            out.extend_from_slice(&v[0].to_le_bytes());
            out.extend_from_slice(&v[1].to_le_bytes());
        };
        for n in &self.nodes {
            match n {
                Node::Decision {
                    seat,
                    street,
                    committed,
                    street_bets,
                    actions,
                } => {
                    out.push(0);
                    out.push(*seat);
                    out.push(street.as_index() as u8);
                    put_pair(&mut out, committed);
                    put_pair(&mut out, street_bets);
                    out.push(actions.len() as u8);
                    for &(kind, child) in actions {
                        match kind {
                            ActionKind::Fold => out.push(0),
                            ActionKind::Check => out.push(1),
                            ActionKind::Call => out.push(2),
                            ActionKind::RaiseTo(x) => {
                                out.push(3);
                                out.extend_from_slice(&x.to_le_bytes());
                            }
                            ActionKind::AllIn => out.push(4),
                        }
                        out.extend_from_slice(&child.to_le_bytes());
                    }
                }
                Node::Fold { folder, committed } => {
                    out.push(1);
                    out.push(*folder);
                    put_pair(&mut out, committed);
                }
                Node::Showdown { committed } => {
                    out.push(2);
                    put_pair(&mut out, committed);
                }
            }
        }
        out
    }

    pub fn deserialize(bytes: &[u8]) -> Result<Tree, TreeError> {
        let mut r = Reader { bytes, pos: 0 };
        let mut buckets = [0u16; 4];
        for b in &mut buckets {
            *b = r.u16()?;
        }
        if buckets.contains(&0) {
            return Err(TreeError::BadValue("bucket count"));
        }
        let count = r.u32()?;
        if count == 0 {
            return Err(TreeError::Empty);
        }
        let mut nodes = Vec::new();
        for id in 0..count {
            let node = match r.u8()? {
                0 => {
                    let seat = r.seat()?;
                    let street =
                        Street::from_index(r.u8()?).ok_or(TreeError::BadValue("street"))?;
                    let committed = r.pair()?;
                    let street_bets = r.pair()?;
                    let n = r.u8()?;
                    if n == 0 {
                        return Err(TreeError::BadValue("action count"));
                    }
                    let mut actions = Vec::with_capacity(usize::from(n));
                    for _ in 0..n {
                        let kind = match r.u8()? {
                            0 => ActionKind::Fold,
                            1 => ActionKind::Check,
                            2 => ActionKind::Call,
                            3 => ActionKind::RaiseTo(r.u32()?),
                            4 => ActionKind::AllIn,
                            t => return Err(TreeError::BadTag(t)),
                        };
                        let child = r.u32()?;
                        if child <= id || child >= count {
                            return Err(TreeError::BadChild { node: id, child });
                        }
                        actions.push((kind, child));
                    }
                    Node::Decision {
                        seat,
                        street,
                        committed,
                        street_bets,
                        actions,
                    }
                }
                1 => Node::Fold {
                    folder: r.seat()?,
                    committed: r.pair()?,
                },
                2 => Node::Showdown {
                    committed: r.pair()?,
                },
                t => return Err(TreeError::BadTag(t)),
            };
            nodes.push(node);
        }
        if r.pos != bytes.len() {
            return Err(TreeError::TrailingBytes);
        }
        Ok(Tree::from_nodes(nodes, buckets))
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Reader<'_> {
    fn take<const N: usize>(&mut self) -> Result<[u8; N], TreeError> {
        let end = self.pos.checked_add(N).ok_or(TreeError::Truncated)?;
        let slice = self.bytes.get(self.pos..end).ok_or(TreeError::Truncated)?;
        self.pos = end;
        Ok(slice.try_into().expect("slice has length N"))
    }

    fn u8(&mut self) -> Result<u8, TreeError> {
        Ok(self.take::<1>()?[0])
    }

    fn u16(&mut self) -> Result<u16, TreeError> {
        Ok(u16::from_le_bytes(self.take()?))
    }

    fn u32(&mut self) -> Result<u32, TreeError> {
        Ok(u32::from_le_bytes(self.take()?))
    }

    fn pair(&mut self) -> Result<[u32; 2], TreeError> {
        Ok([self.u32()?, self.u32()?])
    }

    fn seat(&mut self) -> Result<u8, TreeError> {
        match self.u8()? {
            s @ (0 | 1) => Ok(s),
            _ => Err(TreeError::BadValue("seat")),
        }
    }
}

fn scaled(values: &[f64], unit: f64) -> Vec<f64> {
    values.iter().map(|v| v * unit).collect()
}

#[derive(Clone, Copy)]
struct State {
    street: Street,
    committed: [u32; 2],
    street_bets: [u32; 2],
    to_act: u8,
    acted: [bool; 2],
    aggressive: u8,
    last_inc: u32,
}

struct Builder<'a> {
    preset: &'a Preset,
    nodes: Vec<Node>,
}

impl Builder<'_> {
    fn push(&mut self, node: Node) -> NodeId {
        self.nodes.push(node);
        (self.nodes.len() - 1) as NodeId
    }

    fn showdown(&mut self, s: &State) -> NodeId {
        self.push(Node::Showdown {
            committed: s.committed,
        })
    }

    fn behind(&self, s: &State, seat: usize) -> u32 {
        self.preset.stack - s.committed[seat]
    }

    fn decision(&mut self, s: State) -> NodeId {
        let id = self.push(Node::Showdown {
            committed: s.committed,
        });
        let kinds = self.action_kinds(&s);
        let actions = kinds.into_iter().map(|k| (k, self.apply(&s, k))).collect();
        self.nodes[id as usize] = Node::Decision {
            seat: s.to_act,
            street: s.street,
            committed: s.committed,
            street_bets: s.street_bets,
            actions,
        };
        id
    }

    fn action_kinds(&self, s: &State) -> Vec<ActionKind> {
        let me = usize::from(s.to_act);
        let opp = 1 - me;
        let to_call = s.street_bets[opp] - s.street_bets[me];
        let behind = self.behind(s, me);
        let mut kinds = if to_call > 0 {
            vec![ActionKind::Fold, ActionKind::Call]
        } else {
            vec![ActionKind::Check]
        };
        let capped =
            s.street != Street::Preflop && s.aggressive >= self.preset.postflop.max_aggressive;
        if behind <= to_call || self.behind(s, opp) == 0 || capped {
            return kinds;
        }
        let all_in_to = s.street_bets[me] + behind;
        let min_to = s.street_bets[opp] + s.last_inc;
        let limit = self.preset.postflop.all_in_threshold * f64::from(behind);
        let mut raises = Vec::new();
        for target in self.raise_targets(s, to_call, min_to) {
            let to = (target.round() as u32).max(min_to);
            if to < all_in_to && f64::from(to - s.street_bets[me]) <= limit && !raises.contains(&to)
            {
                raises.push(to);
            }
        }
        raises.sort_unstable();
        kinds.extend(raises.into_iter().map(ActionKind::RaiseTo));
        kinds.push(ActionKind::AllIn);
        kinds
    }

    fn raise_targets(&self, s: &State, to_call: u32, min_to: u32) -> Vec<f64> {
        let opp_bet = f64::from(s.street_bets[1 - usize::from(s.to_act)]);
        if s.street == Street::Preflop {
            let pf = &self.preset.preflop;
            let bb = f64::from(self.preset.big_blind);
            return match s.aggressive {
                0 if to_call > 0 => scaled(pf.open_bb.values(), bb),
                0 => scaled(pf.iso_vs_limp_bb.values(), bb),
                1 => scaled(pf.three_bet_x.values(), opp_bet),
                2 => scaled(pf.four_bet_x.values(), opp_bet),
                _ => Vec::new(),
            };
        }
        let post = &self.preset.postflop;
        let fractions: &[f64] = match s.aggressive {
            0 => &post.first_bet_pot,
            1 => &post.first_raise_pot,
            _ => &[],
        };
        let pot_after_call = f64::from(s.committed[0] + s.committed[1] + to_call);
        let mut targets: Vec<f64> = fractions
            .iter()
            .map(|f| opp_bet + f * pot_after_call)
            .collect();
        if post.min_raise && s.aggressive == 1 && !post.first_raise_pot.is_empty() {
            targets.push(f64::from(min_to));
        }
        targets
    }

    fn apply(&mut self, s: &State, kind: ActionKind) -> NodeId {
        let me = usize::from(s.to_act);
        let opp = 1 - me;
        let behind = self.behind(s, me);
        let mut next = *s;
        next.acted[me] = true;
        next.to_act = opp as u8;
        let target = match kind {
            ActionKind::Fold => {
                return self.push(Node::Fold {
                    folder: s.to_act,
                    committed: s.committed,
                })
            }
            ActionKind::Check => s.street_bets[me],
            ActionKind::Call => s.street_bets[opp].min(s.street_bets[me] + behind),
            ActionKind::RaiseTo(x) => x,
            ActionKind::AllIn => s.street_bets[me] + behind,
        };
        let added = target - s.street_bets[me];
        next.street_bets[me] = target;
        next.committed[me] += added;
        if matches!(kind, ActionKind::RaiseTo(_) | ActionKind::AllIn) {
            next.aggressive += 1;
            next.last_inc = next.last_inc.max(target - s.street_bets[opp]);
            return self.decision(next);
        }
        let matched = next.street_bets[0] == next.street_bets[1] || self.behind(&next, me) == 0;
        if !(matched && next.acted[opp]) {
            return self.decision(next);
        }
        let street = match s.street {
            Street::Preflop => Street::Flop,
            Street::Flop => Street::Turn,
            Street::Turn => Street::River,
            Street::River => return self.showdown(&next),
        };
        if self.behind(&next, 0) == 0 || self.behind(&next, 1) == 0 {
            return self.showdown(&next);
        }
        self.decision(State {
            street,
            committed: next.committed,
            street_bets: [0, 0],
            to_act: 1,
            acted: [false, false],
            aggressive: 0,
            last_inc: self.preset.big_blind,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use ActionKind::*;

    const V1: &str = include_str!("../../../presets/v1.toml");
    const TINY: &str = include_str!("../../../presets/tiny.toml");
    const V2: &str = include_str!("../../../presets/v2.toml");
    const TINY_POTENTIAL: &str = include_str!("../../../presets/tiny-potential.toml");

    fn v2() -> Preset {
        Preset::from_toml(V2).unwrap()
    }

    fn tiny_potential() -> Preset {
        Preset::from_toml(TINY_POTENTIAL).unwrap()
    }

    fn v1() -> Preset {
        Preset::from_toml(V1).unwrap()
    }

    fn tiny() -> Preset {
        Preset::from_toml(TINY).unwrap()
    }

    fn kinds(t: &Tree, id: NodeId) -> Vec<ActionKind> {
        match t.node(id) {
            Node::Decision { actions, .. } => actions.iter().map(|a| a.0).collect(),
            other => panic!("node {id} is not a decision: {other:?}"),
        }
    }

    fn child(t: &Tree, id: NodeId, kind: ActionKind) -> NodeId {
        match t.node(id) {
            Node::Decision { actions, .. } => {
                actions
                    .iter()
                    .find(|a| a.0 == kind)
                    .unwrap_or_else(|| panic!("node {id} has no {kind:?}: {actions:?}"))
                    .1
            }
            other => panic!("node {id} is not a decision: {other:?}"),
        }
    }

    fn path(t: &Tree, steps: &[ActionKind]) -> NodeId {
        steps.iter().fold(t.root(), |id, &k| child(t, id, k))
    }

    fn header(t: &Tree, id: NodeId) -> (u8, Street, [u32; 2], [u32; 2]) {
        match t.node(id) {
            Node::Decision {
                seat,
                street,
                committed,
                street_bets,
                ..
            } => (*seat, *street, *committed, *street_bets),
            other => panic!("node {id} is not a decision: {other:?}"),
        }
    }

    #[test]
    fn root_is_button_preflop() {
        let t = Tree::build(&v1());
        assert_eq!(t.root(), 0);
        assert_eq!(
            header(&t, t.root()),
            (0, Street::Preflop, [10, 20], [10, 20])
        );
        assert_eq!(kinds(&t, t.root()), vec![Fold, Call, RaiseTo(50), AllIn]);
    }

    #[test]
    fn button_fold_is_terminal() {
        let t = Tree::build(&v1());
        assert_eq!(
            t.node(path(&t, &[Fold])),
            &Node::Fold {
                folder: 0,
                committed: [10, 20]
            }
        );
    }

    #[test]
    fn big_blind_facing_limp() {
        let t = Tree::build(&v1());
        let id = path(&t, &[Call]);
        assert_eq!(header(&t, id), (1, Street::Preflop, [20, 20], [20, 20]));
        assert_eq!(kinds(&t, id), vec![Check, RaiseTo(70), AllIn]);
    }

    #[test]
    fn limp_check_goes_to_flop_with_big_blind_first() {
        let t = Tree::build(&v1());
        let id = path(&t, &[Call, Check]);
        assert_eq!(header(&t, id), (1, Street::Flop, [20, 20], [0, 0]));
    }

    #[test]
    fn iso_raise_follows_open_and_three_bet_rules() {
        let t = Tree::build(&v1());
        let id = path(&t, &[Call, RaiseTo(70)]);
        assert_eq!(header(&t, id).0, 0);
        assert_eq!(kinds(&t, id), vec![Fold, Call, RaiseTo(210), AllIn]);
        let id = child(&t, id, RaiseTo(210));
        assert_eq!(kinds(&t, id), vec![Fold, Call, RaiseTo(462), AllIn]);
        let id = child(&t, id, RaiseTo(462));
        assert_eq!(kinds(&t, id), vec![Fold, Call, AllIn]);
    }

    #[test]
    fn preflop_raise_ladder() {
        let t = Tree::build(&v1());
        let open = path(&t, &[RaiseTo(50)]);
        assert_eq!(header(&t, open), (1, Street::Preflop, [50, 20], [50, 20]));
        assert_eq!(kinds(&t, open), vec![Fold, Call, RaiseTo(150), AllIn]);
        let three = child(&t, open, RaiseTo(150));
        assert_eq!(header(&t, three).0, 0);
        assert_eq!(kinds(&t, three), vec![Fold, Call, RaiseTo(330), AllIn]);
        let four = child(&t, three, RaiseTo(330));
        assert_eq!(header(&t, four).0, 1);
        assert_eq!(kinds(&t, four), vec![Fold, Call, AllIn]);
        let jam = child(&t, four, AllIn);
        assert_eq!(kinds(&t, jam), vec![Fold, Call]);
    }

    #[test]
    fn flop_after_open_call() {
        let t = Tree::build(&v1());
        let id = path(&t, &[RaiseTo(50), Call]);
        assert_eq!(header(&t, id), (1, Street::Flop, [50, 50], [0, 0]));
        assert_eq!(
            kinds(&t, id),
            vec![
                Check,
                RaiseTo(50),
                RaiseTo(75),
                RaiseTo(100),
                RaiseTo(150),
                RaiseTo(200),
                AllIn
            ]
        );
    }

    #[test]
    fn flop_raises_and_cap() {
        let t = Tree::build(&v1());
        let bet = path(&t, &[RaiseTo(50), Call, RaiseTo(100)]);
        assert_eq!(header(&t, bet), (0, Street::Flop, [50, 150], [0, 100]));
        assert_eq!(kinds(&t, bet), vec![Fold, Call, RaiseTo(400), AllIn]);
        let raise = child(&t, bet, RaiseTo(400));
        assert_eq!(header(&t, raise).0, 1);
        assert_eq!(kinds(&t, raise), vec![Fold, Call, AllIn]);
        let third = child(&t, raise, AllIn);
        assert_eq!(kinds(&t, third), vec![Fold, Call]);
        assert_eq!(
            t.node(child(&t, third, Call)),
            &Node::Showdown {
                committed: [2000, 2000]
            }
        );
    }

    #[test]
    fn flop_check_through_river_is_showdown() {
        let t = Tree::build(&v1());
        let flop = path(&t, &[RaiseTo(50), Call]);
        let flop_ip = child(&t, flop, Check);
        assert_eq!(header(&t, flop_ip), (0, Street::Flop, [50, 50], [0, 0]));
        let turn = child(&t, flop_ip, Check);
        assert_eq!(header(&t, turn), (1, Street::Turn, [50, 50], [0, 0]));
        let turn_call = path(&t, &[RaiseTo(50), Call, Check, Check, RaiseTo(50), Call]);
        assert_eq!(
            header(&t, turn_call),
            (1, Street::River, [100, 100], [0, 0])
        );
        let river = child(&t, turn, Check);
        let river = child(&t, child(&t, river, Check), Check);
        assert_eq!(
            t.node(child(&t, river, Check)),
            &Node::Showdown {
                committed: [50, 50]
            }
        );
    }

    #[test]
    fn max_aggressive_caps_the_street() {
        let mut p = v1();
        p.postflop.max_aggressive = 1;
        let t = Tree::build(&p);
        let bet = path(&t, &[RaiseTo(50), Call, RaiseTo(100)]);
        assert_eq!(kinds(&t, bet), vec![Fold, Call]);
        let open = path(&t, &[RaiseTo(50)]);
        assert_eq!(kinds(&t, open), vec![Fold, Call, RaiseTo(150), AllIn]);
    }

    #[test]
    fn four_bet_pot_flop_converts_big_bets_to_all_in() {
        let p = v1();
        let t = Tree::build(&p);
        let id = path(&t, &[RaiseTo(50), RaiseTo(150), RaiseTo(330), Call]);
        assert_eq!(header(&t, id), (1, Street::Flop, [330, 330], [0, 0]));
        let k = kinds(&t, id);
        assert_eq!(
            k,
            vec![
                Check,
                RaiseTo(330),
                RaiseTo(495),
                RaiseTo(660),
                RaiseTo(990),
                AllIn
            ]
        );
        let behind = f64::from(p.stack - 330);
        assert_eq!(behind, 1670.0);
        assert!(990.0 <= p.postflop.all_in_threshold * behind);
        assert!(1320.0 > p.postflop.all_in_threshold * behind);
        let unique: HashSet<_> = k.iter().collect();
        assert_eq!(unique.len(), k.len());
    }

    #[test]
    fn short_stack_flop_collapses_to_check_and_all_in() {
        let t = Tree::build(&tiny());
        let id = path(&t, &[RaiseTo(50), RaiseTo(150), Call]);
        assert_eq!(header(&t, id), (1, Street::Flop, [150, 150], [0, 0]));
        assert_eq!(kinds(&t, id), vec![Check, AllIn]);
        let jam = child(&t, id, AllIn);
        assert_eq!(kinds(&t, jam), vec![Fold, Call]);
    }

    #[test]
    fn tiny_raise_is_all_in_only() {
        let t = Tree::build(&tiny());
        let bet = path(&t, &[RaiseTo(50), Call, RaiseTo(100)]);
        assert_eq!(kinds(&t, bet), vec![Fold, Call, AllIn]);
    }

    #[test]
    fn preflop_all_in_call_is_showdown() {
        let t = Tree::build(&v1());
        let jam = path(&t, &[AllIn]);
        assert_eq!(kinds(&t, jam), vec![Fold, Call]);
        assert_eq!(
            t.node(child(&t, jam, Call)),
            &Node::Showdown {
                committed: [2000, 2000]
            }
        );
        assert_eq!(
            t.node(child(&t, jam, Fold)),
            &Node::Fold {
                folder: 1,
                committed: [2000, 20]
            }
        );
    }

    fn check_legal(t: &Tree, p: &Preset, id: NodeId, last_inc: u32, aggressive: u8) {
        let (seat, street, committed, bets, actions) = match t.node(id) {
            Node::Decision {
                seat,
                street,
                committed,
                street_bets,
                actions,
            } => (*seat as usize, *street, *committed, *street_bets, actions),
            Node::Fold { committed, .. } => {
                assert!(committed.iter().all(|&c| c <= p.stack));
                return;
            }
            Node::Showdown { committed } => {
                assert_eq!(committed[0], committed[1]);
                assert!(committed[0] <= p.stack);
                return;
            }
        };
        let opp = 1 - seat;
        let behind = p.stack - committed[seat];
        assert!(behind > 0, "node {id}: actor has no chips");
        assert!(
            !(bets[0] == bets[1] && committed[opp] == p.stack),
            "node {id}: decision after matched all-in"
        );
        let unique: HashSet<_> = actions.iter().map(|a| a.0).collect();
        assert_eq!(unique.len(), actions.len(), "node {id}: duplicate actions");
        if street != Street::Preflop {
            assert!(aggressive <= p.postflop.max_aggressive);
        }
        let min_to = bets[opp] + last_inc;
        let all_in_to = bets[seat] + behind;
        for &(kind, c) in actions {
            assert!(c > id, "node {id}: child {c} not after parent");
            let (next_inc, next_aggr) = match kind {
                RaiseTo(x) => {
                    assert!(x >= min_to, "node {id}: {x} below minimum {min_to}");
                    assert!(x < all_in_to, "node {id}: {x} not below all-in");
                    assert!(
                        f64::from(x - bets[seat])
                            <= p.postflop.all_in_threshold * f64::from(behind)
                    );
                    ((x - bets[opp]).max(last_inc), aggressive + 1)
                }
                AllIn => ((all_in_to - bets[opp]).max(last_inc), aggressive + 1),
                Check => {
                    assert_eq!(bets[0], bets[1]);
                    (last_inc, aggressive)
                }
                Fold | Call => {
                    assert!(bets[opp] > bets[seat]);
                    (last_inc, aggressive)
                }
            };
            let (child_inc, child_aggr) = match t.node(c) {
                Node::Decision { street: s, .. } if *s != street => (p.big_blind, 0),
                _ => (next_inc, next_aggr),
            };
            check_legal(t, p, c, child_inc, child_aggr);
        }
    }

    #[test]
    fn v2_root_has_three_opens() {
        let t = Tree::build(&v2());
        assert_eq!(
            kinds(&t, t.root()),
            vec![Fold, Call, RaiseTo(40), RaiseTo(60), RaiseTo(80), AllIn]
        );
    }

    #[test]
    fn v2_big_blind_facing_limp_has_two_isos() {
        let t = Tree::build(&v2());
        let id = path(&t, &[Call]);
        assert_eq!(kinds(&t, id), vec![Check, RaiseTo(60), RaiseTo(90), AllIn]);
    }

    #[test]
    fn v2_three_bets_scale_with_the_open() {
        let t = Tree::build(&v2());
        let a = path(&t, &[RaiseTo(60)]);
        assert_eq!(
            kinds(&t, a),
            vec![Fold, Call, RaiseTo(180), RaiseTo(240), AllIn]
        );
        let b = path(&t, &[RaiseTo(80)]);
        assert_eq!(
            kinds(&t, b),
            vec![Fold, Call, RaiseTo(240), RaiseTo(320), AllIn]
        );
    }

    #[test]
    fn v2_flop_bets() {
        let t = Tree::build(&v2());
        let id = path(&t, &[RaiseTo(60), Call]);
        assert_eq!(
            kinds(&t, id),
            vec![
                Check,
                RaiseTo(30),
                RaiseTo(79),
                RaiseTo(120),
                RaiseTo(180),
                RaiseTo(240),
                AllIn
            ]
        );
    }

    #[test]
    fn v2_flop_raise_has_the_minimum() {
        let t = Tree::build(&v2());
        let bet = path(&t, &[RaiseTo(60), Call, RaiseTo(120)]);
        assert_eq!(
            kinds(&t, bet),
            vec![Fold, Call, RaiseTo(240), RaiseTo(480), AllIn]
        );
    }

    #[test]
    fn min_raise_needs_a_first_raise_size() {
        let plain = tiny_potential();
        let mut with_min = plain.clone();
        with_min.postflop.min_raise = true;
        assert!(with_min.postflop.first_raise_pot.is_empty());
        assert_eq!(Tree::build(&with_min).nodes(), Tree::build(&plain).nodes());
    }

    #[test]
    fn every_action_is_legal() {
        for p in [v1(), tiny(), v2(), tiny_potential()] {
            let t = Tree::build(&p);
            check_legal(&t, &p, t.root(), p.big_blind, 0);
        }
    }

    #[test]
    fn serialization_round_trips() {
        for p in [v1(), tiny()] {
            let t = Tree::build(&p);
            let bytes = t.serialize();
            assert_eq!(Tree::deserialize(&bytes), Ok(t.clone()));
            assert_eq!(bytes, t.serialize());
        }
    }

    #[test]
    fn deserialize_rejects_bad_input() {
        let t = Tree::build(&tiny());
        let bytes = t.serialize();
        for len in [0, 1, 7, 8, 9, bytes.len() / 2, bytes.len() - 1] {
            assert!(Tree::deserialize(&bytes[..len]).is_err(), "prefix {len}");
        }
        let mut extra = bytes.clone();
        extra.push(0);
        assert_eq!(Tree::deserialize(&extra), Err(TreeError::TrailingBytes));
        let mut bad_tag = bytes.clone();
        bad_tag[12] = 9;
        assert_eq!(Tree::deserialize(&bad_tag), Err(TreeError::BadTag(9)));
        let mut empty = bytes[..8].to_vec();
        empty.extend_from_slice(&0u32.to_le_bytes());
        assert_eq!(Tree::deserialize(&empty), Err(TreeError::Empty));
    }

    #[test]
    fn deserialize_rejects_child_out_of_range() {
        let t = Tree::build(&tiny());
        let mut bytes = t.serialize();
        let n = t.nodes().len() as u32;
        let first_child = 12 + 1 + 1 + 1 + 16 + 1 + 1;
        bytes[first_child..first_child + 4].copy_from_slice(&n.to_le_bytes());
        assert_eq!(
            Tree::deserialize(&bytes),
            Err(TreeError::BadChild { node: 0, child: n })
        );
    }

    #[test]
    fn offsets_are_dense_and_disjoint() {
        for p in [v1(), tiny()] {
            let t = Tree::build(&p);
            let buckets = p.tree_buckets();
            let mut next = 0u64;
            let mut infosets = 0u64;
            for (i, n) in t.nodes().iter().enumerate() {
                if let Node::Decision {
                    street, actions, ..
                } = n
                {
                    let b = buckets[street.as_index()];
                    let a = actions.len() as u64;
                    for bucket in 0..b {
                        assert_eq!(t.offset(i as NodeId, bucket), next);
                        next += a;
                    }
                    infosets += u64::from(b);
                }
            }
            assert_eq!(next, t.action_slot_count());
            assert_eq!(infosets, t.infoset_count());
        }
    }

    #[test]
    #[should_panic(expected = "out of range")]
    fn offset_rejects_out_of_range_bucket() {
        let t = Tree::build(&tiny());
        let street = match t.node(t.root()) {
            Node::Decision { street, .. } => *street,
            other => panic!("{other:?}"),
        };
        t.offset(t.root(), t.buckets()[street.as_index()]);
    }

    #[test]
    fn v1_tree_bytes_are_pinned() {
        use sha2::{Digest, Sha256};
        let digest = Sha256::digest(Tree::build(&v1()).serialize());
        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(
            hex,
            "1807bf640a19d2092c2e3aa5cac694785683a4baadaadb75d48931cda73be244"
        );
    }
}
