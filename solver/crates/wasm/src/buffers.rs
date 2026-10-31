pub struct Buffers {
    outstanding: Vec<(usize, usize)>,
}

impl Buffers {
    pub const fn new() -> Buffers {
        Buffers {
            outstanding: Vec::new(),
        }
    }

    pub fn alloc(&mut self, len: usize) -> *mut u8 {
        let ptr = Box::into_raw(vec![0u8; len].into_boxed_slice()).cast::<u8>();
        self.outstanding.push((ptr.addr(), len));
        ptr
    }

    pub fn take(&mut self, ptr: *mut u8, len: usize) -> Option<Box<[u8]>> {
        let at = self
            .outstanding
            .iter()
            .position(|&handed| handed == (ptr.addr(), len))?;
        self.outstanding.swap_remove(at);
        let raw = std::ptr::slice_from_raw_parts_mut(ptr, len);
        Some(unsafe { Box::from_raw(raw) })
    }
}
