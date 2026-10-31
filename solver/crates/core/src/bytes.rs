#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Truncated;

pub struct ByteReader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> ByteReader<'a> {
    pub fn new(bytes: &'a [u8]) -> ByteReader<'a> {
        ByteReader { bytes, pos: 0 }
    }

    pub fn remaining(&self) -> usize {
        self.bytes.len() - self.pos
    }

    pub fn is_done(&self) -> bool {
        self.pos == self.bytes.len()
    }

    pub fn rest(&self) -> &'a [u8] {
        &self.bytes[self.pos..]
    }

    pub fn take(&mut self, n: usize) -> Result<&'a [u8], Truncated> {
        let end = self.pos.checked_add(n).ok_or(Truncated)?;
        let slice = self.bytes.get(self.pos..end).ok_or(Truncated)?;
        self.pos = end;
        Ok(slice)
    }

    pub fn array<const N: usize>(&mut self) -> Result<[u8; N], Truncated> {
        Ok(self.take(N)?.try_into().expect("slice has length N"))
    }

    pub fn u8(&mut self) -> Result<u8, Truncated> {
        Ok(self.take(1)?[0])
    }

    pub fn u16(&mut self) -> Result<u16, Truncated> {
        self.array().map(u16::from_le_bytes)
    }

    pub fn u32(&mut self) -> Result<u32, Truncated> {
        self.array().map(u32::from_le_bytes)
    }

    pub fn u64(&mut self) -> Result<u64, Truncated> {
        self.array().map(u64::from_le_bytes)
    }

    pub fn prefixed(&mut self) -> Result<&'a [u8], Truncated> {
        let n = self.u32()? as usize;
        self.take(n)
    }

    pub fn f32s(&mut self, count: usize) -> Result<Vec<f32>, Truncated> {
        let n = count.checked_mul(4).ok_or(Truncated)?;
        Ok(f32s(self.take(n)?))
    }
}

pub fn f32s(bytes: &[u8]) -> Vec<f32> {
    bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|&c| f32::from_le_bytes(c))
        .collect()
}

pub fn u32_len(n: usize) -> [u8; 4] {
    u32::try_from(n)
        .expect("length exceeds its u32 field")
        .to_le_bytes()
}

pub fn u16_len(n: usize) -> [u8; 2] {
    u16::try_from(n)
        .expect("length exceeds its u16 field")
        .to_le_bytes()
}

pub fn u8_len(n: usize) -> u8 {
    u8::try_from(n).expect("length exceeds its u8 field")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_little_endian_values_in_order() {
        let mut bytes = vec![7u8];
        bytes.extend_from_slice(&0x0102u16.to_le_bytes());
        bytes.extend_from_slice(&0x0304_0506u32.to_le_bytes());
        bytes.extend_from_slice(&0x0708_090a_0b0c_0d0eu64.to_le_bytes());
        bytes.extend_from_slice(&1.5f32.to_le_bytes());
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&[9, 8, 6]);
        let mut r = ByteReader::new(&bytes);
        assert_eq!(r.u8(), Ok(7));
        assert_eq!(r.u16(), Ok(0x0102));
        assert_eq!(r.u32(), Ok(0x0304_0506));
        assert_eq!(r.u64(), Ok(0x0708_090a_0b0c_0d0e));
        assert_eq!(r.f32s(1), Ok(vec![1.5]));
        assert_eq!(r.prefixed(), Ok(&[9, 8][..]));
        assert_eq!(r.remaining(), 1);
        assert_eq!(r.rest(), &[6]);
        assert!(!r.is_done());
        assert_eq!(r.array::<1>(), Ok([6]));
        assert!(r.is_done());
    }

    #[test]
    fn short_input_is_truncated_and_does_not_advance() {
        let bytes = [1, 2, 3];
        let mut r = ByteReader::new(&bytes);
        assert_eq!(r.u32(), Err(Truncated));
        assert_eq!(r.remaining(), 3);
        assert_eq!(r.u16(), Ok(0x0201));
        assert_eq!(r.u16(), Err(Truncated));
        assert_eq!(r.u64(), Err(Truncated));
    }

    #[test]
    fn lengths_are_written_little_endian() {
        assert_eq!(u32_len(0x0102_0304), [4, 3, 2, 1]);
        assert_eq!(u16_len(0xffff), [0xff, 0xff]);
        assert_eq!(u8_len(255), 255);
    }

    #[test]
    #[should_panic(expected = "length exceeds its u16 field")]
    fn a_length_beyond_u16_is_refused() {
        u16_len(0x1_0000);
    }

    #[test]
    #[should_panic(expected = "length exceeds its u8 field")]
    fn a_length_beyond_u8_is_refused() {
        u8_len(256);
    }

    #[test]
    #[should_panic(expected = "length exceeds its u32 field")]
    fn a_length_beyond_u32_is_refused() {
        u32_len(usize::try_from(u64::from(u32::MAX) + 1).unwrap());
    }

    #[test]
    fn oversized_lengths_are_truncated_not_a_panic() {
        let mut r = ByteReader::new(&[0xff, 0xff, 0xff, 0xff, 0]);
        assert_eq!(r.prefixed(), Err(Truncated));
        let mut r = ByteReader::new(&[1]);
        assert!(r.u8().is_ok());
        assert_eq!(r.take(usize::MAX), Err(Truncated));
        assert_eq!(r.f32s(usize::MAX), Err(Truncated));
    }
}
