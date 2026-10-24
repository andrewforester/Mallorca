use crate::cards::Card;

pub const COMBOS: usize = 1326;

pub fn combo_index(a: Card, b: Card) -> usize {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    let hi = hi as usize;
    hi * (hi - 1) / 2 + lo as usize
}

pub fn combo_cards(i: usize) -> [Card; 2] {
    let mut hi = 1usize;
    while (hi + 1) * hi / 2 <= i {
        hi += 1;
    }
    let lo = i - hi * (hi - 1) / 2;
    [lo as Card, hi as Card]
}

pub fn card_mask(cards: &[Card]) -> u64 {
    cards.iter().fold(0, |m, &c| m | (1u64 << c))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::parse_cards;
    use std::collections::HashSet;

    #[test]
    fn every_index_round_trips() {
        let mut seen = HashSet::new();
        for i in 0..COMBOS {
            let c = combo_cards(i);
            assert!(c[0] < c[1]);
            assert_eq!(combo_index(c[0], c[1]), i);
            assert_eq!(combo_index(c[1], c[0]), i);
            assert!(seen.insert((c[0], c[1])));
        }
        assert_eq!(seen.len(), COMBOS);
    }

    #[test]
    fn card_mask_sets_one_bit_per_card() {
        assert_eq!(
            card_mask(&parse_cards("2c As").unwrap()),
            (1u64 << 0) | (1u64 << 51)
        );
    }
}
