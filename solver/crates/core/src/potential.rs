use crate::cards::Card;
use crate::eval::rank;
use crate::iso::HandIndexer;
use std::sync::OnceLock;

pub const BINS: usize = 50;
pub const CLUSTERS: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Metric {
    Emd,
    L2,
}

fn preflop_indexer() -> &'static HandIndexer {
    static INDEXER: OnceLock<HandIndexer> = OnceLock::new();
    INDEXER.get_or_init(|| HandIndexer::new(&[2]))
}

pub fn bin_of(hs: f32) -> usize {
    ((hs * BINS as f32) as usize).min(BINS - 1)
}

pub fn emd(a: &[f32], b: &[f32]) -> f32 {
    let mut ca = 0.0f32;
    let mut cb = 0.0f32;
    let mut total = 0.0f32;
    for (&x, &y) in a.iter().zip(b) {
        ca += x;
        cb += y;
        total += (ca - cb).abs();
    }
    total
}

pub fn l2(a: &[f32], b: &[f32]) -> f32 {
    let mut total = 0.0f32;
    for (&x, &y) in a.iter().zip(b) {
        let d = x - y;
        total += d * d;
    }
    total
}

pub fn nearest(metric: Metric, centroids: &[f32], dimension: usize, point: &[f32]) -> u16 {
    let distance = match metric {
        Metric::Emd => emd,
        Metric::L2 => l2,
    };
    let mut best = 0usize;
    let mut best_distance = f32::INFINITY;
    for (i, centroid) in centroids.chunks_exact(dimension).enumerate() {
        let d = distance(centroid, point);
        if d < best_distance {
            best = i;
            best_distance = d;
        }
    }
    best as u16
}

pub fn histogram(counts: &[u32; BINS]) -> [f32; BINS] {
    let total = counts.iter().sum::<u32>() as f32;
    let mut out = [0.0f32; BINS];
    for (o, &c) in out.iter_mut().zip(counts) {
        *o = c as f32 / total;
    }
    out
}

fn live_cards(dead: &[Card]) -> Vec<Card> {
    (0..52u8).filter(|c| !dead.contains(c)).collect()
}

pub fn turn_counts(
    hole: [Card; 2],
    board: &[Card; 4],
    mut river: impl FnMut([Card; 2], &[Card; 5]) -> f32,
) -> [u32; BINS] {
    let mut dead = [0 as Card; 6];
    dead[..2].copy_from_slice(&hole);
    dead[2..].copy_from_slice(board);
    let mut full = [0 as Card; 5];
    full[..4].copy_from_slice(board);
    let mut counts = [0u32; BINS];
    for c in live_cards(&dead) {
        full[4] = c;
        counts[bin_of(river(hole, &full))] += 1;
    }
    counts
}

pub fn flop_counts(
    hole: [Card; 2],
    board: &[Card; 3],
    mut river: impl FnMut([Card; 2], &[Card; 5]) -> f32,
) -> [u32; BINS] {
    let mut dead = [0 as Card; 5];
    dead[..2].copy_from_slice(&hole);
    dead[2..].copy_from_slice(board);
    let live = live_cards(&dead);
    let mut full = [0 as Card; 5];
    full[..3].copy_from_slice(board);
    let mut counts = [0u32; BINS];
    for (i, &turn) in live.iter().enumerate() {
        full[3] = turn;
        for &card in &live[i + 1..] {
            full[4] = card;
            counts[bin_of(river(hole, &full))] += 1;
        }
    }
    counts
}

pub fn ochs_live(hole: [Card; 2], board: &[Card; 5], clusters: &[u8; 169]) -> [f32; CLUSTERS] {
    let mut seven = [0 as Card; 7];
    seven[..2].copy_from_slice(&hole);
    seven[2..].copy_from_slice(board);
    let mine = rank(&seven);
    let live = live_cards(&seven);
    let pre = preflop_indexer();
    let mut wins = [0u32; CLUSTERS];
    let mut ties = [0u32; CLUSTERS];
    let mut totals = [0u32; CLUSTERS];
    let mut theirs = seven;
    for (i, &a) in live.iter().enumerate() {
        for &b in &live[i + 1..] {
            theirs[0] = a;
            theirs[1] = b;
            let cluster = clusters[pre.index(&[a, b]) as usize] as usize;
            totals[cluster] += 1;
            let r = rank(&theirs);
            if r < mine {
                wins[cluster] += 1;
            } else if r == mine {
                ties[cluster] += 1;
            }
        }
    }
    let mut out = [0.5f32; CLUSTERS];
    for (c, o) in out.iter_mut().enumerate() {
        if totals[c] > 0 {
            *o = (wins[c] as f32 + 0.5 * ties[c] as f32) / totals[c] as f32;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::parse_cards;
    use crate::iso::street_indexers;
    use crate::strength::river_hs;

    fn hole(s: &str) -> [Card; 2] {
        parse_cards(s).unwrap().try_into().unwrap()
    }

    fn spike(bin: usize) -> [f32; BINS] {
        let mut h = [0.0f32; BINS];
        h[bin] = 1.0;
        h
    }

    #[test]
    fn emd_of_shifted_spikes() {
        let a = spike(0);
        let b = spike(3);
        assert_eq!(emd(&a, &b), 3.0);
        assert_eq!(emd(&a, &a), 0.0);
        assert_eq!(emd(&a, &b), emd(&b, &a));
    }

    #[test]
    fn l2_is_the_squared_distance() {
        assert_eq!(l2(&[1.0, 2.0, 3.0], &[1.0, 0.0, 6.0]), 13.0);
        assert_eq!(l2(&[0.5, 0.5], &[0.5, 0.5]), 0.0);
    }

    #[test]
    fn nearest_prefers_the_lower_index_on_ties() {
        let centroids = [0.0f32, 1.0, 1.0, 0.0, 0.0, 1.0];
        assert_eq!(nearest(Metric::L2, &centroids, 2, &[0.5, 0.5]), 0);
        assert_eq!(nearest(Metric::Emd, &centroids, 2, &[0.0, 1.0]), 0);
        assert_eq!(nearest(Metric::L2, &centroids, 2, &[1.0, 0.0]), 1);
        assert_eq!(nearest(Metric::Emd, &centroids, 2, &[1.0, 0.0]), 1);
    }

    #[test]
    fn bin_edges() {
        assert_eq!(bin_of(0.0), 0);
        assert_eq!(bin_of(1.0), 49);
        assert_eq!(bin_of(0.0199), 0);
        assert_eq!(bin_of(0.02), 1);
    }

    #[test]
    fn histogram_divides_by_the_total() {
        let mut counts = [0u32; BINS];
        counts[1] = 1;
        counts[7] = 3;
        let h = histogram(&counts);
        assert_eq!(h[1], 0.25);
        assert_eq!(h[7], 0.75);
        assert_eq!(h.iter().sum::<f32>(), 1.0);
    }

    #[test]
    fn turn_counts_sum_to_46() {
        let board: [Card; 4] = parse_cards("Jh Th 3c 2d").unwrap().try_into().unwrap();
        let counts = turn_counts(hole("As Kd"), &board, river_hs);
        assert_eq!(counts.iter().sum::<u32>(), 46);
    }

    #[test]
    fn flop_counts_sum_to_1081() {
        let board: [Card; 3] = parse_cards("Jh Th 3c").unwrap().try_into().unwrap();
        let mut calls = 0u32;
        let counts = flop_counts(hole("As Kd"), &board, |h, b| {
            calls += 1;
            river_hs(h, b)
        });
        assert_eq!(counts.iter().sum::<u32>(), 1081);
        assert_eq!(calls, 1081);
    }

    fn turn_profile(h: [Card; 2], board: &[Card; 4]) -> ([f32; BINS], f32) {
        let mut sum = 0.0f32;
        let counts = turn_counts(h, board, |h, b| {
            let hs = river_hs(h, b);
            sum += hs;
            hs
        });
        (histogram(&counts), sum / 46.0)
    }

    #[test]
    fn draw_and_weak_pair_differ() {
        let board: [Card; 4] = parse_cards("Jh Th 3c 2d").unwrap().try_into().unwrap();
        let (draw, draw_mean) = turn_profile(hole("Qh 5h"), &board);
        let (pair, pair_mean) = turn_profile(hole("2c 5s"), &board);
        assert!(
            (draw_mean - pair_mean).abs() < 0.1,
            "{draw_mean} vs {pair_mean}"
        );
        let d = emd(&draw, &pair);
        assert!(d > 5.0, "{d}");
    }

    #[test]
    fn ochs_empty_cluster_is_half() {
        let pre = &street_indexers()[0];
        let board: [Card; 5] = parse_cards("Ah 7d 9h Js Kc").unwrap().try_into().unwrap();
        let mut clusters = [0u8; 169];
        clusters[pre.index(&parse_cards("Ac Ad").unwrap()) as usize] = 7;
        let ochs = ochs_live(hole("As Ad"), &board, &clusters);
        assert_eq!(ochs[7], 0.5);
        assert!(ochs.iter().all(|v| v.is_finite()));
        assert!(ochs[1..7].iter().all(|&v| v == 0.5));
        assert!(ochs[0] > 0.5 && ochs[0] < 1.0);
    }

    #[test]
    fn ochs_matches_river_hs_with_one_cluster() {
        let board: [Card; 5] = parse_cards("2c 7d 9h Js Kc").unwrap().try_into().unwrap();
        let clusters = [3u8; 169];
        for h in ["As Ad", "3c 4d", "Jc Jd", "Ah Qh"] {
            let ochs = ochs_live(hole(h), &board, &clusters);
            assert_eq!(ochs[3].to_bits(), river_hs(hole(h), &board).to_bits());
        }
    }
}
