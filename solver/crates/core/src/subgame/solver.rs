use super::combos::{card_mask, combo_index, COMBOS};
use super::range::Range;
use super::showdown::{card_filter, fold_values, Board, Ranking};
use super::traverse::{normalise, Game, Pool, River, Tables, Walk};
use super::tree::{SubAction, SubNode, SubTree};
use crate::cards::Card;
use crate::tree::Street;

pub struct Solver {
    game: Game,
    ranges: [Vec<f32>; 2],
    regrets: Vec<f32>,
    sums: Vec<f32>,
    iterations: u32,
    pool: Pool,
}

fn river(base: &Board, card: Card) -> River {
    let mut cards = base.cards.clone();
    cards.push(card);
    let board = Board::new(&cards);
    let positions: Vec<usize> = board
        .live
        .iter()
        .map(|c| {
            base.live
                .binary_search(c)
                .expect("river combos are turn combos")
        })
        .collect();
    River {
        card,
        ranking: Ranking::new(&board).remapped(&positions),
        holders: card_filter(base, card),
    }
}

fn split_nodes(tree: &SubTree, parents: &[Option<(usize, usize)>]) -> Vec<bool> {
    let turn = tree.root.street == Street::Turn;
    let mut split = vec![false; tree.nodes.len()];
    for (i, node) in tree.nodes.iter().enumerate() {
        split[i] = turn
            && match node {
                SubNode::Decision { river, .. } => *river,
                _ => parents[i].is_some_and(|(p, _)| split[p]),
            };
    }
    split
}

fn dot(a: &[f32], b: &[f32]) -> f64 {
    a.iter().zip(b).map(|(&x, &y)| x as f64 * y as f64).sum()
}

impl Solver {
    pub fn new(tree: SubTree, board: &[Card], ranges: [Range; 2]) -> Solver {
        let turn = tree.root.street == Street::Turn;
        if turn {
            assert!(board.len() == 4, "a turn tree needs a 4-card board");
        } else {
            assert!(board.len() == 5, "a river tree needs a 5-card board");
        }
        let base = Board::new(board);
        let mask = card_mask(board);
        let rivers: Vec<River> = if turn {
            (0..52u8)
                .filter(|c| mask & (1u64 << c) == 0)
                .map(|c| river(&base, c))
                .collect()
        } else {
            Vec::new()
        };
        let parents = tree.parent_edges();
        let split = split_nodes(&tree, &parents);
        let n = base.live.len();
        let mut offsets = vec![0; tree.nodes.len()];
        let mut total = 0;
        for (i, node) in tree.nodes.iter().enumerate() {
            if let SubNode::Decision { actions, .. } = node {
                offsets[i] = total;
                let slots = if split[i] { rivers.len() } else { 1 };
                total += slots * actions.len() * n;
            }
        }
        let ranges = ranges.map(|r| base.live.iter().map(|&c| r.weights[c]).collect());
        let ranking = (!turn).then(|| Ranking::new(&base));
        Solver {
            game: Game {
                tree,
                board: base,
                ranking,
                rivers,
                offsets,
                split,
                parents,
            },
            ranges,
            regrets: vec![0.0; total],
            sums: vec![0.0; total],
            iterations: 0,
            pool: Pool::default(),
        }
    }

    pub fn tree(&self) -> &SubTree {
        &self.game.tree
    }

    pub fn iterations(&self) -> u32 {
        self.iterations
    }

    pub fn run(&mut self, iterations: u32) {
        let n = self.game.board.live.len();
        for _ in 0..iterations {
            for traverser in 0..2u8 {
                let mut out = self.pool.take(n);
                let mut walk = Walk {
                    game: &self.game,
                    tables: Tables::Train {
                        regrets: &mut self.regrets,
                        sums: &mut self.sums,
                    },
                    pool: &mut self.pool,
                    traverser,
                };
                walk.value(0, None, &self.ranges[1 - traverser as usize], &mut out);
                self.pool.give(out);
            }
            self.iterations += 1;
            self.discount();
        }
    }

    fn discount(&mut self) {
        let t = self.iterations as f64;
        let positive = (t.powf(1.5) / (t.powf(1.5) + 1.0)) as f32;
        let sum = ((t / (t + 1.0)).powi(2)) as f32;
        for g in &mut self.regrets {
            *g *= if *g > 0.0 { positive } else { 0.5 };
        }
        for s in &mut self.sums {
            *s *= sum;
        }
    }

    fn walk<'a>(&'a self, pool: &'a mut Pool, traverser: u8, best: bool) -> Walk<'a> {
        Walk {
            game: &self.game,
            tables: Tables::Fixed {
                sums: &self.sums,
                best,
            },
            pool,
            traverser,
        }
    }

    pub fn exploitability(&self) -> f64 {
        let n = self.game.board.live.len();
        let mut pool = Pool::default();
        let mut out = vec![0.0; n];
        fold_values(&self.game.board, &self.ranges[1], 1.0, &mut out);
        let total = dot(&out, &self.ranges[0]);
        if total <= 0.0 {
            return 0.0;
        }
        let mut sum = 0.0;
        for p in 0..2u8 {
            let mut walk = self.walk(&mut pool, p, true);
            walk.value(0, None, &self.ranges[1 - p as usize], &mut out);
            sum += dot(&out, &self.ranges[p as usize]);
        }
        sum / 2.0 / total
    }

    fn position(&self, hole: [Card; 2]) -> Option<usize> {
        if hole[0] == hole[1] || hole.iter().any(|&c| c >= 52) {
            return None;
        }
        let c = combo_index(hole[0], hole[1]);
        self.game.board.live.binary_search(&c).ok()
    }

    fn slot(&self, node: usize, river: Option<Card>) -> Option<Option<usize>> {
        if !self.game.split[node] {
            return Some(None);
        }
        let card = river?;
        self.game
            .rivers
            .iter()
            .position(|r| r.card == card)
            .map(Some)
    }

    fn decision(&self, node: usize) -> Option<(u8, &[(SubAction, usize)])> {
        match self.game.tree.nodes.get(node)? {
            SubNode::Decision { seat, actions, .. } => Some((*seat, actions)),
            _ => None,
        }
    }

    fn average(&self, node: usize, river: Option<usize>, k: usize) -> Vec<f32> {
        let n = self.game.board.live.len();
        let base = self.game.base(node, river, k);
        let mut rows = self.sums[base..base + k * n].to_vec();
        normalise(&mut rows, k, &mut vec![0.0; n]);
        rows
    }

    fn blocked(&self, river: Option<usize>, hole: [Card; 2]) -> bool {
        river.is_some_and(|r| hole.contains(&self.game.rivers[r].card))
    }

    pub fn strategy(&self, node: usize, river: Option<Card>, hole: [Card; 2]) -> Vec<f32> {
        let Some((_, actions)) = self.decision(node) else {
            return Vec::new();
        };
        let k = actions.len();
        let uniform = vec![1.0 / k as f32; k];
        let Some(r) = self.slot(node, river) else {
            return uniform;
        };
        let Some(pos) = self.position(hole).filter(|_| !self.blocked(r, hole)) else {
            return uniform;
        };
        let n = self.game.board.live.len();
        let base = self.game.base(node, r, k);
        let row: Vec<f32> = (0..k).map(|a| self.sums[base + a * n + pos]).collect();
        let total: f32 = row.iter().sum();
        if total > 0.0 && total.is_finite() {
            row.iter().map(|&s| s / total).collect()
        } else {
            uniform
        }
    }

    fn reach(&self, node: usize, river: Option<usize>) -> [Vec<f32>; 2] {
        let n = self.game.board.live.len();
        let mut reach = self.ranges.clone();
        if let Some(r) = river {
            for side in &mut reach {
                for &h in &self.game.rivers[r].holders {
                    side[h] = 0.0;
                }
            }
        }
        let mut at = node;
        while let Some((parent, slot)) = self.game.parents[at] {
            if let SubNode::Decision { seat, actions, .. } = &self.game.tree.nodes[parent] {
                let rows = self.average(parent, river, actions.len());
                let p = &rows[slot * n..(slot + 1) * n];
                for (w, &q) in reach[*seat as usize].iter_mut().zip(p) {
                    *w *= q;
                }
            }
            at = parent;
        }
        reach
    }

    pub fn ranges_at(&self, node: usize, river: Option<Card>) -> [Range; 2] {
        let slot = (node < self.game.tree.nodes.len())
            .then(|| self.slot(node, river))
            .flatten();
        let reach = match slot {
            Some(r) => self.reach(node, r),
            None => self.ranges.clone(),
        };
        reach.map(|side| {
            let mut weights = vec![0.0; COMBOS];
            for (&c, &w) in self.game.board.live.iter().zip(&side) {
                weights[c] = w;
            }
            Range { weights }
        })
    }

    pub fn action_evs(&self, node: usize, river: Option<Card>, hole: [Card; 2]) -> Vec<f32> {
        let Some((seat, actions)) = self.decision(node) else {
            return Vec::new();
        };
        let zeros = vec![0.0; actions.len()];
        let Some(r) = self.slot(node, river) else {
            return zeros;
        };
        let Some(pos) = self.position(hole).filter(|_| !self.blocked(r, hole)) else {
            return zeros;
        };
        let reach = self.reach(node, r);
        let opp = &reach[1 - seat as usize];
        let mine = card_mask(&hole);
        let mass: f64 = self
            .game
            .board
            .hands
            .iter()
            .zip(opp)
            .filter(|(h, _)| card_mask(&h[..]) & mine == 0)
            .map(|(_, &w)| w as f64)
            .sum();
        if mass <= 0.0 {
            return zeros;
        }
        let mut pool = Pool::default();
        let mut out = vec![0.0; self.game.board.live.len()];
        let mut walk = self.walk(&mut pool, seat, false);
        actions
            .iter()
            .map(|(_, child)| {
                walk.value(*child, r, opp, &mut out);
                (out[pos] as f64 / mass) as f32
            })
            .collect()
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
