use super::combos::{card_mask, combo_cards, COMBOS};
use crate::cards::Card;

#[derive(Clone, Debug, PartialEq)]
pub struct Range {
    pub weights: Vec<f32>,
}

impl Range {
    pub fn uniform() -> Range {
        Range {
            weights: vec![1.0; COMBOS],
        }
    }

    pub fn without(&self, dead: &[Card]) -> Range {
        let mask = card_mask(dead);
        let mut out = self.clone();
        for (i, w) in out.weights.iter_mut().enumerate() {
            if card_mask(&combo_cards(i)) & mask != 0 {
                *w = 0.0;
            }
        }
        out
    }

    pub fn update(&mut self, p: impl Fn([Card; 2]) -> f32) {
        for (i, w) in self.weights.iter_mut().enumerate() {
            if *w > 0.0 {
                *w *= p(combo_cards(i));
            }
        }
    }

    pub fn total(&self) -> f64 {
        self.weights.iter().map(|&w| w as f64).sum()
    }

    pub fn or_uniform(self, dead: &[Card]) -> Range {
        let total = self.total();
        if total > 0.0 && total.is_finite() {
            self
        } else {
            Range::uniform().without(dead)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::parse_cards;
    use crate::subgame::combos::combo_index;

    #[test]
    fn without_zeroes_combos_on_the_board() {
        let board = parse_cards("Kh 7d 2c").unwrap();
        let r = Range::uniform().without(&board);
        assert_eq!(r.weights.iter().filter(|w| **w > 0.0).count(), 1176);
        let kh = board[0];
        let a_s = parse_cards("As").unwrap()[0];
        assert_eq!(r.weights[combo_index(kh, a_s)], 0.0);
    }

    #[test]
    fn update_multiplies() {
        let mut r = Range::uniform();
        r.update(|c| if c[0] % 4 == 0 { 0.5 } else { 1.0 });
        let two_c = parse_cards("2c").unwrap()[0];
        let three_d = parse_cards("3d").unwrap()[0];
        assert_eq!(r.weights[combo_index(two_c, three_d)], 0.5);
        let two_d = parse_cards("2d").unwrap()[0];
        assert_eq!(r.weights[combo_index(two_d, three_d)], 1.0);
    }

    #[test]
    fn an_empty_range_resets_to_uniform() {
        let board = parse_cards("Kh 7d 2c").unwrap();
        let empty = Range {
            weights: vec![0.0; COMBOS],
        };
        assert_eq!(empty.or_uniform(&board), Range::uniform().without(&board));
        let mut one = Range {
            weights: vec![0.0; COMBOS],
        };
        one.weights[5] = 2.0;
        assert_eq!(one.clone().or_uniform(&board), one);
    }
}
