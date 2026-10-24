use super::combos::{card_mask, combo_cards, COMBOS};
use crate::cards::Card;
use crate::eval::rank;

pub struct Board {
    pub cards: Vec<Card>,
    pub live: Vec<usize>,
    pub hands: Vec<[Card; 2]>,
}

impl Board {
    pub fn new(cards: &[Card]) -> Board {
        let mask = card_mask(cards);
        let live: Vec<usize> = (0..COMBOS)
            .filter(|&c| card_mask(&combo_cards(c)) & mask == 0)
            .collect();
        let hands = live.iter().map(|&c| combo_cards(c)).collect();
        Board {
            cards: cards.to_vec(),
            live,
            hands,
        }
    }
}

pub fn fold_values(board: &Board, opp: &[f32], payoff: f32, out: &mut [f32]) {
    let mut per_card = [0.0f32; 52];
    let mut total = 0.0f32;
    for (h, &w) in board.hands.iter().zip(opp) {
        total += w;
        per_card[h[0] as usize] += w;
        per_card[h[1] as usize] += w;
    }
    for (i, h) in board.hands.iter().enumerate() {
        let free = total - per_card[h[0] as usize] - per_card[h[1] as usize] + opp[i];
        out[i] = payoff * free;
    }
}

pub struct Ranking {
    order: Vec<u32>,
    hands: Vec<[Card; 2]>,
    group_ends: Vec<usize>,
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
        let hands = order.iter().map(|&p| board.hands[p as usize]).collect();
        let mut group_ends = Vec::new();
        for k in 0..order.len() {
            let last = k + 1 == order.len();
            if last || ranks[order[k] as usize] != ranks[order[k + 1] as usize] {
                group_ends.push(k + 1);
            }
        }
        Ranking {
            order,
            hands,
            group_ends,
        }
    }

    pub fn values(&self, opp: &[f32], payoff: f32, out: &mut [f32]) {
        let mut all = [0.0f32; 52];
        let mut all_total = 0.0f32;
        for (&p, h) in self.order.iter().zip(&self.hands) {
            let w = opp[p as usize];
            all_total += w;
            all[h[0] as usize] += w;
            all[h[1] as usize] += w;
        }
        let mut weak = [0.0f32; 52];
        let mut weak_total = 0.0f32;
        let mut start = 0;
        for &end in &self.group_ends {
            let lower = weak_total;
            let lower_cards = weak;
            for k in start..end {
                let w = opp[self.order[k] as usize];
                weak_total += w;
                weak[self.hands[k][0] as usize] += w;
                weak[self.hands[k][1] as usize] += w;
            }
            for k in start..end {
                let [a, b] = self.hands[k].map(|c| c as usize);
                let below = lower - lower_cards[a] - lower_cards[b];
                let above = (all_total - weak_total) - (all[a] - weak[a]) - (all[b] - weak[b]);
                out[self.order[k] as usize] = payoff * (below - above);
            }
            start = end;
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
