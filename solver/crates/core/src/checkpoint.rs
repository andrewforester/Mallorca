use crate::bytes::{ByteReader, Truncated};
use crate::cfr::{Storage, SLOT_BYTES};
use std::fmt;
use std::io::{self, Write};

pub const MAGIC: &[u8; 4] = b"MLCK";
pub const FORMAT_VERSION: u16 = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckpointHeader {
    pub format_version: u16,
    pub fingerprint: [u8; 32],
    pub iterations: u64,
    pub elapsed_seconds: u64,
    pub checkpoint: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CheckpointError {
    BadMagic,
    UnknownVersion(u16),
    FingerprintMismatch,
    Truncated,
}

impl fmt::Display for CheckpointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CheckpointError::BadMagic => write!(f, "not a checkpoint (bad magic)"),
            CheckpointError::UnknownVersion(v) => {
                write!(f, "unknown checkpoint format version {v}")
            }
            CheckpointError::FingerprintMismatch => {
                write!(
                    f,
                    "checkpoint belongs to another preset, tree or bucket tables"
                )
            }
            CheckpointError::Truncated => {
                write!(f, "checkpoint is truncated or has the wrong length")
            }
        }
    }
}

impl std::error::Error for CheckpointError {}

impl From<Truncated> for CheckpointError {
    fn from(_: Truncated) -> CheckpointError {
        CheckpointError::Truncated
    }
}

const HEADER_LEN: usize = 66;

pub fn write_checkpoint<W: Write>(
    out: &mut W,
    header: &CheckpointHeader,
    storage: &Storage,
) -> io::Result<()> {
    let slots = storage.len();
    out.write_all(MAGIC)?;
    out.write_all(&header.format_version.to_le_bytes())?;
    out.write_all(&header.fingerprint)?;
    out.write_all(&header.iterations.to_le_bytes())?;
    out.write_all(&header.elapsed_seconds.to_le_bytes())?;
    out.write_all(&header.checkpoint.to_le_bytes())?;
    out.write_all(&slots.to_le_bytes())?;
    for i in 0..slots {
        out.write_all(&storage.regret(i).to_le_bytes())?;
    }
    for i in 0..slots {
        out.write_all(&storage.strategy_sum(i).to_le_bytes())?;
    }
    Ok(())
}

pub fn read_checkpoint(
    bytes: &[u8],
    expected: &[u8; 32],
) -> Result<(CheckpointHeader, Storage), CheckpointError> {
    let mut r = ByteReader::new(bytes);
    if &r.array::<4>()? != MAGIC {
        return Err(CheckpointError::BadMagic);
    }
    let format_version = r.u16()?;
    if format_version != FORMAT_VERSION {
        return Err(CheckpointError::UnknownVersion(format_version));
    }
    if bytes.len() < HEADER_LEN {
        return Err(CheckpointError::Truncated);
    }
    let fingerprint: [u8; 32] = r.array()?;
    if &fingerprint != expected {
        return Err(CheckpointError::FingerprintMismatch);
    }
    let header = CheckpointHeader {
        format_version,
        fingerprint,
        iterations: r.u64()?,
        elapsed_seconds: r.u64()?,
        checkpoint: r.u32()?,
    };
    let slots = r.u64()?;
    let body = r.rest();
    if slots.checked_mul(SLOT_BYTES as u64) != Some(body.len() as u64) {
        return Err(CheckpointError::Truncated);
    }
    let storage = Storage::from_bytes(slots, body).map_err(|_| CheckpointError::Truncated)?;
    Ok((header, storage))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Rng;

    fn header() -> CheckpointHeader {
        CheckpointHeader {
            format_version: FORMAT_VERSION,
            fingerprint: [9; 32],
            iterations: 123_456,
            elapsed_seconds: 789,
            checkpoint: 3,
        }
    }

    fn storage() -> Storage {
        let s = Storage::new(5);
        s.add_regret(0, 1.5);
        s.add_regret(4, -2.0);
        s.add_strategy(2, 3.25);
        s
    }

    fn bytes() -> Vec<u8> {
        let mut out = Vec::new();
        write_checkpoint(&mut out, &header(), &storage()).unwrap();
        out
    }

    struct Full(usize);

    impl std::io::Write for Full {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if self.0 == 0 {
                return Err(std::io::Error::other("disk full"));
            }
            let n = buf.len().min(self.0);
            self.0 -= n;
            Ok(n)
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn a_failing_writer_is_an_error() {
        for room in [0, 10, 70, bytes().len() - 1] {
            let err = write_checkpoint(&mut Full(room), &header(), &storage()).unwrap_err();
            assert_eq!(err.to_string(), "disk full", "{room}");
        }
        assert!(write_checkpoint(&mut Full(bytes().len()), &header(), &storage()).is_ok());
    }

    #[test]
    fn round_trip() {
        let (h, s) = read_checkpoint(&bytes(), &[9; 32]).unwrap();
        assert_eq!(h, header());
        assert_eq!(s.to_bytes(), storage().to_bytes());
    }

    #[test]
    fn layout_starts_with_magic_and_version() {
        let b = bytes();
        assert_eq!(&b[..4], b"MLCK");
        assert_eq!(&b[4..6], &2u16.to_le_bytes());
        assert_eq!(b.len(), 66 + 5 * 12);
        assert!(b.ends_with(&storage().to_bytes()));
    }

    #[test]
    fn every_truncation_is_reported() {
        let b = bytes();
        let mut rng = Rng::new(8);
        let mut cuts: Vec<usize> = (0..10)
            .map(|_| rng.below(b.len() as u32) as usize)
            .collect();
        cuts.extend([0, 3, 5, 65, b.len() - 1]);
        for cut in cuts {
            assert_eq!(
                read_checkpoint(&b[..cut], &[9; 32]).err(),
                Some(CheckpointError::Truncated),
                "cut at {cut}"
            );
        }
    }

    #[test]
    fn trailing_bytes_are_rejected() {
        let mut b = bytes();
        b.push(0);
        assert_eq!(
            read_checkpoint(&b, &[9; 32]).err(),
            Some(CheckpointError::Truncated)
        );
    }

    #[test]
    fn other_fingerprint_is_rejected() {
        assert_eq!(
            read_checkpoint(&bytes(), &[8; 32]).err(),
            Some(CheckpointError::FingerprintMismatch)
        );
    }

    #[test]
    fn changed_magic_is_rejected() {
        let mut b = bytes();
        b[0] = b'X';
        assert_eq!(
            read_checkpoint(&b, &[9; 32]).err(),
            Some(CheckpointError::BadMagic)
        );
    }

    #[test]
    fn unknown_version_is_rejected() {
        let mut b = bytes();
        b[4] = 1;
        assert_eq!(
            read_checkpoint(&b, &[9; 32]).err(),
            Some(CheckpointError::UnknownVersion(1))
        );
    }

    #[test]
    fn absurd_slot_count_is_truncated_not_a_panic() {
        let mut b = bytes();
        b[58..66].copy_from_slice(&u64::MAX.to_le_bytes());
        assert_eq!(
            read_checkpoint(&b, &[9; 32]).err(),
            Some(CheckpointError::Truncated)
        );
    }
}
