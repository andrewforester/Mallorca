use crate::cards::Card;

pub const PAIRS: usize = 1326;

pub fn pair_index(a: Card, b: Card) -> usize {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    let hi = usize::from(hi);
    hi * (hi - 1) / 2 + usize::from(lo)
}

pub fn pair_cards(i: usize) -> [Card; 2] {
    let mut hi = 1usize;
    while (hi + 1) * hi / 2 <= i {
        hi += 1;
    }
    [(i - hi * (hi - 1) / 2) as Card, hi as Card]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairs_round_trip() {
        for i in 0..PAIRS {
            let c = pair_cards(i);
            assert!(c[0] < c[1], "{i}: {c:?}");
            assert_eq!(pair_index(c[0], c[1]), i);
            assert_eq!(pair_index(c[1], c[0]), i);
        }
        assert_eq!(pair_cards(PAIRS - 1), [50, 51]);
    }
}
