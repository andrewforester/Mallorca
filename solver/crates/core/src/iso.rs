use crate::cards::Card;

const SUITS: usize = 4;
const MAX_ROUNDS: usize = 4;
const RANKS: u32 = 13;
const SHAPE_BITS: u32 = 4;
const KEY_BITS: u32 = 16;

const SUIT_PERMUTATIONS: [[u8; SUITS]; 24] = suit_permutations();

const fn suit_permutations() -> [[u8; SUITS]; 24] {
    let mut out = [[0u8; SUITS]; 24];
    let mut n = 0;
    let mut a = 0;
    while a < 4 {
        let mut b = 0;
        while b < 4 {
            let mut c = 0;
            while c < 4 {
                if a != b && a != c && b != c {
                    out[n] = [a, b, c, 6 - a - b - c];
                    n += 1;
                }
                c += 1;
            }
            b += 1;
        }
        a += 1;
    }
    out
}

const SMALL_BINOM: [[u32; 14]; 14] = small_binom();

const fn small_binom() -> [[u32; 14]; 14] {
    let mut t = [[0u32; 14]; 14];
    let mut n = 0;
    while n < 14 {
        t[n][0] = 1;
        let mut k = 1;
        while k <= n {
            t[n][k] = t[n - 1][k - 1] + if k < n { t[n - 1][k] } else { 0 };
            k += 1;
        }
        n += 1;
    }
    t
}

fn binom(n: u64, k: u64) -> u64 {
    if k > n {
        return 0;
    }
    let k = k.min(n - k);
    let mut r: u64 = 1;
    for i in 0..k {
        r = r * (n - i) / (i + 1);
    }
    r
}

#[derive(Clone, Copy)]
struct Group {
    start: u8,
    len: u8,
    per_suit: u64,
    size: u64,
}

struct Config {
    shapes: [u16; SUITS],
    groups: [Group; SUITS],
    group_count: u8,
}

struct RoundTable {
    keys: Vec<u64>,
    configs: Vec<Config>,
    offsets: Vec<u64>,
    size: u64,
}

pub struct HandIndexer {
    cumulative: Vec<usize>,
    tables: Vec<RoundTable>,
}

fn shape_count(shape: u16, rounds: usize) -> u64 {
    let mut used = 0u32;
    let mut total = 1u64;
    for r in 0..rounds {
        let m = ((shape >> (SHAPE_BITS * r as u32)) & 0xF) as u32;
        total *= SMALL_BINOM[(RANKS - used) as usize][m as usize] as u64;
        used += m;
    }
    total
}

fn config_key(shapes: &[u16; SUITS]) -> u64 {
    shapes
        .iter()
        .fold(0u64, |acc, &s| (acc << KEY_BITS) | s as u64)
}

fn compress(set: u16, used: u16) -> u16 {
    let mut out = 0u16;
    let mut bits = set;
    while bits != 0 {
        let x = bits.trailing_zeros();
        let below = used & ((1u16 << x) - 1);
        out |= 1 << (x - below.count_ones());
        bits &= bits - 1;
    }
    out
}

fn colex(set: u16) -> u64 {
    let mut rank = 0u64;
    let mut bits = set;
    let mut i = 1;
    while bits != 0 {
        let x = bits.trailing_zeros() as usize;
        rank += SMALL_BINOM[x][i] as u64;
        i += 1;
        bits &= bits - 1;
    }
    rank
}

fn uncolex(mut rank: u64, k: u32) -> u16 {
    let mut set = 0u16;
    for j in (1..=k as usize).rev() {
        let mut x = j - 1;
        while x + 1 < RANKS as usize && SMALL_BINOM[x + 1][j] as u64 <= rank {
            x += 1;
        }
        rank -= SMALL_BINOM[x][j] as u64;
        set |= 1 << x;
    }
    set
}

fn expand(compressed: u16, used: u16) -> u16 {
    let mut out = 0u16;
    let mut free_pos = 0u32;
    for r in 0..RANKS {
        if used & (1 << r) != 0 {
            continue;
        }
        if compressed & (1 << free_pos) != 0 {
            out |= 1 << r;
        }
        free_pos += 1;
    }
    out
}

fn multiset_rank(desc: &[u64]) -> u64 {
    let k = desc.len() as u64;
    desc.iter()
        .enumerate()
        .map(|(i, &a)| {
            let j = k - i as u64;
            binom(a + j - 1, j)
        })
        .sum()
}

fn multiset_unrank(mut rank: u64, k: usize, n: u64, out: &mut [u64]) {
    let mut hi = n + k as u64 - 2;
    for (i, slot) in out.iter_mut().enumerate().take(k) {
        let j = (k - i) as u64;
        let mut lo = j - 1;
        while lo < hi {
            let mid = lo + (hi - lo).div_ceil(2);
            if binom(mid, j) <= rank {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        rank -= binom(lo, j);
        *slot = lo + 1 - j;
        hi = lo.saturating_sub(1);
    }
}

fn enumerate_configs(rounds: &[u8]) -> Vec<[u16; SUITS]> {
    let mut found: Vec<[u16; SUITS]> = Vec::new();
    let mut current = [0u16; SUITS];
    fill_round(rounds, 0, &mut current, &mut found);
    for shapes in found.iter_mut() {
        shapes.sort_unstable_by(|a, b| b.cmp(a));
    }
    found.sort_unstable_by_key(config_key);
    found.dedup();
    found
}

fn fill_round(rounds: &[u8], r: usize, current: &mut [u16; SUITS], found: &mut Vec<[u16; SUITS]>) {
    if r == rounds.len() {
        found.push(*current);
        return;
    }
    fill_suit(rounds, r, 0, rounds[r] as u32, current, found);
}

fn fill_suit(
    rounds: &[u8],
    r: usize,
    suit: usize,
    left: u32,
    current: &mut [u16; SUITS],
    found: &mut Vec<[u16; SUITS]>,
) {
    if suit == SUITS - 1 {
        if suit_total(current[suit], r) + left <= RANKS {
            current[suit] |= (left as u16) << (SHAPE_BITS * r as u32);
            fill_round(rounds, r + 1, current, found);
            current[suit] &= !(0xF << (SHAPE_BITS * r as u32));
        }
        return;
    }
    for m in 0..=left {
        if suit_total(current[suit], r) + m > RANKS {
            break;
        }
        current[suit] |= (m as u16) << (SHAPE_BITS * r as u32);
        fill_suit(rounds, r, suit + 1, left - m, current, found);
        current[suit] &= !(0xF << (SHAPE_BITS * r as u32));
    }
}

fn suit_total(shape: u16, rounds: usize) -> u32 {
    (0..rounds)
        .map(|r| ((shape >> (SHAPE_BITS * r as u32)) & 0xF) as u32)
        .sum()
}

fn build_table(rounds: &[u8]) -> RoundTable {
    let shape_list = enumerate_configs(rounds);
    let mut keys = Vec::with_capacity(shape_list.len());
    let mut configs = Vec::with_capacity(shape_list.len());
    let mut offsets = Vec::with_capacity(shape_list.len());
    let mut size = 0u64;
    for shapes in shape_list {
        let empty = Group {
            start: 0,
            len: 0,
            per_suit: 0,
            size: 1,
        };
        let mut groups = [empty; SUITS];
        let mut group_count = 0usize;
        let mut config_size = 1u64;
        let mut start = 0usize;
        while start < SUITS {
            let mut end = start + 1;
            while end < SUITS && shapes[end] == shapes[start] {
                end += 1;
            }
            let len = (end - start) as u64;
            let per_suit = shape_count(shapes[start], rounds.len());
            let group_size = binom(per_suit + len - 1, len);
            groups[group_count] = Group {
                start: start as u8,
                len: len as u8,
                per_suit,
                size: group_size,
            };
            group_count += 1;
            config_size *= group_size;
            start = end;
        }
        keys.push(config_key(&shapes));
        configs.push(Config {
            shapes,
            groups,
            group_count: group_count as u8,
        });
        offsets.push(size);
        size += config_size;
    }
    RoundTable {
        keys,
        configs,
        offsets,
        size,
    }
}

impl HandIndexer {
    pub fn new(rounds: &[u8]) -> HandIndexer {
        assert!(!rounds.is_empty() && rounds.len() <= MAX_ROUNDS);
        assert!(rounds.iter().all(|&c| c <= 7));
        let mut cumulative = Vec::with_capacity(rounds.len());
        let mut total = 0usize;
        for &c in rounds {
            total += c as usize;
            cumulative.push(total);
        }
        assert!(total <= 52);
        let tables = (1..=rounds.len())
            .map(|r| build_table(&rounds[..r]))
            .collect();
        HandIndexer { cumulative, tables }
    }

    pub fn size(&self, round: usize) -> u64 {
        self.tables[round].size
    }

    pub fn index(&self, cards: &[Card]) -> u64 {
        let round = self
            .cumulative
            .iter()
            .position(|&c| c == cards.len())
            .expect("card count must end a round");
        debug_assert_eq!(
            cards.iter().fold(0u64, |m, &c| m | 1 << c).count_ones() as usize,
            cards.len()
        );
        let mut sets = [[0u16; MAX_ROUNDS]; SUITS];
        let mut start = 0usize;
        for (r, &end) in self.cumulative[..=round].iter().enumerate() {
            for &c in &cards[start..end] {
                sets[(c % 4) as usize][r] |= 1 << (c / 4);
            }
            start = end;
        }
        let mut suits = [(0u16, 0u64); SUITS];
        for (slot, suit_sets) in suits.iter_mut().zip(sets.iter()) {
            let mut used = 0u16;
            let mut shape = 0u16;
            let mut idx = 0u64;
            let mut mult = 1u64;
            for (r, &set) in suit_sets[..=round].iter().enumerate() {
                let m = set.count_ones();
                shape |= (m as u16) << (SHAPE_BITS * r as u32);
                idx += mult * colex(compress(set, used));
                mult *= SMALL_BINOM[(RANKS - used.count_ones()) as usize][m as usize] as u64;
                used |= set;
            }
            *slot = (shape, idx);
        }
        suits.sort_unstable_by(|a, b| b.cmp(a));
        let shapes = [suits[0].0, suits[1].0, suits[2].0, suits[3].0];
        let table = &self.tables[round];
        let pos = table
            .keys
            .binary_search(&config_key(&shapes))
            .expect("cards must be a valid hand");
        let config = &table.configs[pos];
        let mut within = 0u64;
        let mut mult = 1u64;
        let mut desc = [0u64; SUITS];
        for g in &config.groups[..config.group_count as usize] {
            let start = g.start as usize;
            let len = g.len as usize;
            for (i, d) in desc[..len].iter_mut().enumerate() {
                *d = suits[start + i].1;
            }
            within += mult * multiset_rank(&desc[..len]);
            mult *= g.size;
        }
        table.offsets[pos] + within
    }

    pub fn unindex(&self, round: usize, index: u64) -> Vec<Card> {
        let table = &self.tables[round];
        assert!(index < table.size);
        let pos = table.offsets.partition_point(|&o| o <= index) - 1;
        let config = &table.configs[pos];
        let mut rem = index - table.offsets[pos];
        let mut suit_idx = [0u64; SUITS];
        for g in &config.groups[..config.group_count as usize] {
            let start = g.start as usize;
            let len = g.len as usize;
            let rank = rem % g.size;
            rem /= g.size;
            multiset_unrank(rank, len, g.per_suit, &mut suit_idx[start..start + len]);
        }
        let mut per_round: Vec<Vec<Card>> = vec![Vec::new(); round + 1];
        for (s, (&shape, &start_idx)) in config.shapes.iter().zip(suit_idx.iter()).enumerate() {
            let mut idx = start_idx;
            let mut used = 0u16;
            for (r, out) in per_round.iter_mut().enumerate() {
                let m = ((shape >> (SHAPE_BITS * r as u32)) & 0xF) as u32;
                let count = SMALL_BINOM[(RANKS - used.count_ones()) as usize][m as usize] as u64;
                let local = idx % count;
                idx /= count;
                let set = expand(uncolex(local, m), used);
                let mut bits = set;
                while bits != 0 {
                    out.push((bits.trailing_zeros() * 4) as Card + s as Card);
                    bits &= bits - 1;
                }
                used |= set;
            }
        }
        let mut cards = Vec::with_capacity(self.cumulative[round]);
        for mut cs in per_round {
            cs.sort_unstable();
            cards.extend(cs);
        }
        cards
    }

    pub fn class_weight(&self, round: usize, index: u64) -> u32 {
        let cards = self.unindex(round, index);
        let original = self.round_masks(&cards, round, [0, 1, 2, 3]);
        let fixed = SUIT_PERMUTATIONS
            .iter()
            .filter(|&&perm| self.round_masks(&cards, round, perm) == original)
            .count() as u32;
        SUIT_PERMUTATIONS.len() as u32 / fixed
    }

    fn round_masks(&self, cards: &[Card], round: usize, perm: [u8; SUITS]) -> [u64; MAX_ROUNDS] {
        let mut masks = [0u64; MAX_ROUNDS];
        let mut start = 0usize;
        for (mask, &end) in masks.iter_mut().zip(&self.cumulative[..=round]) {
            for &c in &cards[start..end] {
                *mask |= 1 << ((c / 4) * 4 + perm[(c % 4) as usize]);
            }
            start = end;
        }
        masks
    }
}

pub fn street_indexers() -> [HandIndexer; 4] {
    [
        HandIndexer::new(&[2]),
        HandIndexer::new(&[2, 3]),
        HandIndexer::new(&[2, 4]),
        HandIndexer::new(&[2, 5]),
    ]
}

pub fn board_indexer(cards: u8) -> HandIndexer {
    HandIndexer::new(&[cards])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::{parse_cards, rank, suit};
    use crate::rng::Rng;

    fn deal(rng: &mut Rng, n: usize) -> Vec<Card> {
        let mut deck: Vec<Card> = (0..52).collect();
        rng.shuffle(&mut deck);
        deck.truncate(n);
        deck
    }

    fn assert_valid(cards: &[Card]) {
        let mut seen = 0u64;
        for &c in cards {
            assert!(c < 52);
            assert_eq!(seen & (1 << c), 0);
            seen |= 1 << c;
        }
    }

    fn round_trip_random(indexer: &HandIndexer, round: usize, cards: usize, seed: u64, n: usize) {
        let mut rng = Rng::new(seed);
        for _ in 0..n {
            let i = rng.next_u64() % indexer.size(round);
            let hand = indexer.unindex(round, i);
            assert_eq!(hand.len(), cards);
            assert_valid(&hand);
            assert_eq!(indexer.index(&hand), i);
        }
    }

    #[test]
    fn street_sizes() {
        let [pre, flop, turn, river] = street_indexers();
        assert_eq!(pre.size(0), 169);
        assert_eq!(flop.size(1), 1_286_792);
        assert_eq!(turn.size(1), 13_960_050);
        assert_eq!(river.size(1), 123_156_254);
        assert_eq!(river.size(0), 169);
    }

    #[test]
    fn per_round_sizes_match_waugh() {
        let rounds = HandIndexer::new(&[2, 3, 1, 1]);
        assert_eq!(rounds.size(0), 169);
        assert_eq!(rounds.size(1), 1_286_792);
        assert_eq!(rounds.size(2), 55_190_538);
        assert_eq!(rounds.size(3), 2_428_287_420);
    }

    #[test]
    fn board_sizes() {
        assert_eq!(board_indexer(5).size(0), 134_459);
        assert_eq!(board_indexer(3).size(0), 1_755);
    }

    #[test]
    fn preflop_covers_all_classes() {
        let pre = HandIndexer::new(&[2]);
        let mut hit = vec![0u32; 169];
        for a in 0..52u8 {
            for b in (a + 1)..52 {
                hit[pre.index(&[a, b]) as usize] += 1;
            }
        }
        assert_eq!(hit.iter().filter(|&&h| h == 6).count(), 13);
        assert_eq!(hit.iter().filter(|&&h| h == 4).count(), 78);
        assert_eq!(hit.iter().filter(|&&h| h == 12).count(), 78);
    }

    #[test]
    fn flop_boards_cover_all_classes() {
        let board = board_indexer(3);
        let mut hit = vec![false; 1_755];
        for a in 0..52u8 {
            for b in (a + 1)..52 {
                for c in (b + 1)..52 {
                    hit[board.index(&[a, b, c]) as usize] = true;
                }
            }
        }
        assert!(hit.iter().all(|&h| h));
    }

    #[test]
    fn preflop_round_trip() {
        let pre = HandIndexer::new(&[2]);
        for i in 0..pre.size(0) {
            let cards = pre.unindex(0, i);
            assert_eq!(cards.len(), 2);
            assert_valid(&cards);
            assert_eq!(pre.index(&cards), i);
        }
    }

    #[test]
    #[ignore]
    fn flop_round_trip_exhaustive() {
        let flop = HandIndexer::new(&[2, 3]);
        for i in 0..flop.size(1) {
            let cards = flop.unindex(1, i);
            assert_eq!(cards.len(), 5);
            assert_valid(&cards);
            assert_eq!(flop.index(&cards), i);
        }
    }

    #[test]
    fn flop_round_trip_random() {
        round_trip_random(&HandIndexer::new(&[2, 3]), 1, 5, 3, 100_000);
    }

    #[test]
    fn board_round_trip_random() {
        round_trip_random(&board_indexer(5), 0, 5, 11, 20_000);
    }

    #[test]
    fn turn_and_river_round_trip_random() {
        let [_, _, turn, river] = street_indexers();
        round_trip_random(&turn, 1, 6, 5, 100_000);
        round_trip_random(&river, 1, 7, 6, 100_000);
    }

    #[test]
    fn per_round_round_trip_random() {
        let rounds = HandIndexer::new(&[2, 3, 1, 1]);
        round_trip_random(&rounds, 2, 6, 7, 100_000);
        round_trip_random(&rounds, 3, 7, 8, 100_000);
    }

    #[test]
    fn unindex_prefix_is_a_lower_round_hand() {
        let rounds = HandIndexer::new(&[2, 3, 1, 1]);
        let mut rng = Rng::new(9);
        for _ in 0..10_000 {
            let i = rng.next_u64() % rounds.size(3);
            let cards = rounds.unindex(3, i);
            let flop = rounds.index(&cards[..5]);
            assert!(flop < rounds.size(1));
            assert_eq!(rounds.index(&rounds.unindex(1, flop)), flop);
        }
    }

    #[test]
    fn suit_permutation_keeps_index() {
        let [pre, flop, turn, river] = street_indexers();
        let rounds = HandIndexer::new(&[2, 3, 1, 1]);
        let mut rng = Rng::new(17);
        for _ in 0..10_000 {
            let cards = deal(&mut rng, 7);
            let mut perm = [0u8, 1, 2, 3];
            rng.shuffle(&mut perm);
            let mapped: Vec<Card> = cards
                .iter()
                .map(|&c| rank(c) * 4 + perm[suit(c) as usize])
                .collect();
            assert_eq!(pre.index(&cards[..2]), pre.index(&mapped[..2]));
            assert_eq!(flop.index(&cards[..5]), flop.index(&mapped[..5]));
            assert_eq!(turn.index(&cards[..6]), turn.index(&mapped[..6]));
            assert_eq!(river.index(&cards), river.index(&mapped));
            for n in [2usize, 5, 6, 7] {
                assert_eq!(rounds.index(&cards[..n]), rounds.index(&mapped[..n]));
            }
        }
    }

    #[test]
    fn order_within_round_keeps_index() {
        let river = HandIndexer::new(&[2, 5]);
        let rounds = HandIndexer::new(&[2, 3, 1, 1]);
        let mut rng = Rng::new(23);
        for _ in 0..10_000 {
            let cards = deal(&mut rng, 7);
            let mut shuffled = cards.clone();
            rng.shuffle(&mut shuffled[0..2]);
            rng.shuffle(&mut shuffled[2..5]);
            assert_eq!(rounds.index(&cards), rounds.index(&shuffled));
            rng.shuffle(&mut shuffled[2..7]);
            assert_eq!(river.index(&cards), river.index(&shuffled));
        }
    }

    #[test]
    fn preflop_class_weights() {
        let pre = HandIndexer::new(&[2]);
        let aa = pre.index(&parse_cards("As Ad").unwrap());
        let aks = pre.index(&parse_cards("As Ks").unwrap());
        let ako = pre.index(&parse_cards("As Kd").unwrap());
        assert_eq!(pre.class_weight(0, aa), 6);
        assert_eq!(pre.class_weight(0, aks), 4);
        assert_eq!(pre.class_weight(0, ako), 12);
        let total: u64 = (0..pre.size(0))
            .map(|i| u64::from(pre.class_weight(0, i)))
            .sum();
        assert_eq!(total, 1_326);
    }

    #[test]
    fn class_weights_sum_to_raw_counts() {
        let flop = &street_indexers()[1];
        let total: u64 = (0..flop.size(1))
            .map(|i| u64::from(flop.class_weight(1, i)))
            .sum();
        assert_eq!(total, 25_989_600);
    }

    #[test]
    #[ignore]
    fn turn_class_weights_sum_to_raw_counts() {
        let turn = &street_indexers()[2];
        let total: u64 = (0..turn.size(1))
            .map(|i| u64::from(turn.class_weight(1, i)))
            .sum();
        assert_eq!(total, 305_377_800);
    }

    #[test]
    fn rounds_are_distinguished() {
        let flop = HandIndexer::new(&[2, 3]);
        let a = parse_cards("As Ks 2s 3s 4s").unwrap();
        let b = parse_cards("2s 3s As Ks 4s").unwrap();
        let c = parse_cards("As Kh 2s 3s 4s").unwrap();
        let d = parse_cards("Ad Kd 2d 3d 4d").unwrap();
        assert_ne!(flop.index(&a), flop.index(&b));
        assert_ne!(flop.index(&a), flop.index(&c));
        assert_eq!(flop.index(&a), flop.index(&d));
    }
}
