use super::showdown::{fold_values, Board, Ranking};
use super::tree::{SubAction, SubNode, SubTree};
use crate::cards::Card;

pub(super) const RIVER_WEIGHT: f32 = 1.0 / 44.0;

pub(super) struct River {
    pub card: Card,
    pub ranking: Ranking,
    pub holders: Vec<usize>,
}

pub(super) struct Game {
    pub tree: SubTree,
    pub board: Board,
    pub ranking: Option<Ranking>,
    pub rivers: Vec<River>,
    pub offsets: Vec<usize>,
    pub split: Vec<bool>,
    pub parents: Vec<Option<(usize, usize)>>,
}

impl Game {
    pub fn base(&self, node: usize, river: Option<usize>, k: usize) -> usize {
        let slot = if self.split[node] {
            river.expect("a river card is required on a river node")
        } else {
            0
        };
        self.offsets[node] + slot * k * self.board.live.len()
    }
}

#[derive(Default)]
pub(super) struct Pool {
    free: Vec<Vec<f32>>,
}

impl Pool {
    pub fn take(&mut self, len: usize) -> Vec<f32> {
        let mut v = self.free.pop().unwrap_or_default();
        if v.len() < len {
            v.resize(len, 0.0);
        }
        v.truncate(len);
        v
    }

    pub fn give(&mut self, v: Vec<f32>) {
        self.free.push(v);
    }
}

pub(super) enum Tables<'a> {
    Train {
        regrets: &'a mut [f32],
        sums: &'a mut [f32],
    },
    Fixed {
        sums: &'a [f32],
        best: bool,
    },
}

pub(super) struct Walk<'a> {
    pub game: &'a Game,
    pub tables: Tables<'a>,
    pub pool: &'a mut Pool,
    pub traverser: u8,
}

#[derive(Clone, Copy)]
struct At {
    base: usize,
    k: usize,
    river: Option<usize>,
}

pub(super) fn normalise(rows: &mut [f32], k: usize, totals: &mut [f32]) {
    let n = totals.len();
    totals.fill(0.0);
    for row in rows.chunks_exact(n) {
        for (t, &v) in totals.iter_mut().zip(row) {
            *t += v;
        }
    }
    let uniform = 1.0 / k as f32;
    for row in rows.chunks_exact_mut(n) {
        for (v, &t) in row.iter_mut().zip(totals.iter()) {
            *v = if t > 0.0 { *v / t } else { uniform };
        }
    }
}

fn add_into(out: &mut [f32], add: &[f32], scale: f32) {
    for (o, &v) in out.iter_mut().zip(add) {
        *o += v * scale;
    }
}

impl Walk<'_> {
    pub fn value(&mut self, node: usize, river: Option<usize>, opp: &[f32], out: &mut [f32]) {
        if opp.iter().all(|&w| w == 0.0) {
            out.fill(0.0);
            return;
        }
        let game = self.game;
        match &game.tree.nodes[node] {
            SubNode::Decision { seat, actions, .. } => {
                let at = At {
                    base: game.base(node, river, actions.len()),
                    k: actions.len(),
                    river,
                };
                self.decision(*seat, actions, at, opp, out);
            }
            SubNode::Chance { child } => self.chance(*child, opp, out),
            SubNode::Fold {
                folder,
                contributed,
            } => {
                let lost = contributed[*folder as usize] as f32;
                let payoff = if *folder == self.traverser {
                    -lost
                } else {
                    lost
                };
                fold_values(&game.board, opp, payoff, out);
            }
            SubNode::Showdown { contributed, .. } => {
                self.showdown(river, opp, *contributed as f32, out)
            }
        }
    }

    fn policy(&mut self, at: At, rows: &mut [f32]) {
        let range = at.base..at.base + rows.len();
        match &self.tables {
            Tables::Train { regrets, .. } => {
                for (r, &g) in rows.iter_mut().zip(&regrets[range]) {
                    *r = g.max(0.0);
                }
            }
            Tables::Fixed { sums, .. } => rows.copy_from_slice(&sums[range]),
        }
        let mut totals = self.pool.take(rows.len() / at.k);
        normalise(rows, at.k, &mut totals);
        self.pool.give(totals);
    }

    fn decision(
        &mut self,
        seat: u8,
        actions: &[(SubAction, usize)],
        at: At,
        opp: &[f32],
        out: &mut [f32],
    ) {
        let n = opp.len();
        let mut strat = self.pool.take(at.k * n);
        self.policy(at, &mut strat);
        if seat == self.traverser {
            self.own(actions, at, &strat, opp, out);
        } else {
            self.other(actions, at, &strat, opp, out);
        }
        self.pool.give(strat);
    }

    fn own(
        &mut self,
        actions: &[(SubAction, usize)],
        at: At,
        strat: &[f32],
        opp: &[f32],
        out: &mut [f32],
    ) {
        let n = opp.len();
        let mut values = self.pool.take(at.k * n);
        for ((_, child), row) in actions.iter().zip(values.chunks_exact_mut(n)) {
            self.value(*child, at.river, opp, row);
        }
        if matches!(self.tables, Tables::Fixed { best: true, .. }) {
            out.fill(f32::NEG_INFINITY);
            for row in values.chunks_exact(n) {
                for (o, &v) in out.iter_mut().zip(row) {
                    *o = o.max(v);
                }
            }
        } else {
            out.fill(0.0);
            for (row, p) in values.chunks_exact(n).zip(strat.chunks_exact(n)) {
                for ((o, &v), &q) in out.iter_mut().zip(row).zip(p) {
                    *o += q * v;
                }
            }
        }
        if let Tables::Train { regrets, .. } = &mut self.tables {
            let table = &mut regrets[at.base..at.base + at.k * n];
            for (dst, row) in table.chunks_exact_mut(n).zip(values.chunks_exact(n)) {
                for ((g, &v), &o) in dst.iter_mut().zip(row).zip(out.iter()) {
                    *g += v - o;
                }
            }
        }
        self.pool.give(values);
    }

    fn other(
        &mut self,
        actions: &[(SubAction, usize)],
        at: At,
        strat: &[f32],
        opp: &[f32],
        out: &mut [f32],
    ) {
        let n = opp.len();
        let mut reach = self.pool.take(n);
        let mut child_value = self.pool.take(n);
        out.fill(0.0);
        for (a, ((_, child), p)) in actions.iter().zip(strat.chunks_exact(n)).enumerate() {
            for ((r, &w), &q) in reach.iter_mut().zip(opp).zip(p) {
                *r = w * q;
            }
            if let Tables::Train { sums, .. } = &mut self.tables {
                let start = at.base + a * n;
                add_into(&mut sums[start..start + n], &reach, 1.0);
            }
            self.value(*child, at.river, &reach, &mut child_value);
            add_into(out, &child_value, 1.0);
        }
        self.pool.give(reach);
        self.pool.give(child_value);
    }

    fn chance(&mut self, child: usize, opp: &[f32], out: &mut [f32]) {
        let game = self.game;
        let n = opp.len();
        let mut masked = self.pool.take(n);
        let mut branch = self.pool.take(n);
        out.fill(0.0);
        for (r, river) in game.rivers.iter().enumerate() {
            masked.copy_from_slice(opp);
            for &h in &river.holders {
                masked[h] = 0.0;
            }
            self.value(child, Some(r), &masked, &mut branch);
            for &h in &river.holders {
                branch[h] = 0.0;
            }
            add_into(out, &branch, RIVER_WEIGHT);
        }
        self.pool.give(masked);
        self.pool.give(branch);
    }

    fn showdown(&mut self, river: Option<usize>, opp: &[f32], payoff: f32, out: &mut [f32]) {
        let game = self.game;
        match (river, &game.ranking) {
            (Some(r), _) => self.on_river(r, opp, payoff, out),
            (None, Some(ranking)) => ranking.values(opp, payoff, out),
            (None, None) => {
                let mut branch = self.pool.take(opp.len());
                out.fill(0.0);
                for r in 0..game.rivers.len() {
                    self.on_river(r, opp, payoff, &mut branch);
                    add_into(out, &branch, RIVER_WEIGHT);
                }
                self.pool.give(branch);
            }
        }
    }

    fn on_river(&mut self, r: usize, opp: &[f32], payoff: f32, out: &mut [f32]) {
        let river = &self.game.rivers[r];
        river.ranking.values(opp, payoff, out);
        for &h in &river.holders {
            out[h] = 0.0;
        }
    }
}
