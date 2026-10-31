use super::combos::{card_mask, combo_cards, COMBOS};
use crate::cards::Card;
use crate::eval::rank;

pub struct Board {
    pub cards: Vec<Card>,
    pub live: Vec<usize>,
    pub hands: Vec<[Card; 2]>,
    rows: Vec<(usize, usize, usize)>,
}

impl Board {
    pub fn new(cards: &[Card]) -> Board {
        let mask = card_mask(cards);
        let live: Vec<usize> = (0..COMBOS)
            .filter(|&c| card_mask(&combo_cards(c)) & mask == 0)
            .collect();
        let hands: Vec<[Card; 2]> = live.iter().map(|&c| combo_cards(c)).collect();
        let mut rows = Vec::new();
        let mut start = 0;
        for k in 0..hands.len() {
            if k + 1 == hands.len() || hands[k][1] != hands[k + 1][1] {
                rows.push((hands[k][1] as usize, start, k + 1));
                start = k + 1;
            }
        }
        Board {
            cards: cards.to_vec(),
            live,
            hands,
            rows,
        }
    }
}

fn lane_sum(xs: &[f32]) -> f32 {
    let (chunks, rest) = xs.as_chunks::<8>();
    let mut acc = [0.0f32; 8];
    for chunk in chunks {
        for (a, &x) in acc.iter_mut().zip(chunk) {
            *a += x;
        }
    }
    acc.iter().sum::<f32>() + rest.iter().sum::<f32>()
}

pub fn fold_values(board: &Board, opp: &[f32], payoff: f32, out: &mut [f32]) {
    let mut per_card = [0.0f32; 52];
    let mut total = 0.0f32;
    for &(hi, start, end) in &board.rows {
        let row = &opp[start..end];
        let sum = lane_sum(row);
        per_card[hi] += sum;
        total += sum;
        for (h, &w) in board.hands[start..end].iter().zip(row) {
            per_card[h[0] as usize] += w;
        }
    }
    for &(hi, start, end) in &board.rows {
        let base = total - per_card[hi];
        let cells = out[start..end].iter_mut().zip(&board.hands[start..end]);
        for ((o, h), &w) in cells.zip(&opp[start..end]) {
            *o = payoff * (base - per_card[h[0] as usize] + w);
        }
    }
}

fn spread(group: &mut [u32], hands: &[[Card; 2]]) {
    let mask = |p: u32| card_mask(&hands[p as usize]);
    for k in 1..group.len() {
        let recent = group[k.saturating_sub(2)..k]
            .iter()
            .fold(0, |m, &p| m | mask(p));
        if let Some(j) = (k..group.len()).find(|&j| mask(group[j]) & recent == 0) {
            group.swap(k, j);
        }
    }
}

pub struct Ranking {
    order: Vec<u32>,
    hands: Vec<[u8; 2]>,
    groups: Vec<(usize, usize)>,
}

impl Ranking {
    pub fn new(board: &Board) -> Ranking {
        let ranks: Vec<u16> = board
            .hands
            .iter()
            .map(|h| {
                let mut seven = board.cards.clone();
                seven.extend_from_slice(h);
                rank(&seven)
            })
            .collect();
        let mut order: Vec<u32> = (0..board.hands.len() as u32).collect();
        order.sort_by_key(|&p| ranks[p as usize]);
        let mut groups = Vec::new();
        let mut start = 0;
        for k in 0..order.len() {
            let last = k + 1 == order.len();
            if last || ranks[order[k] as usize] != ranks[order[k + 1] as usize] {
                groups.push((start, k + 1));
                start = k + 1;
            }
        }
        for &(start, end) in &groups {
            spread(&mut order[start..end], &board.hands);
        }
        let hands = order.iter().map(|&p| board.hands[p as usize]).collect();
        Ranking {
            order,
            hands,
            groups,
        }
    }

    pub fn remapped(mut self, positions: &[usize]) -> Ranking {
        for p in &mut self.order {
            *p = positions[*p as usize] as u32;
        }
        self
    }

    pub fn values(&self, opp: &[f32], payoff: f32, out: &mut [f32]) {
        let mut cards = [0.0f32; 256];
        let mut total = 0.0f32;
        for &(start, end) in &self.groups {
            let group = self.order[start..end].iter().zip(&self.hands[start..end]);
            for (&p, &[a, b]) in group.clone() {
                out[p as usize] = total - cards[a as usize] - cards[b as usize];
            }
            for (&p, &[a, b]) in group.clone() {
                let w = opp[p as usize];
                total += w;
                cards[a as usize] += w;
                cards[b as usize] += w;
            }
            for (&p, &[a, b]) in group {
                out[p as usize] += total - cards[a as usize] - cards[b as usize];
            }
        }
        for (&p, &[a, b]) in self.order.iter().zip(&self.hands) {
            let o = &mut out[p as usize];
            *o = payoff * (*o - (total - cards[a as usize] - cards[b as usize]));
        }
    }
}

pub fn card_filter(board: &Board, card: Card) -> Vec<usize> {
    board
        .hands
        .iter()
        .enumerate()
        .filter(|(_, h)| h.contains(&card))
        .map(|(p, _)| p)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::parse_cards;
    use crate::rng::Rng;

    fn random_board(rng: &mut Rng, n: usize) -> Vec<Card> {
        let mut deck: Vec<Card> = (0..52).collect();
        rng.shuffle(&mut deck);
        deck.truncate(n);
        deck
    }

    fn random_opp(rng: &mut Rng, n: usize) -> Vec<f32> {
        (0..n)
            .map(|_| {
                if rng.below(3) == 0 {
                    0.0
                } else {
                    rng.next_f64() as f32
                }
            })
            .collect()
    }

    fn close(a: f32, b: f32) -> bool {
        (a - b).abs() <= 1e-3 * (1.0 + b.abs())
    }

    fn brute_fold(board: &Board, opp: &[f32], payoff: f32) -> Vec<f32> {
        let masks: Vec<u64> = board
            .live
            .iter()
            .map(|&c| card_mask(&combo_cards(c)))
            .collect();
        (0..masks.len())
            .map(|i| {
                let s: f32 = (0..masks.len())
                    .filter(|&j| masks[i] & masks[j] == 0)
                    .map(|j| opp[j])
                    .sum();
                payoff * s
            })
            .collect()
    }

    fn brute_showdown(board: &Board, opp: &[f32], payoff: f32) -> Vec<f32> {
        let masks: Vec<u64> = board
            .live
            .iter()
            .map(|&c| card_mask(&combo_cards(c)))
            .collect();
        let ranks: Vec<u16> = board
            .live
            .iter()
            .map(|&c| {
                let mut seven = board.cards.clone();
                seven.extend_from_slice(&combo_cards(c));
                rank(&seven)
            })
            .collect();
        (0..masks.len())
            .map(|i| {
                let mut s = 0.0f32;
                for j in 0..masks.len() {
                    if masks[i] & masks[j] != 0 {
                        continue;
                    }
                    if ranks[i] > ranks[j] {
                        s += opp[j];
                    } else if ranks[i] < ranks[j] {
                        s -= opp[j];
                    }
                }
                payoff * s
            })
            .collect()
    }

    #[test]
    fn live_excludes_board_cards() {
        let board = Board::new(&parse_cards("As Ks Qs Js Ts").unwrap());
        assert_eq!(board.live.len(), 47 * 46 / 2);
        assert!(board.live.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn fold_values_match_brute_force() {
        for seed in 0..20 {
            let mut rng = Rng::new(seed);
            let board = Board::new(&random_board(&mut rng, 5));
            let opp = random_opp(&mut rng, board.live.len());
            let mut out = vec![0.0; board.live.len()];
            fold_values(&board, &opp, 3.0, &mut out);
            let want = brute_fold(&board, &opp, 3.0);
            for (a, b) in out.iter().zip(&want) {
                assert!(close(*a, *b), "seed {seed}: {a} vs {b}");
            }
        }
    }

    #[test]
    fn fold_values_on_a_turn_board() {
        for seed in 0..20 {
            let mut rng = Rng::new(seed);
            let board = Board::new(&random_board(&mut rng, 4));
            let opp = random_opp(&mut rng, board.live.len());
            let mut out = vec![0.0; board.live.len()];
            fold_values(&board, &opp, 3.0, &mut out);
            let want = brute_fold(&board, &opp, 3.0);
            for (a, b) in out.iter().zip(&want) {
                assert!(close(*a, *b), "seed {seed}: {a} vs {b}");
            }
        }
    }

    #[test]
    fn showdown_values_match_brute_force() {
        for seed in 0..20 {
            let mut rng = Rng::new(seed);
            let board = Board::new(&random_board(&mut rng, 5));
            let opp = random_opp(&mut rng, board.live.len());
            let mut out = vec![0.0; board.live.len()];
            Ranking::new(&board).values(&opp, 3.0, &mut out);
            let want = brute_showdown(&board, &opp, 3.0);
            for (a, b) in out.iter().zip(&want) {
                assert!(close(*a, *b), "seed {seed}: {a} vs {b}");
            }
        }
    }

    #[test]
    fn ties_are_zero() {
        let board = Board::new(&parse_cards("As Ks Qs Js Ts").unwrap());
        let mut rng = Rng::new(7);
        let opp = random_opp(&mut rng, board.live.len());
        let mut out = vec![1.0; board.live.len()];
        Ranking::new(&board).values(&opp, 3.0, &mut out);
        assert!(out.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn card_filter_lists_combos_holding_the_card() {
        let board = Board::new(&parse_cards("2c 3c 4c 5c 7d").unwrap());
        let card = parse_cards("As").unwrap()[0];
        let got = card_filter(&board, card);
        assert_eq!(got.len(), 46);
        for &p in &got {
            assert!(board.hands[p].contains(&card));
        }
    }
}
