use crate::bytes::{u16_len, u32_len, ByteReader, Truncated};
use crate::iso::street_indexer;
use crate::potential::{BINS, CLUSTERS};
use crate::tree::{Node, NodeId, Street, Tree};
use std::fmt;

pub const MAGIC: &[u8; 4] = b"MLCS";
pub const FORMAT_VERSION: u16 = 1;
pub const PLAY_FORMAT_VERSION: u16 = 2;
pub const CENTROID_FORMAT_VERSION: u16 = 3;
const KIND_TABLE: u8 = 0;
const KIND_THRESHOLDS: u8 = 1;
const KIND_CENTROIDS: u8 = 2;
const CLUSTER_MAP_LEN: usize = 169;

pub fn centroid_dimension(street: Street) -> Option<usize> {
    match street {
        Street::Turn => Some(BINS),
        Street::River => Some(CLUSTERS),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrategyError {
    BadMagic,
    UnknownVersion(u16),
    Truncated,
    Inconsistent,
    MissingStreet(Street),
    BucketOutOfRange(Street),
}

impl fmt::Display for StrategyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StrategyError::BadMagic => write!(f, "not a strategy file (bad magic)"),
            StrategyError::UnknownVersion(v) => write!(f, "unknown strategy format version {v}"),
            StrategyError::Truncated => write!(f, "strategy file is truncated"),
            StrategyError::Inconsistent => write!(f, "strategy file is inconsistent"),
            StrategyError::MissingStreet(street) => {
                write!(f, "strategy file has no table for the {street:?}")
            }
            StrategyError::BucketOutOfRange(street) => {
                write!(
                    f,
                    "strategy file has a {street:?} bucket beyond the tree's count"
                )
            }
        }
    }
}

impl std::error::Error for StrategyError {}

impl From<Truncated> for StrategyError {
    fn from(_: Truncated) -> StrategyError {
        StrategyError::Truncated
    }
}

pub fn quantize(probabilities: &[f32]) -> Vec<u8> {
    let n = probabilities.len();
    let total: f64 = probabilities.iter().map(|&p| f64::from(p.max(0.0))).sum();
    let scaled: Vec<f64> = if total > 0.0 {
        probabilities
            .iter()
            .map(|&p| f64::from(p.max(0.0)) / total * 255.0)
            .collect()
    } else {
        vec![255.0 / n as f64; n]
    };
    let mut out: Vec<u32> = scaled.iter().map(|&x| x.floor() as u32).collect();
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        let fa = scaled[a] - scaled[a].floor();
        let fb = scaled[b] - scaled[b].floor();
        fb.total_cmp(&fa).then(a.cmp(&b))
    });
    let mut sum: u32 = out.iter().sum();
    let mut turn = 0;
    while sum < 255 {
        out[order[turn % n]] += 1;
        sum += 1;
        turn += 1;
    }
    while sum > 255 {
        let largest = (0..n).max_by_key(|&i| out[i]).expect("not empty");
        out[largest] -= 1;
        sum -= 1;
    }
    out.into_iter().map(|x| x as u8).collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct StrategyFile {
    pub fingerprint: [u8; 32],
    pub small_blind: u32,
    pub big_blind: u32,
    pub stack: u32,
    pub streets: u8,
    pub iterations: u64,
    pub checkpoint: u32,
    pub tree: Tree,
    pub tables: Vec<Vec<u8>>,
    pub thresholds: Vec<(Street, Vec<f32>)>,
    pub centroids: Vec<(Street, Vec<f32>)>,
    pub clusters: Option<[u8; CLUSTER_MAP_LEN]>,
    pub probabilities: Vec<u8>,
    offsets: Vec<u64>,
}

const POSTFLOP: [Street; 3] = [Street::Flop, Street::Turn, Street::River];
const KNOWN_STREETS: u8 = 0b1111;

fn included(streets: u8, street: Street) -> bool {
    streets & (1 << street.as_index()) != 0
}

fn offsets_for(tree: &Tree, streets: u8) -> (Vec<u64>, u64) {
    let buckets = tree.buckets();
    let mut offsets = Vec::with_capacity(tree.nodes().len());
    let mut next = 0u64;
    for node in tree.nodes() {
        offsets.push(next);
        if let Node::Decision {
            street, actions, ..
        } = node
        {
            if included(streets, *street) {
                next += u64::from(buckets[street.as_index()]) * actions.len() as u64;
            }
        }
    }
    (offsets, next)
}

#[derive(Default)]
struct Buckets {
    tables: Vec<Vec<u8>>,
    thresholds: Vec<(Street, Vec<f32>)>,
    centroids: Vec<(Street, Vec<f32>)>,
    clusters: Option<[u8; CLUSTER_MAP_LEN]>,
}

fn read_f32s(t: &mut ByteReader<'_>, count: usize) -> Result<Vec<f32>, StrategyError> {
    let values = t.f32s(count).map_err(|_| StrategyError::Inconsistent)?;
    if values.iter().any(|v| !v.is_finite()) {
        return Err(StrategyError::Inconsistent);
    }
    Ok(values)
}

fn read_centroids(
    t: &mut ByteReader<'_>,
    street: Street,
    expected: u16,
) -> Result<Vec<f32>, StrategyError> {
    let dimension = centroid_dimension(street).ok_or(StrategyError::Inconsistent)?;
    let count = t.u16().map_err(|_| StrategyError::Inconsistent)?;
    let stored = t.u16().map_err(|_| StrategyError::Inconsistent)?;
    if count != expected || usize::from(stored) != dimension {
        return Err(StrategyError::Inconsistent);
    }
    read_f32s(t, usize::from(count) * dimension)
}

fn read_clusters(t: &mut ByteReader<'_>) -> Result<[u8; CLUSTER_MAP_LEN], StrategyError> {
    let bytes = t
        .take(CLUSTER_MAP_LEN)
        .map_err(|_| StrategyError::Inconsistent)?;
    if bytes.iter().any(|&c| usize::from(c) >= CLUSTERS) {
        return Err(StrategyError::Inconsistent);
    }
    Ok(bytes.try_into().expect("169 bytes"))
}

fn read_table(t: &mut ByteReader<'_>, street: Street) -> Result<Vec<u8>, StrategyError> {
    let table = t.prefixed().map_err(|_| StrategyError::Inconsistent)?;
    if table.len() as u64 != street_indexer(street).size(1) {
        return Err(StrategyError::Inconsistent);
    }
    Ok(table.to_vec())
}

fn read_thresholds(t: &mut ByteReader<'_>, expected: u16) -> Result<Vec<f32>, StrategyError> {
    let count = t.u16().map_err(|_| StrategyError::Inconsistent)?;
    if count != expected.saturating_sub(1) {
        return Err(StrategyError::Inconsistent);
    }
    let values = read_f32s(t, usize::from(count))?;
    if !values.windows(2).all(|w| w[0] <= w[1]) {
        return Err(StrategyError::Inconsistent);
    }
    Ok(values)
}

fn read_buckets(
    section: &[u8],
    tree: &Tree,
    streets: u8,
    version: u16,
) -> Result<Buckets, StrategyError> {
    let mut out = Buckets::default();
    let mut t = ByteReader::new(section);
    for street in POSTFLOP.into_iter().filter(|&s| included(streets, s)) {
        let kind = if version == FORMAT_VERSION {
            KIND_TABLE
        } else {
            t.u8().map_err(|_| StrategyError::Inconsistent)?
        };
        let expected = tree.buckets()[street.as_index()];
        match kind {
            KIND_TABLE => out.tables.push(read_table(&mut t, street)?),
            KIND_THRESHOLDS => out
                .thresholds
                .push((street, read_thresholds(&mut t, expected)?)),
            KIND_CENTROIDS if version == CENTROID_FORMAT_VERSION => {
                out.centroids
                    .push((street, read_centroids(&mut t, street, expected)?));
                if street == Street::River {
                    out.clusters = Some(read_clusters(&mut t)?);
                }
            }
            _ => return Err(StrategyError::Inconsistent),
        }
    }
    let centroids_match_version = out.centroids.is_empty() != (version == CENTROID_FORMAT_VERSION);
    if !t.is_done() || !centroids_match_version {
        return Err(StrategyError::Inconsistent);
    }
    Ok(out)
}

impl StrategyFile {
    pub fn new(
        header: StrategyHeader,
        tree: Tree,
        tables: Vec<Vec<u8>>,
        probabilities: Vec<u8>,
    ) -> StrategyFile {
        let (offsets, _) = offsets_for(&tree, header.streets);
        StrategyFile {
            fingerprint: header.fingerprint,
            small_blind: header.small_blind,
            big_blind: header.big_blind,
            stack: header.stack,
            streets: header.streets,
            iterations: header.iterations,
            checkpoint: header.checkpoint,
            tree,
            tables,
            thresholds: Vec::new(),
            centroids: Vec::new(),
            clusters: None,
            probabilities,
            offsets,
        }
    }

    pub fn with_centroids(
        mut self,
        centroids: Vec<(Street, Vec<f32>)>,
        clusters: [u8; CLUSTER_MAP_LEN],
    ) -> StrategyFile {
        self.centroids = centroids;
        self.clusters = Some(clusters);
        self
    }

    pub fn centroids_of(&self, street: Street) -> Option<&[f32]> {
        self.centroids
            .iter()
            .find(|(s, _)| *s == street)
            .map(|(_, c)| &c[..])
    }

    pub fn with_thresholds(mut self, thresholds: Vec<(Street, Vec<f32>)>) -> StrategyFile {
        self.thresholds = thresholds;
        self
    }

    pub fn thresholds_of(&self, street: Street) -> Option<&[f32]> {
        self.thresholds
            .iter()
            .find(|(s, _)| *s == street)
            .map(|(_, t)| &t[..])
    }

    fn bucket_section(&self) -> Vec<u8> {
        let mut out = Vec::new();
        if self.thresholds.is_empty() && self.centroids.is_empty() {
            for table in &self.tables {
                out.extend_from_slice(&u32_len(table.len()));
                out.extend_from_slice(table);
            }
            return out;
        }
        let mut tables = self.tables.iter();
        for street in POSTFLOP.into_iter().filter(|&s| self.includes(s)) {
            if let Some(c) = self.centroids_of(street) {
                self.write_centroids(&mut out, street, c);
            } else if let Some(t) = self.thresholds_of(street) {
                out.push(KIND_THRESHOLDS);
                out.extend_from_slice(&u16_len(t.len()));
                for v in t {
                    out.extend_from_slice(&v.to_le_bytes());
                }
            } else if let Some(table) = tables.next() {
                out.push(KIND_TABLE);
                out.extend_from_slice(&u32_len(table.len()));
                out.extend_from_slice(table);
            }
        }
        out
    }

    fn write_centroids(&self, out: &mut Vec<u8>, street: Street, centroids: &[f32]) {
        let dimension = centroid_dimension(street).unwrap_or(BINS);
        out.push(KIND_CENTROIDS);
        out.extend_from_slice(&u16_len(centroids.len() / dimension));
        out.extend_from_slice(&u16_len(dimension));
        for v in centroids {
            out.extend_from_slice(&v.to_le_bytes());
        }
        if street == Street::River {
            if let Some(clusters) = &self.clusters {
                out.extend_from_slice(clusters);
            }
        }
    }

    pub fn includes(&self, street: Street) -> bool {
        included(self.streets, street)
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let tree = self.tree.serialize();
        let mut out = Vec::with_capacity(
            128 + tree.len()
                + self.tables.iter().map(Vec::len).sum::<usize>()
                + self.probabilities.len(),
        );
        let version = if !self.centroids.is_empty() {
            CENTROID_FORMAT_VERSION
        } else if !self.thresholds.is_empty() {
            PLAY_FORMAT_VERSION
        } else {
            FORMAT_VERSION
        };
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&version.to_le_bytes());
        out.extend_from_slice(&self.fingerprint);
        out.extend_from_slice(&self.small_blind.to_le_bytes());
        out.extend_from_slice(&self.big_blind.to_le_bytes());
        out.extend_from_slice(&self.stack.to_le_bytes());
        out.push(self.streets);
        out.extend_from_slice(&self.iterations.to_le_bytes());
        out.extend_from_slice(&self.checkpoint.to_le_bytes());
        out.extend_from_slice(&u32_len(tree.len()));
        out.extend_from_slice(&tree);
        let section = self.bucket_section();
        out.extend_from_slice(&u32_len(section.len()));
        out.extend_from_slice(&section);
        out.extend_from_slice(&self.probabilities);
        out
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<StrategyFile, StrategyError> {
        let mut c = ByteReader::new(bytes);
        if c.take(4)? != MAGIC {
            return Err(StrategyError::BadMagic);
        }
        let version = c.u16()?;
        if !(FORMAT_VERSION..=CENTROID_FORMAT_VERSION).contains(&version) {
            return Err(StrategyError::UnknownVersion(version));
        }
        let fingerprint: [u8; 32] = c.array()?;
        let small_blind = c.u32()?;
        let big_blind = c.u32()?;
        let stack = c.u32()?;
        let streets = c.u8()?;
        let iterations = c.u64()?;
        let checkpoint = c.u32()?;
        let tree_bytes = c.prefixed()?;
        let table_section = c.prefixed()?;
        let probabilities = c.rest();
        if streets & 1 == 0 || streets & !KNOWN_STREETS != 0 {
            return Err(StrategyError::Inconsistent);
        }
        let tree = Tree::deserialize(tree_bytes).map_err(|_| StrategyError::Inconsistent)?;
        let buckets = read_buckets(table_section, &tree, streets, version)?;
        let (offsets, expected) = offsets_for(&tree, streets);
        if probabilities.len() as u64 != expected {
            return Err(StrategyError::Inconsistent);
        }
        Ok(StrategyFile {
            fingerprint,
            small_blind,
            big_blind,
            stack,
            streets,
            iterations,
            checkpoint,
            tree,
            tables: buckets.tables,
            thresholds: buckets.thresholds,
            centroids: buckets.centroids,
            clusters: buckets.clusters,
            probabilities: probabilities.to_vec(),
            offsets,
        })
    }

    pub fn probabilities(&self, node: NodeId, bucket: u16) -> &[u8] {
        self.try_probabilities(node, bucket).unwrap_or_else(|| {
            panic!("node {node} has no probabilities for bucket {bucket} in this file")
        })
    }

    pub fn try_probabilities(&self, node: NodeId, bucket: u16) -> Option<&[u8]> {
        let Some(Node::Decision {
            street, actions, ..
        }) = self.tree.nodes().get(node as usize)
        else {
            return None;
        };
        if !self.includes(*street) || bucket >= self.tree.buckets()[street.as_index()] {
            return None;
        }
        let n = actions.len();
        let start = usize::try_from(*self.offsets.get(node as usize)?).ok()?;
        let start = start.checked_add(usize::from(bucket).checked_mul(n)?)?;
        self.probabilities.get(start..start.checked_add(n)?)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StrategyHeader {
    pub fingerprint: [u8; 32],
    pub small_blind: u32,
    pub big_blind: u32,
    pub stack: u32,
    pub streets: u8,
    pub iterations: u64,
    pub checkpoint: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preset::Preset;
    use crate::rng::Rng;

    const TINY: &str = include_str!("../../../presets/tiny.toml");
    const FLOP_CLASSES: usize = 1_286_792;

    fn sample(streets: u8) -> StrategyFile {
        let preset = Preset::from_toml(TINY).unwrap();
        let tree = Tree::build(&preset);
        let mut tables = Vec::new();
        if streets & 2 != 0 {
            tables.push((0..FLOP_CLASSES).map(|i| (i % 8) as u8).collect());
        }
        let mut probabilities = Vec::new();
        let mut next = 0u8;
        for node in tree.nodes() {
            if let Node::Decision {
                street, actions, ..
            } = node
            {
                if streets & (1 << street.as_index()) == 0 {
                    continue;
                }
                let buckets = tree.buckets()[street.as_index()];
                for _ in 0..buckets {
                    let mut p = vec![0.0f32; actions.len()];
                    p[next as usize % actions.len()] = 1.0;
                    next = next.wrapping_add(1);
                    probabilities.extend(quantize(&p));
                }
            }
        }
        let header = StrategyHeader {
            fingerprint: [7; 32],
            small_blind: preset.small_blind,
            big_blind: preset.big_blind,
            stack: preset.stack,
            streets,
            iterations: 12_345,
            checkpoint: 3,
        };
        StrategyFile::new(header, tree, tables, probabilities)
    }

    #[test]
    fn quantize_thirds() {
        assert_eq!(quantize(&[1.0 / 3.0; 3]), vec![85, 85, 85]);
    }

    #[test]
    fn quantize_skewed_sums_to_255() {
        let q = quantize(&[0.999, 0.0005, 0.0005]);
        assert_eq!(q.iter().map(|&x| u32::from(x)).sum::<u32>(), 255);
        assert_eq!(q, vec![255, 0, 0]);
    }

    #[test]
    fn quantize_zeros_is_uniform() {
        assert_eq!(quantize(&[0.0, 0.0, 0.0]), vec![85, 85, 85]);
    }

    #[test]
    fn quantize_random_distributions() {
        let mut rng = Rng::new(5);
        for _ in 0..10_000 {
            let n = 2 + rng.below(6) as usize;
            let raw: Vec<f64> = (0..n)
                .map(|_| {
                    let x = rng.next_f64();
                    x * x * x
                })
                .collect();
            let total: f64 = raw.iter().sum();
            let p: Vec<f32> = raw.iter().map(|x| (x / total) as f32).collect();
            let q = quantize(&p);
            assert_eq!(q.iter().map(|&x| u32::from(x)).sum::<u32>(), 255, "{p:?}");
            for (a, b) in p.iter().zip(&q) {
                assert!(
                    (f64::from(*a) * 255.0 - f64::from(*b)).abs() <= 1.0,
                    "{p:?}"
                );
            }
        }
    }

    #[test]
    fn round_trip() {
        for streets in [0b0001, 0b0011] {
            let f = sample(streets);
            let g = StrategyFile::from_bytes(&f.to_bytes()).unwrap();
            assert_eq!(g, f);
        }
    }

    #[test]
    fn header_layout() {
        let f = sample(0b0011);
        let b = f.to_bytes();
        assert_eq!(&b[..4], b"MLCS");
        assert_eq!(&b[4..6], &1u16.to_le_bytes());
        assert_eq!(&b[6..38], &[7u8; 32]);
        assert_eq!(&b[38..42], &10u32.to_le_bytes());
        assert_eq!(&b[42..46], &20u32.to_le_bytes());
        assert_eq!(&b[46..50], &400u32.to_le_bytes());
        assert_eq!(b[50], 0b0011);
        assert_eq!(&b[51..59], &12_345u64.to_le_bytes());
        assert_eq!(&b[59..63], &3u32.to_le_bytes());
        assert!(b.ends_with(&f.probabilities));
    }

    #[test]
    fn bad_magic() {
        let mut b = sample(0b0011).to_bytes();
        b[0] = b'X';
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::BadMagic)
        );
    }

    #[test]
    fn version_four_is_rejected() {
        let mut b = centroid_sample().to_bytes();
        b[4] = 4;
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::UnknownVersion(4))
        );
    }

    fn centroid_values(count: usize, dimension: usize) -> Vec<f32> {
        (0..count * dimension)
            .map(|i| (i % 97) as f32 / 97.0)
            .collect()
    }

    fn cluster_map() -> [u8; 169] {
        std::array::from_fn(|i| (i * 5 % 8) as u8)
    }

    fn centroid_sample() -> StrategyFile {
        sample(0b1111).with_centroids(
            vec![
                (Street::Turn, centroid_values(8, 50)),
                (Street::River, centroid_values(8, 8)),
            ],
            cluster_map(),
        )
    }

    fn bucket_section_start(b: &[u8]) -> usize {
        let tree_len = u32::from_le_bytes(b[63..67].try_into().unwrap()) as usize;
        67 + tree_len + 4
    }

    #[test]
    fn centroid_file_round_trips_as_version_three() {
        let f = centroid_sample();
        let b = f.to_bytes();
        assert_eq!(&b[4..6], &3u16.to_le_bytes());
        let g = StrategyFile::from_bytes(&b).unwrap();
        assert_eq!(g, f);
        assert_eq!(g.tables.len(), 1);
        assert_eq!(
            g.centroids_of(Street::Turn),
            Some(&centroid_values(8, 50)[..])
        );
        assert_eq!(
            g.centroids_of(Street::River),
            Some(&centroid_values(8, 8)[..])
        );
        assert_eq!(g.centroids_of(Street::Flop), None);
        assert_eq!(g.clusters, Some(cluster_map()));
        let start = bucket_section_start(&b);
        let section_len = u32::from_le_bytes(b[start - 4..start].try_into().unwrap()) as usize;
        let end = start + section_len;
        assert_eq!(&b[end - 169..end], &cluster_map()[..]);
        let turn = start + 1 + 4 + FLOP_CLASSES;
        assert_eq!(b[turn], 2);
        assert_eq!(&b[turn + 1..turn + 5], &[8, 0, 50, 0]);
        let river = turn + 5 + 8 * 50 * 4;
        assert_eq!(b[river], 2);
        assert_eq!(&b[river + 1..river + 5], &[8, 0, 8, 0]);
        assert_eq!(river + 5 + 8 * 8 * 4 + 169, end);
    }

    #[test]
    fn centroids_mix_with_thresholds_and_tables() {
        let f = sample(0b1111)
            .with_thresholds(vec![(Street::Turn, thresholds())])
            .with_centroids(vec![(Street::River, centroid_values(8, 8))], cluster_map());
        let g = StrategyFile::from_bytes(&f.to_bytes()).unwrap();
        assert_eq!(g, f);
    }

    #[test]
    fn centroid_count_must_match_buckets() {
        for count in [7, 9] {
            let f = sample(0b1111).with_centroids(
                vec![
                    (Street::Turn, centroid_values(count, 50)),
                    (Street::River, centroid_values(8, 8)),
                ],
                cluster_map(),
            );
            assert_eq!(
                StrategyFile::from_bytes(&f.to_bytes()).err(),
                Some(StrategyError::Inconsistent),
                "{count}"
            );
        }
    }

    #[test]
    fn centroid_dimension_must_match_street() {
        let b = centroid_sample().to_bytes();
        let turn = bucket_section_start(&b) + 1 + 4 + FLOP_CLASSES;
        let river = turn + 5 + 8 * 50 * 4;
        for (at, dimension) in [(turn, 8u16), (turn, 49), (river, 50), (river, 7)] {
            let mut c = b.clone();
            c[at + 3..at + 5].copy_from_slice(&dimension.to_le_bytes());
            assert_eq!(
                StrategyFile::from_bytes(&c).err(),
                Some(StrategyError::Inconsistent),
                "{at} {dimension}"
            );
        }
        let mut c = b.clone();
        let flop = bucket_section_start(&b);
        c[flop] = 2;
        assert_eq!(
            StrategyFile::from_bytes(&c).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn centroid_values_must_be_finite() {
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            let mut river = centroid_values(8, 8);
            river[13] = bad;
            let f = sample(0b1111).with_centroids(
                vec![
                    (Street::Turn, centroid_values(8, 50)),
                    (Street::River, river),
                ],
                cluster_map(),
            );
            assert_eq!(
                StrategyFile::from_bytes(&f.to_bytes()).err(),
                Some(StrategyError::Inconsistent),
                "{bad}"
            );
        }
    }

    #[test]
    fn cluster_map_values_must_be_below_eight() {
        let mut clusters = cluster_map();
        clusters[100] = 8;
        let f = sample(0b1111).with_centroids(
            vec![
                (Street::Turn, centroid_values(8, 50)),
                (Street::River, centroid_values(8, 8)),
            ],
            clusters,
        );
        assert_eq!(
            StrategyFile::from_bytes(&f.to_bytes()).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn cluster_map_must_be_complete() {
        let b = centroid_sample().to_bytes();
        let start = bucket_section_start(&b);
        let section_len = u32::from_le_bytes(b[start - 4..start].try_into().unwrap());
        let mut c = b.clone();
        c[start - 4..start].copy_from_slice(&(section_len - 1).to_le_bytes());
        c.remove(start + section_len as usize - 1);
        assert_eq!(
            StrategyFile::from_bytes(&c).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn centroids_need_version_three() {
        let mut b = centroid_sample().to_bytes();
        b[4] = 2;
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn shipped_v1_play_file_still_loads() {
        use std::io::Read;
        let gz = include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../web/src/cfr/v1.mlcs.gz"
        ));
        let mut bytes = Vec::new();
        flate2::read::GzDecoder::new(&gz[..])
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(&bytes[4..6], &2u16.to_le_bytes());
        let f = StrategyFile::from_bytes(&bytes).unwrap();
        assert!(f.centroids.is_empty());
        assert_eq!(f.clusters, None);
        assert_eq!(f.to_bytes(), bytes);
    }

    fn thresholds() -> Vec<f32> {
        (1..8).map(|i| i as f32 / 8.0).collect()
    }

    fn play_sample() -> StrategyFile {
        sample(0b1111).with_thresholds(vec![
            (Street::Turn, thresholds()),
            (Street::River, thresholds()),
        ])
    }

    #[test]
    fn play_file_round_trips_as_version_two() {
        let f = play_sample();
        let b = f.to_bytes();
        assert_eq!(&b[4..6], &2u16.to_le_bytes());
        let g = StrategyFile::from_bytes(&b).unwrap();
        assert_eq!(g, f);
        assert_eq!(g.tables.len(), 1);
        assert_eq!(g.thresholds_of(Street::Turn), Some(&thresholds()[..]));
        assert_eq!(g.thresholds_of(Street::River), Some(&thresholds()[..]));
        assert_eq!(g.thresholds_of(Street::Flop), None);
        assert_eq!(g.probabilities.len() as u64, g.tree.action_slot_count());
    }

    #[test]
    fn table_only_file_stays_version_one() {
        let b = sample(0b0011).with_thresholds(Vec::new()).to_bytes();
        assert_eq!(&b[4..6], &1u16.to_le_bytes());
    }

    #[test]
    fn wrong_threshold_count() {
        let f = sample(0b1111).with_thresholds(vec![
            (Street::Turn, thresholds()),
            (Street::River, thresholds()[1..].to_vec()),
        ]);
        assert_eq!(
            StrategyFile::from_bytes(&f.to_bytes()).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn thresholds_out_of_order_or_not_finite() {
        for bad in [f32::NAN, f32::INFINITY, 0.0] {
            let mut t = thresholds();
            t[3] = bad;
            let f = sample(0b1111)
                .with_thresholds(vec![(Street::Turn, thresholds()), (Street::River, t)]);
            assert_eq!(
                StrategyFile::from_bytes(&f.to_bytes()).err(),
                Some(StrategyError::Inconsistent),
                "{bad}"
            );
        }
    }

    #[test]
    fn unknown_bucket_kind() {
        let f = play_sample();
        let mut b = f.to_bytes();
        let tree_len = u32::from_le_bytes(b[63..67].try_into().unwrap()) as usize;
        let kind = 67 + tree_len + 4;
        assert_eq!(b[kind], 0);
        b[kind] = 2;
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn cut_body() {
        let f = sample(0b0011);
        let b = f.to_bytes();
        let tail = f.probabilities.len();
        for cut in [0, 3, 5, 40, 62, 70, b.len() - tail - 1] {
            assert_eq!(
                StrategyFile::from_bytes(&b[..cut]).err(),
                Some(StrategyError::Truncated),
                "cut {cut}"
            );
        }
    }

    #[test]
    fn short_probabilities() {
        let b = sample(0b0011).to_bytes();
        assert_eq!(
            StrategyFile::from_bytes(&b[..b.len() - 1]).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn long_probabilities() {
        let mut b = sample(0b0011).to_bytes();
        b.push(0);
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn mask_without_preflop() {
        let mut b = sample(0b0011).to_bytes();
        b[50] = 0b0010;
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn mask_with_unknown_bits() {
        let mut b = sample(0b0011).to_bytes();
        b[50] = 0b1_0011;
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn table_of_the_wrong_size() {
        let mut f = sample(0b0011);
        f.tables[0].pop();
        assert_eq!(
            StrategyFile::from_bytes(&f.to_bytes()).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn wrong_table_count() {
        let mut f = sample(0b0011);
        f.tables.clear();
        assert_eq!(
            StrategyFile::from_bytes(&f.to_bytes()).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn broken_tree() {
        let mut b = sample(0b0011).to_bytes();
        b[67] = 0;
        b[68] = 0;
        assert_eq!(
            StrategyFile::from_bytes(&b).err(),
            Some(StrategyError::Inconsistent)
        );
    }

    #[test]
    fn preflop_only_has_no_tables() {
        let f = sample(0b0001);
        assert!(f.tables.is_empty());
        let g = StrategyFile::from_bytes(&f.to_bytes()).unwrap();
        assert!(g.includes(Street::Preflop));
        assert!(!g.includes(Street::Flop));
    }

    #[test]
    fn probabilities_slice_per_infoset() {
        let f = sample(0b0011);
        let g = StrategyFile::from_bytes(&f.to_bytes()).unwrap();
        let mut pos = 0;
        for (id, node) in g.tree.nodes().iter().enumerate() {
            if let Node::Decision {
                street, actions, ..
            } = node
            {
                if !g.includes(*street) {
                    continue;
                }
                for bucket in 0..g.tree.buckets()[street.as_index()] {
                    let slice = g.probabilities(id as NodeId, bucket);
                    assert_eq!(slice, &g.probabilities[pos..pos + actions.len()]);
                    assert_eq!(slice.iter().map(|&x| u32::from(x)).sum::<u32>(), 255);
                    pos += actions.len();
                }
            }
        }
        assert_eq!(pos, g.probabilities.len());
    }

    #[test]
    #[should_panic]
    fn excluded_street_panics() {
        let f = sample(0b0001);
        let id = f
            .tree
            .nodes()
            .iter()
            .position(|n| matches!(n, Node::Decision { street, .. } if *street == Street::Flop))
            .unwrap();
        f.probabilities(id as NodeId, 0);
    }

    #[test]
    fn try_probabilities_refuses_what_probabilities_panics_on() {
        let f = sample(0b0001);
        let nodes = f.tree.nodes();
        let flop = nodes
            .iter()
            .position(|n| matches!(n, Node::Decision { street, .. } if *street == Street::Flop))
            .unwrap();
        let terminal = nodes
            .iter()
            .position(|n| !matches!(n, Node::Decision { .. }))
            .unwrap();
        let root = f.tree.root();
        let preflop = f.tree.buckets()[0];
        assert_eq!(f.try_probabilities(flop as NodeId, 0), None);
        assert_eq!(f.try_probabilities(terminal as NodeId, 0), None);
        assert_eq!(f.try_probabilities(root, preflop), None);
        assert_eq!(f.try_probabilities(nodes.len() as NodeId, 0), None);
        assert_eq!(
            f.try_probabilities(root, preflop - 1),
            Some(f.probabilities(root, preflop - 1))
        );
    }
}
