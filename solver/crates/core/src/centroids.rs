use crate::potential::{BINS, CLUSTERS};
use std::fmt;

pub const MAGIC: &[u8; 4] = b"MLCC";
pub const FORMAT_VERSION: u16 = 1;
pub const TURN_DIMENSION: usize = BINS;
pub const RIVER_DIMENSION: usize = CLUSTERS;
pub const MAX_CENTROIDS: usize = 256;

#[derive(Debug, Clone, PartialEq)]
pub struct Centroids {
    pub clusters: [u8; 169],
    pub turn: Vec<f32>,
    pub river: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CentroidsError {
    Truncated,
    BadMagic,
    UnknownVersion(u16),
    BadCluster(u8),
    BadDimension(u16),
    BadCount(u16),
    TrailingBytes,
    NonFinite,
}

impl fmt::Display for CentroidsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CentroidsError::Truncated => write!(f, "centroid file is truncated"),
            CentroidsError::BadMagic => write!(f, "not a centroid file (bad magic)"),
            CentroidsError::UnknownVersion(v) => write!(f, "unknown centroid format version {v}"),
            CentroidsError::BadCluster(c) => write!(f, "opponent cluster {c} is out of range"),
            CentroidsError::BadDimension(d) => write!(f, "centroid dimension {d} is wrong"),
            CentroidsError::BadCount(c) => write!(f, "centroid count {c} is out of range"),
            CentroidsError::TrailingBytes => write!(f, "centroid file has trailing bytes"),
            CentroidsError::NonFinite => write!(f, "centroid file has a non-finite value"),
        }
    }
}

impl std::error::Error for CentroidsError {}

fn encode_section(out: &mut Vec<u8>, values: &[f32], dimension: usize) {
    out.extend_from_slice(&((values.len() / dimension) as u16).to_le_bytes());
    out.extend_from_slice(&(dimension as u16).to_le_bytes());
    for v in values {
        out.extend_from_slice(&v.to_le_bytes());
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], CentroidsError> {
        let end = self.at.checked_add(n).ok_or(CentroidsError::Truncated)?;
        let slice = self
            .bytes
            .get(self.at..end)
            .ok_or(CentroidsError::Truncated)?;
        self.at = end;
        Ok(slice)
    }

    fn u16(&mut self) -> Result<u16, CentroidsError> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn section(&mut self, expected: usize) -> Result<Vec<f32>, CentroidsError> {
        let count = self.u16()?;
        let dimension = self.u16()?;
        if dimension as usize != expected {
            return Err(CentroidsError::BadDimension(dimension));
        }
        if count == 0 || count as usize > MAX_CENTROIDS {
            return Err(CentroidsError::BadCount(count));
        }
        let body = self.take(count as usize * expected * 4)?;
        let values: Vec<f32> = body
            .as_chunks::<4>()
            .0
            .iter()
            .map(|&b| f32::from_le_bytes(b))
            .collect();
        if values.iter().any(|v| !v.is_finite()) {
            return Err(CentroidsError::NonFinite);
        }
        Ok(values)
    }
}

impl Centroids {
    pub fn encode(&self) -> Vec<u8> {
        let mut out =
            Vec::with_capacity(4 + 2 + 169 + 8 + (self.turn.len() + self.river.len()) * 4);
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
        out.extend_from_slice(&self.clusters);
        encode_section(&mut out, &self.turn, TURN_DIMENSION);
        encode_section(&mut out, &self.river, RIVER_DIMENSION);
        out
    }

    pub fn decode(bytes: &[u8]) -> Result<Centroids, CentroidsError> {
        let mut reader = Reader { bytes, at: 0 };
        if reader.take(4)? != MAGIC {
            return Err(CentroidsError::BadMagic);
        }
        let version = reader.u16()?;
        if version != FORMAT_VERSION {
            return Err(CentroidsError::UnknownVersion(version));
        }
        let clusters: [u8; 169] = reader.take(169)?.try_into().expect("169 bytes");
        if let Some(&bad) = clusters.iter().find(|&&c| c as usize >= CLUSTERS) {
            return Err(CentroidsError::BadCluster(bad));
        }
        let turn = reader.section(TURN_DIMENSION)?;
        let river = reader.section(RIVER_DIMENSION)?;
        if reader.at != bytes.len() {
            return Err(CentroidsError::TrailingBytes);
        }
        Ok(Centroids {
            clusters,
            turn,
            river,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Centroids {
        let mut clusters = [0u8; 169];
        for (i, c) in clusters.iter_mut().enumerate() {
            *c = (i % CLUSTERS) as u8;
        }
        Centroids {
            clusters,
            turn: (0..3 * TURN_DIMENSION).map(|i| i as f32 / 7.0).collect(),
            river: (0..2 * RIVER_DIMENSION).map(|i| 0.5 - i as f32).collect(),
        }
    }

    const HEADER: usize = 4 + 2 + 169;

    #[test]
    fn centroids_round_trip() {
        let centroids = sample();
        let bytes = centroids.encode();
        assert_eq!(&bytes[..4], b"MLCC");
        assert_eq!(&bytes[4..6], &1u16.to_le_bytes());
        assert_eq!(&bytes[6..HEADER], &centroids.clusters);
        assert_eq!(&bytes[HEADER..HEADER + 4], &[3, 0, 50, 0]);
        let river_at = HEADER + 4 + 3 * 50 * 4;
        assert_eq!(&bytes[river_at..river_at + 4], &[2, 0, 8, 0]);
        assert_eq!(bytes.len(), river_at + 4 + 2 * 8 * 4);
        assert_eq!(
            &bytes[HEADER + 8..HEADER + 12],
            &centroids.turn[1].to_le_bytes()
        );
        assert_eq!(Centroids::decode(&bytes), Ok(centroids));
    }

    fn patched(at: usize, value: &[u8]) -> Vec<u8> {
        let mut bytes = sample().encode();
        bytes[at..at + value.len()].copy_from_slice(value);
        bytes
    }

    #[test]
    fn bad_magic_version_and_lengths_are_rejected() {
        let bytes = sample().encode();
        for len in 0..bytes.len() {
            assert_eq!(
                Centroids::decode(&bytes[..len]),
                Err(CentroidsError::Truncated),
                "{len}"
            );
        }
        let mut longer = bytes.clone();
        longer.push(0);
        assert_eq!(
            Centroids::decode(&longer),
            Err(CentroidsError::TrailingBytes)
        );
        assert_eq!(
            Centroids::decode(&patched(0, b"MLCB")),
            Err(CentroidsError::BadMagic)
        );
        assert_eq!(
            Centroids::decode(&patched(4, &2u16.to_le_bytes())),
            Err(CentroidsError::UnknownVersion(2))
        );
        assert_eq!(
            Centroids::decode(&patched(6 + 100, &[8])),
            Err(CentroidsError::BadCluster(8))
        );
        assert_eq!(
            Centroids::decode(&patched(HEADER + 2, &49u16.to_le_bytes())),
            Err(CentroidsError::BadDimension(49))
        );
        let river_at = HEADER + 4 + 3 * 50 * 4;
        assert_eq!(
            Centroids::decode(&patched(river_at + 2, &50u16.to_le_bytes())),
            Err(CentroidsError::BadDimension(50))
        );
        assert_eq!(
            Centroids::decode(&patched(HEADER, &0u16.to_le_bytes())),
            Err(CentroidsError::BadCount(0))
        );
        assert_eq!(
            Centroids::decode(&patched(river_at, &257u16.to_le_bytes())),
            Err(CentroidsError::BadCount(257))
        );
    }

    #[test]
    fn non_finite_values_are_rejected() {
        let river_at = HEADER + 4 + 3 * 50 * 4;
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            for at in [HEADER + 4 + 8, river_at + 4 + 4] {
                assert_eq!(
                    Centroids::decode(&patched(at, &bad.to_le_bytes())),
                    Err(CentroidsError::NonFinite),
                    "{bad} at {at}"
                );
            }
        }
    }
}
