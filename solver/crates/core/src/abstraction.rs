use crate::cards::Card;
use crate::eval::rank;
use crate::iso::{street_indexers, HandIndexer};
use crate::potential::{histogram, nearest, ochs_live, turn_counts, Metric};
use crate::strategy::{centroid_dimension, StrategyError, StrategyFile};
use crate::strength::{bucket_of, percentile_thresholds, river_hs, turn_value};
use crate::tree::Street;
use std::fmt;
use std::sync::OnceLock;

mod batch;

pub const TABLE_MAGIC: &[u8; 4] = b"MLCB";
pub const TABLE_FORMAT_VERSION: u16 = 1;
pub const TABLE_HEADER_LEN: usize = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableHeader {
    pub street: Street,
    pub buckets: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TableError {
    Truncated,
    BadMagic,
    UnknownVersion(u16),
    BadStreet(u8),
}

impl fmt::Display for TableError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TableError::Truncated => write!(f, "bucket table header is truncated"),
            TableError::BadMagic => {
                write!(
                    f,
                    "not a bucket table (bad magic), rebuild it with `buckets`"
                )
            }
            TableError::UnknownVersion(v) => write!(f, "unknown bucket table format version {v}"),
            TableError::BadStreet(s) => write!(f, "bucket table has an invalid street {s}"),
        }
    }
}

impl std::error::Error for TableError {}

pub fn encode_table(street: Street, buckets: u16, table: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(TABLE_HEADER_LEN + table.len());
    out.extend_from_slice(TABLE_MAGIC);
    out.extend_from_slice(&TABLE_FORMAT_VERSION.to_le_bytes());
    out.push(street.as_index() as u8);
    out.extend_from_slice(&buckets.to_le_bytes());
    out.extend_from_slice(table);
    out
}

pub fn table_header(bytes: &[u8]) -> Result<TableHeader, TableError> {
    if bytes.len() < TABLE_MAGIC.len() {
        return Err(TableError::Truncated);
    }
    if &bytes[..4] != TABLE_MAGIC {
        return Err(TableError::BadMagic);
    }
    if bytes.len() < TABLE_HEADER_LEN {
        return Err(TableError::Truncated);
    }
    let version = u16::from_le_bytes([bytes[4], bytes[5]]);
    if version != TABLE_FORMAT_VERSION {
        return Err(TableError::UnknownVersion(version));
    }
    let street = match Street::from_index(bytes[6]) {
        Some(s) if s != Street::Preflop => s,
        _ => return Err(TableError::BadStreet(bytes[6])),
    };
    Ok(TableHeader {
        street,
        buckets: u16::from_le_bytes([bytes[7], bytes[8]]),
    })
}

pub fn decode_table(mut bytes: Vec<u8>) -> Result<(TableHeader, Vec<u8>), TableError> {
    let header = table_header(&bytes)?;
    bytes.drain(..TABLE_HEADER_LEN);
    Ok((header, bytes))
}

pub(crate) const LIVE_HOLES: usize = 1081;
pub(crate) const LIVE_OPPONENTS: f32 = 990.0;

pub(crate) fn river_indexer() -> &'static HandIndexer {
    static INDEXER: OnceLock<HandIndexer> = OnceLock::new();
    INDEXER.get_or_init(|| HandIndexer::new(&[2, 5]))
}

pub(crate) fn below_and_equal(sorted: &[u16], r: u16) -> (usize, usize) {
    let below = sorted.partition_point(|&x| x < r);
    let at_most = sorted.partition_point(|&x| x <= r);
    (below, at_most - below)
}

pub fn river_strength(board: &[Card; 5]) -> Vec<(u64, f32)> {
    let live: Vec<Card> = (0..52u8).filter(|c| !board.contains(c)).collect();
    let mut seven = [0 as Card; 7];
    seven[2..].copy_from_slice(board);
    let mut holes: Vec<(usize, usize, u16)> = Vec::with_capacity(LIVE_HOLES);
    let mut all: Vec<u16> = Vec::with_capacity(LIVE_HOLES);
    let mut per_card: Vec<Vec<u16>> = vec![Vec::with_capacity(46); live.len()];
    for i in 0..live.len() {
        for j in (i + 1)..live.len() {
            seven[0] = live[i];
            seven[1] = live[j];
            let r = rank(&seven);
            holes.push((i, j, r));
            all.push(r);
            per_card[i].push(r);
            per_card[j].push(r);
        }
    }
    all.sort_unstable();
    for ranks in per_card.iter_mut() {
        ranks.sort_unstable();
    }
    let indexer = river_indexer();
    holes
        .iter()
        .map(|&(i, j, r)| {
            let (all_below, all_equal) = below_and_equal(&all, r);
            let (a_below, a_equal) = below_and_equal(&per_card[i], r);
            let (b_below, b_equal) = below_and_equal(&per_card[j], r);
            let wins = all_below - a_below - b_below;
            let ties = all_equal + 1 - a_equal - b_equal;
            seven[0] = live[i];
            seven[1] = live[j];
            let hs = (wins as f32 + 0.5 * ties as f32) / LIVE_OPPONENTS;
            (indexer.index(&seven), hs)
        })
        .collect()
}

pub fn percentile_buckets(values: &[f32], buckets: u16) -> Vec<u8> {
    let thresholds = percentile_thresholds(values, buckets);
    values
        .iter()
        .map(|&v| bucket_of(&thresholds, v) as u8)
        .collect()
}

pub fn aggregate_hs2(indexers: &[HandIndexer; 4], street: Street, index: u64, next: &[f32]) -> f32 {
    let (round, target) = match street {
        Street::Turn => (2, 3),
        Street::Flop => (1, 2),
        _ => panic!("aggregate_hs2 needs flop or turn"),
    };
    let cards = indexers[round].unindex(1, index);
    aggregate_squares(cards, |c| next[indexers[target].index(c) as usize])
}

pub(crate) fn aggregate_squares(
    mut cards: Vec<Card>,
    mut value: impl FnMut(&[Card]) -> f32,
) -> f32 {
    let mut dead = 0u64;
    for &c in &cards {
        dead |= 1 << c;
    }
    cards.push(0);
    let last = cards.len() - 1;
    let mut sum = 0.0f32;
    let mut live = 0u32;
    for c in 0..52u8 {
        if dead & (1 << c) != 0 {
            continue;
        }
        cards[last] = c;
        let v = value(&cards);
        sum += v * v;
        live += 1;
    }
    sum / live as f32
}

#[derive(Debug, Clone, PartialEq)]
pub enum BucketSource {
    Table(Vec<u8>),
    Thresholds(Vec<f32>),
    Centroids {
        centroids: Vec<f32>,
        dimension: usize,
        clusters: [u8; 169],
    },
}

pub struct Abstraction {
    indexers: [HandIndexer; 4],
    sources: [BucketSource; 3],
}

const POSTFLOP: [Street; 3] = [Street::Flop, Street::Turn, Street::River];

impl Abstraction {
    pub fn new(tables: [Vec<u8>; 3]) -> Abstraction {
        Abstraction::with_sources(tables.map(BucketSource::Table))
    }

    pub fn with_sources(sources: [BucketSource; 3]) -> Abstraction {
        Abstraction {
            indexers: street_indexers(),
            sources,
        }
    }

    pub fn from_strategy(file: &StrategyFile) -> Result<Abstraction, StrategyError> {
        let mut sources: [BucketSource; 3] = Default::default();
        let mut next = file.tables.iter();
        for (slot, street) in sources.iter_mut().zip(POSTFLOP) {
            if !file.includes(street) {
                return Err(StrategyError::MissingStreet(street));
            }
            *slot = match (file.centroids_of(street), file.thresholds_of(street)) {
                (Some(c), _) => centroid_source(file, street, c)?,
                (None, Some(t)) if street != Street::Flop => BucketSource::Thresholds(t.to_vec()),
                (None, Some(_)) => return Err(StrategyError::MissingStreet(street)),
                (None, None) => BucketSource::Table(
                    next.next()
                        .ok_or(StrategyError::MissingStreet(street))?
                        .clone(),
                ),
            };
        }
        if next.next().is_some() {
            return Err(StrategyError::Inconsistent);
        }
        let abstraction = Abstraction::with_sources(sources);
        let buckets = file.tree.buckets();
        if u64::from(buckets[0]) < abstraction.class_count(Street::Preflop) {
            return Err(StrategyError::BucketOutOfRange(Street::Preflop));
        }
        for street in POSTFLOP {
            let BucketSource::Table(table) = &abstraction.sources[street.as_index() - 1] else {
                continue;
            };
            if table.len() as u64 != abstraction.class_count(street) {
                return Err(StrategyError::Inconsistent);
            }
            let limit = buckets[street.as_index()];
            if table.iter().any(|&b| u16::from(b) >= limit) {
                return Err(StrategyError::BucketOutOfRange(street));
            }
        }
        Ok(abstraction)
    }

    pub fn bucket(&self, street: Street, hole: [Card; 2], board: &[Card]) -> u16 {
        let s = street.as_index();
        let mut cards = [0 as Card; 7];
        cards[..2].copy_from_slice(&hole);
        cards[2..2 + board.len()].copy_from_slice(board);
        if s == 0 {
            return self.indexers[0].index(&cards[..2]) as u16;
        }
        match &self.sources[s - 1] {
            BucketSource::Table(table) => {
                let index = self.indexers[s].index(&cards[..2 + board.len()]);
                u16::from(table[index as usize])
            }
            BucketSource::Thresholds(t) => bucket_of(t, live_value(street, hole, board)),
            BucketSource::Centroids {
                centroids,
                dimension,
                clusters,
            } => nearest_centroid(street, hole, board, centroids, *dimension, clusters),
        }
    }

    pub fn class_count(&self, street: Street) -> u64 {
        self.indexers[street.as_index()].size(usize::from(street != Street::Preflop))
    }

    pub fn table_bytes(&self, street: Street) -> &[u8] {
        match &self.sources[street.as_index() - 1] {
            BucketSource::Table(table) => table,
            _ => panic!("the {street:?} is bucketed live, it has no table"),
        }
    }
}

impl Default for BucketSource {
    fn default() -> BucketSource {
        BucketSource::Table(Vec::new())
    }
}

fn centroid_source(
    file: &StrategyFile,
    street: Street,
    centroids: &[f32],
) -> Result<BucketSource, StrategyError> {
    let dimension = centroid_dimension(street).ok_or(StrategyError::MissingStreet(street))?;
    let buckets = usize::from(file.tree.buckets()[street.as_index()]);
    if centroids.len() != buckets * dimension {
        return Err(StrategyError::Inconsistent);
    }
    let clusters = match (street, file.clusters) {
        (_, Some(clusters)) => clusters,
        (Street::River, None) => return Err(StrategyError::Inconsistent),
        (_, None) => [0; 169],
    };
    Ok(BucketSource::Centroids {
        centroids: centroids.to_vec(),
        dimension,
        clusters,
    })
}

fn nearest_centroid(
    street: Street,
    hole: [Card; 2],
    board: &[Card],
    centroids: &[f32],
    dimension: usize,
    clusters: &[u8; 169],
) -> u16 {
    match street {
        Street::Turn => {
            let board: &[Card; 4] = board.try_into().expect("four board cards");
            let feature = histogram(&turn_counts(hole, board, river_hs));
            nearest(Metric::Emd, centroids, dimension, &feature)
        }
        Street::River => {
            let board: &[Card; 5] = board.try_into().expect("five board cards");
            let feature = ochs_live(hole, board, clusters);
            nearest(Metric::L2, centroids, dimension, &feature)
        }
        _ => panic!("no centroids on the {street:?}"),
    }
}

fn live_value(street: Street, hole: [Card; 2], board: &[Card]) -> f32 {
    match street {
        Street::Turn => turn_value(hole, board.try_into().expect("four board cards")),
        Street::River => river_hs(hole, board.try_into().expect("five board cards")),
        _ => panic!("no live value for the {street:?}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::parse_cards;
    use crate::iso::board_indexer;
    use crate::pairs::{pair_cards, PAIRS};
    use crate::potential::{BINS, CLUSTERS};
    use crate::rng::Rng;
    use std::collections::HashMap;

    fn river_indexer() -> HandIndexer {
        HandIndexer::new(&[2, 5])
    }

    fn deal(rng: &mut Rng, n: usize) -> Vec<Card> {
        let mut deck: Vec<Card> = (0..52).collect();
        rng.shuffle(&mut deck);
        deck.truncate(n);
        deck
    }

    fn brute_force(hole: [Card; 2], board: &[Card; 5]) -> f32 {
        let mut mine = hole.to_vec();
        mine.extend_from_slice(board);
        let my_rank = rank(&mine);
        let dead: Vec<Card> = mine.clone();
        let live: Vec<Card> = (0..52u8).filter(|c| !dead.contains(c)).collect();
        let mut score = 0.0f32;
        let mut total = 0.0f32;
        for i in 0..live.len() {
            for j in (i + 1)..live.len() {
                let mut theirs = vec![live[i], live[j]];
                theirs.extend_from_slice(board);
                let r = rank(&theirs);
                total += 1.0;
                if my_rank > r {
                    score += 1.0;
                } else if my_rank == r {
                    score += 0.5;
                }
            }
        }
        score / total
    }

    #[test]
    fn table_round_trips_with_its_header() {
        let bytes = encode_table(Street::Turn, 256, &[3, 1, 255]);
        assert_eq!(&bytes[..4], b"MLCB");
        assert_eq!(bytes.len(), TABLE_HEADER_LEN + 3);
        let (header, table) = decode_table(bytes).unwrap();
        assert_eq!(
            header,
            TableHeader {
                street: Street::Turn,
                buckets: 256
            }
        );
        assert_eq!(table, vec![3, 1, 255]);
    }

    #[test]
    fn bad_table_headers_are_errors() {
        let good = encode_table(Street::Flop, 8, &[0]);
        assert_eq!(table_header(&good[..3]), Err(TableError::Truncated));
        assert_eq!(table_header(&good[..8]), Err(TableError::Truncated));
        assert_eq!(table_header(&[0u8; 100]), Err(TableError::BadMagic));
        let mut b = good.clone();
        b[4] = 7;
        assert_eq!(table_header(&b), Err(TableError::UnknownVersion(7)));
        let mut b = good.clone();
        b[6] = 0;
        assert_eq!(table_header(&b), Err(TableError::BadStreet(0)));
        b[6] = 4;
        assert_eq!(table_header(&b), Err(TableError::BadStreet(4)));
    }

    #[test]
    fn river_strength_matches_brute_force() {
        let indexer = river_indexer();
        let mut rng = Rng::new(41);
        for _ in 0..200 {
            let cards = deal(&mut rng, 7);
            let board: [Card; 5] = cards[2..7].try_into().unwrap();
            let strengths = river_strength(&board);
            assert_eq!(strengths.len(), 1081);
            let by_index: HashMap<u64, Vec<f32>> =
                strengths.iter().fold(HashMap::new(), |mut m, &(i, hs)| {
                    m.entry(i).or_default().push(hs);
                    m
                });
            let live: Vec<Card> = (0..52u8).filter(|c| !board.contains(c)).collect();
            for _ in 0..5 {
                let a = live[rng.below(47) as usize];
                let mut b = live[rng.below(47) as usize];
                while b == a {
                    b = live[rng.below(47) as usize];
                }
                let mut all = vec![a, b];
                all.extend_from_slice(&board);
                let idx = indexer.index(&all);
                let expected = brute_force([a, b], &board);
                for &hs in &by_index[&idx] {
                    assert!((hs - expected).abs() < 1e-6, "{hs} vs {expected}");
                }
            }
        }
    }

    #[test]
    fn river_strength_orders_aces_above_trash() {
        let indexer = river_indexer();
        let board: [Card; 5] = parse_cards("2c 7d 9h Js Kc").unwrap().try_into().unwrap();
        let strengths: HashMap<u64, f32> = river_strength(&board).into_iter().collect();
        let mut aces = parse_cards("As Ad").unwrap();
        aces.extend_from_slice(&board);
        let mut trash = parse_cards("3c 4d").unwrap();
        trash.extend_from_slice(&board);
        let a = strengths[&indexer.index(&aces)];
        let t = strengths[&indexer.index(&trash)];
        assert!(a > t, "{a} vs {t}");
    }

    #[test]
    fn percentile_buckets_split_evenly() {
        let values: Vec<f32> = (0..1000).map(|v| v as f32).collect();
        let buckets = percentile_buckets(&values, 8);
        let mut counts = [0usize; 8];
        for &b in &buckets {
            counts[b as usize] += 1;
        }
        assert_eq!(counts, [125; 8]);
        assert!(buckets.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn percentile_buckets_never_split_ties() {
        let mut rng = Rng::new(5);
        let values: Vec<f32> = (0..5000).map(|_| rng.below(37) as f32).collect();
        let buckets = percentile_buckets(&values, 8);
        let mut seen: HashMap<u32, u8> = HashMap::new();
        for (&v, &b) in values.iter().zip(&buckets) {
            assert_eq!(*seen.entry(v as u32).or_insert(b), b);
        }
        for (&v, &b) in values.iter().zip(&buckets) {
            for (&w, &c) in values.iter().zip(&buckets).take(200) {
                if v < w {
                    assert!(b <= c);
                }
            }
        }
    }

    #[test]
    fn percentile_buckets_cover_the_range() {
        let values: Vec<f32> = (0..1000).map(|v| (v * 7 % 1000) as f32).collect();
        let buckets = percentile_buckets(&values, 128);
        assert_eq!(*buckets.iter().max().unwrap(), 127);
        assert_eq!(*buckets.iter().min().unwrap(), 0);
    }

    #[test]
    fn bucket_is_suit_isomorphic() {
        let indexers = street_indexers();
        let sizes: Vec<usize> = (1..4).map(|s| indexers[s].size(1) as usize).collect();
        let tables = [
            (0..sizes[0]).map(|i| (i % 251) as u8).collect(),
            (0..sizes[1]).map(|i| (i % 241) as u8).collect(),
            (0..sizes[2]).map(|i| (i % 239) as u8).collect(),
        ];
        let abstraction = Abstraction::new(tables);
        let mut rng = Rng::new(77);
        for _ in 0..2000 {
            let cards = deal(&mut rng, 7);
            let mut perm = [0u8, 1, 2, 3];
            rng.shuffle(&mut perm);
            let mapped: Vec<Card> = cards
                .iter()
                .map(|&c| (c / 4) * 4 + perm[(c % 4) as usize])
                .collect();
            for (street, n) in [
                (Street::Preflop, 2usize),
                (Street::Flop, 5),
                (Street::Turn, 6),
                (Street::River, 7),
            ] {
                let a = abstraction.bucket(street, [cards[0], cards[1]], &cards[2..n]);
                let b = abstraction.bucket(street, [mapped[0], mapped[1]], &mapped[2..n]);
                assert_eq!(a, b);
            }
        }
    }

    #[test]
    fn class_counts_match_table_sizes() {
        let abstraction = Abstraction::new([vec![], vec![], vec![]]);
        assert_eq!(abstraction.class_count(Street::Preflop), 169);
        assert_eq!(abstraction.class_count(Street::Flop), 1_286_792);
        assert_eq!(abstraction.class_count(Street::Turn), 13_960_050);
        assert_eq!(abstraction.class_count(Street::River), 123_156_254);
    }

    #[test]
    fn preflop_bucket_is_the_class_index() {
        let abstraction = Abstraction::new([vec![], vec![], vec![]]);
        let pair = abstraction.bucket(Street::Preflop, [0, 1], &[]);
        let other = abstraction.bucket(Street::Preflop, [0, 5], &[]);
        assert!(pair < 169 && other < 169);
        assert_ne!(pair, other);
    }

    #[test]
    fn aggregate_hs2_averages_squares_over_live_rivers() {
        let indexers = street_indexers();
        let mut next = vec![0.0f32; indexers[3].size(1) as usize];
        let turn_index = 4_000_000u64;
        let cards = indexers[2].unindex(1, turn_index);
        let mut expected = 0.0f32;
        let mut live = 0;
        for c in 0..52u8 {
            if cards.contains(&c) {
                continue;
            }
            let mut seven = cards.clone();
            seven.push(c);
            let idx = indexers[3].index(&seven) as usize;
            next[idx] = 0.1 + 0.01 * live as f32;
            live += 1;
        }
        assert_eq!(live, 46);
        for c in 0..52u8 {
            if cards.contains(&c) {
                continue;
            }
            let mut seven = cards.clone();
            seven.push(c);
            let v = next[indexers[3].index(&seven) as usize];
            expected += v * v;
        }
        expected /= 46.0;
        let got = aggregate_hs2(&indexers, Street::Turn, turn_index, &next);
        assert!((got - expected).abs() < 1e-6, "{got} vs {expected}");
    }

    fn turn_centroids() -> Vec<f32> {
        let mut out = Vec::new();
        for peak in [3usize, 15, 30, 45] {
            let mut h = [0.0f32; BINS];
            h[peak] = 0.6;
            h[(peak + 4).min(BINS - 1)] += 0.4;
            out.extend_from_slice(&h);
        }
        out
    }

    fn river_centroids() -> Vec<f32> {
        (0..5)
            .flat_map(|k| (0..CLUSTERS).map(move |c| ((k * 3 + c * 7) % 11) as f32 / 10.0))
            .collect()
    }

    fn opponent_clusters() -> [u8; 169] {
        std::array::from_fn(|i| (i * 3 % CLUSTERS) as u8)
    }

    fn centroid_abstraction() -> Abstraction {
        Abstraction::with_sources([
            BucketSource::Table(Vec::new()),
            BucketSource::Centroids {
                centroids: turn_centroids(),
                dimension: BINS,
                clusters: opponent_clusters(),
            },
            BucketSource::Centroids {
                centroids: river_centroids(),
                dimension: CLUSTERS,
                clusters: opponent_clusters(),
            },
        ])
    }

    #[test]
    fn centroid_source_matches_nearest_of_live_feature() {
        let abstraction = centroid_abstraction();
        let mut rng = Rng::new(808);
        let mut turn_seen = std::collections::HashSet::new();
        let mut river_seen = std::collections::HashSet::new();
        for _ in 0..40 {
            let cards = deal(&mut rng, 7);
            let hole = [cards[0], cards[1]];
            let turn: [Card; 4] = cards[2..6].try_into().unwrap();
            let river: [Card; 5] = cards[2..7].try_into().unwrap();
            let feature = histogram(&turn_counts(hole, &turn, river_hs));
            let expected = nearest(Metric::Emd, &turn_centroids(), BINS, &feature);
            let got = abstraction.bucket(Street::Turn, hole, &turn);
            assert_eq!(got, expected);
            turn_seen.insert(got);
            let feature = ochs_live(hole, &river, &opponent_clusters());
            let expected = nearest(Metric::L2, &river_centroids(), CLUSTERS, &feature);
            let got = abstraction.bucket(Street::River, hole, &river);
            assert_eq!(got, expected);
            river_seen.insert(got);
        }
        assert!(turn_seen.len() > 1, "{turn_seen:?}");
        assert!(river_seen.len() > 1, "{river_seen:?}");
    }

    fn tiny_file() -> StrategyFile {
        use crate::preset::Preset;
        use crate::strategy::StrategyHeader;
        use crate::tree::Tree;
        let preset = Preset::from_toml(include_str!("../../../presets/tiny.toml")).unwrap();
        let header = StrategyHeader {
            fingerprint: [0; 32],
            small_blind: preset.small_blind,
            big_blind: preset.big_blind,
            stack: preset.stack,
            streets: 0b1111,
            iterations: 0,
            checkpoint: 0,
        };
        let flop = (0..1_286_792).map(|i| (i % 8) as u8).collect();
        StrategyFile::new(header, Tree::build(&preset), vec![flop], Vec::new())
    }

    fn eight(centroids: &[f32], dimension: usize) -> Vec<f32> {
        centroids
            .iter()
            .cycle()
            .take(8 * dimension)
            .copied()
            .collect()
    }

    #[test]
    fn from_strategy_accepts_centroids_on_turn_and_river() {
        let turn = eight(&turn_centroids(), BINS);
        let river = eight(&river_centroids(), CLUSTERS);
        let file = tiny_file().with_centroids(
            vec![(Street::Turn, turn.clone()), (Street::River, river.clone())],
            opponent_clusters(),
        );
        let abstraction = Abstraction::from_strategy(&file).unwrap();
        let expected = Abstraction::with_sources([
            BucketSource::Table(Vec::new()),
            BucketSource::Centroids {
                centroids: turn,
                dimension: BINS,
                clusters: opponent_clusters(),
            },
            BucketSource::Centroids {
                centroids: river,
                dimension: CLUSTERS,
                clusters: opponent_clusters(),
            },
        ]);
        assert_eq!(abstraction.sources[1], expected.sources[1]);
        assert_eq!(abstraction.sources[2], expected.sources[2]);
        let mut rng = Rng::new(9);
        for _ in 0..10 {
            let cards = deal(&mut rng, 7);
            let hole = [cards[0], cards[1]];
            assert_eq!(
                abstraction.bucket(Street::River, hole, &cards[2..7]),
                expected.bucket(Street::River, hole, &cards[2..7])
            );
        }
    }

    #[test]
    fn from_strategy_refuses_flop_centroids() {
        let file = tiny_file().with_centroids(
            vec![(Street::Flop, eight(&turn_centroids(), BINS))],
            opponent_clusters(),
        );
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::MissingStreet(Street::Flop))
        );
    }

    #[test]
    fn from_strategy_refuses_centroids_of_the_wrong_size() {
        let file = tiny_file().with_centroids(
            vec![
                (Street::Turn, eight(&turn_centroids(), BINS)),
                (Street::River, river_centroids()),
            ],
            opponent_clusters(),
        );
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn from_strategy_needs_the_cluster_map_for_river_centroids() {
        let mut file = tiny_file().with_centroids(
            vec![
                (Street::Turn, eight(&turn_centroids(), BINS)),
                (Street::River, eight(&river_centroids(), CLUSTERS)),
            ],
            opponent_clusters(),
        );
        file.clusters = None;
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    #[ignore]
    fn river_buckets_are_monotone_in_strength_on_tiny() {
        let boards = board_indexer(5);
        let river = river_indexer();
        let mut hs = vec![f32::NAN; river.size(1) as usize];
        for b in 0..boards.size(0) {
            let cards = boards.unindex(0, b);
            let board: [Card; 5] = cards.try_into().unwrap();
            for (i, v) in river_strength(&board) {
                hs[i as usize] = v;
            }
        }
        assert!(hs.iter().all(|v| !v.is_nan()));
        let buckets = percentile_buckets(&hs, 8);
        let abstraction = Abstraction::new([vec![], vec![], buckets]);
        let mut rng = Rng::new(99);
        for _ in 0..50_000 {
            let i = rng.next_u64() % river.size(1);
            let j = rng.next_u64() % river.size(1);
            let (ci, cj) = (river.unindex(1, i), river.unindex(1, j));
            let bi = abstraction.bucket(Street::River, [ci[0], ci[1]], &ci[2..]);
            let bj = abstraction.bucket(Street::River, [cj[0], cj[1]], &cj[2..]);
            if hs[i as usize] > hs[j as usize] {
                assert!(bi >= bj);
            } else if hs[i as usize] < hs[j as usize] {
                assert!(bi <= bj);
            }
        }
    }

    fn threshold_abstraction() -> Abstraction {
        let t: Vec<f32> = (1..8).map(|i| i as f32 / 8.0).collect();
        let flop = (0..1_286_792u32).map(|i| (i % 8) as u8).collect();
        Abstraction::with_sources([
            BucketSource::Table(flop),
            BucketSource::Thresholds(t.clone()),
            BucketSource::Thresholds(t),
        ])
    }

    const BATCH_BOARDS: [&str; 3] = ["2c 7d Kh 4s 9c", "5s 9s Jd Qs 2h", "8c 8h 3d Ac 3s"];

    fn assert_batch_matches(
        abstraction: &Abstraction,
        street: Street,
        board: &[Card],
        step: usize,
    ) {
        let all = abstraction.buckets(street, board);
        assert_eq!(all.len(), PAIRS);
        for (i, &got) in all.iter().enumerate() {
            let hole = pair_cards(i);
            if board.contains(&hole[0]) || board.contains(&hole[1]) {
                assert_eq!(got, u16::MAX, "{street:?} {hole:?}");
            } else if i % step == 0 {
                assert_eq!(
                    got,
                    abstraction.bucket(street, hole, board),
                    "{street:?} {hole:?}"
                );
            }
        }
    }

    #[test]
    fn batched_buckets_equal_per_pair_buckets() {
        let thresholds = threshold_abstraction();
        let centroids = centroid_abstraction();
        assert_batch_matches(&thresholds, Street::Preflop, &[], 1);
        for text in BATCH_BOARDS {
            let board = parse_cards(text).unwrap();
            assert_batch_matches(&thresholds, Street::Flop, &board[..3], 1);
            assert_batch_matches(&thresholds, Street::River, &board, 1);
            assert_batch_matches(&centroids, Street::River, &board, 1);
            assert_batch_matches(&thresholds, Street::Turn, &board[..4], 37);
            assert_batch_matches(&centroids, Street::Turn, &board[..4], 37);
        }
    }

    #[test]
    #[ignore]
    fn batched_turn_buckets_equal_per_pair_buckets_on_every_pair() {
        for text in BATCH_BOARDS {
            let board = parse_cards(text).unwrap();
            assert_batch_matches(&threshold_abstraction(), Street::Turn, &board[..4], 1);
            assert_batch_matches(&centroid_abstraction(), Street::Turn, &board[..4], 1);
        }
    }

    #[test]
    #[ignore]
    fn batched_river_and_turn_are_fast() {
        let centroids = centroid_abstraction();
        let thresholds = threshold_abstraction();
        let board = parse_cards(BATCH_BOARDS[0]).unwrap();
        for (abstraction, street, cards) in [
            (&centroids, Street::Turn, &board[..4]),
            (&centroids, Street::River, &board[..]),
            (&thresholds, Street::Turn, &board[..4]),
            (&thresholds, Street::River, &board[..]),
        ] {
            let start = std::time::Instant::now();
            abstraction.buckets(street, cards);
            let ms = start.elapsed().as_millis();
            assert!(ms < 150, "{street:?} took {ms} ms");
        }
    }
}
