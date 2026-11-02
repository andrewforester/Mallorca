const INDEX_BITS: u32 = 16;
const INDEX_MASK: u32 = (1 << INDEX_BITS) - 1;
const GENERATION_MASK: u32 = 0x7fff;
pub const CAPACITY: usize = 1 << INDEX_BITS;

struct Entry<T> {
    generation: u32,
    value: Option<T>,
}

pub struct Slots<T> {
    entries: Vec<Entry<T>>,
    free: Vec<usize>,
}

impl<T> Slots<T> {
    pub const fn new() -> Slots<T> {
        Slots {
            entries: Vec::new(),
            free: Vec::new(),
        }
    }

    pub fn insert(&mut self, value: T) -> Option<i32> {
        let index = match self.free.pop() {
            Some(index) => index,
            None if self.entries.len() < CAPACITY => {
                self.entries.push(Entry {
                    generation: 0,
                    value: None,
                });
                self.entries.len() - 1
            }
            None => return None,
        };
        let entry = &mut self.entries[index];
        entry.value = Some(value);
        let index = u32::try_from(index).ok()?;
        i32::try_from((entry.generation << INDEX_BITS) | index).ok()
    }

    fn index(&self, handle: i32) -> Option<usize> {
        let handle = u32::try_from(handle).ok()?;
        let index = usize::try_from(handle & INDEX_MASK).ok()?;
        let entry = self.entries.get(index)?;
        (entry.value.is_some() && entry.generation == handle >> INDEX_BITS).then_some(index)
    }

    pub fn get(&self, handle: i32) -> Option<&T> {
        let index = self.index(handle)?;
        self.entries[index].value.as_ref()
    }

    pub fn get_mut(&mut self, handle: i32) -> Option<&mut T> {
        let index = self.index(handle)?;
        self.entries[index].value.as_mut()
    }

    pub fn remove(&mut self, handle: i32) -> Option<T> {
        let index = self.index(handle)?;
        let entry = &mut self.entries[index];
        entry.generation = (entry.generation + 1) & GENERATION_MASK;
        self.free.push(index);
        entry.value.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_freed_slot_is_reused_under_a_new_handle() {
        let mut slots = Slots::new();
        let a = slots.insert('a').unwrap();
        let b = slots.insert('b').unwrap();
        assert_eq!(slots.remove(a), Some('a'));
        let c = slots.insert('c').unwrap();
        assert_ne!(c, a);
        assert_eq!(slots.entries.len(), 2);
        assert_eq!(slots.get(a), None);
        assert_eq!(slots.get(b), Some(&'b'));
        assert_eq!(slots.get(c), Some(&'c'));
    }

    #[test]
    fn a_stale_or_foreign_handle_finds_nothing() {
        let mut slots = Slots::new();
        let a = slots.insert(1).unwrap();
        assert_eq!(slots.remove(a), Some(1));
        assert_eq!(slots.remove(a), None);
        assert_eq!(slots.get_mut(a), None);
        for handle in [-1, i32::MIN, i32::MAX, 7, a + (1 << INDEX_BITS)] {
            assert_eq!(slots.get(handle), None, "{handle}");
        }
    }

    #[test]
    fn handles_stay_non_negative_as_generations_wrap() {
        let mut slots = Slots::new();
        for _ in 0..=GENERATION_MASK + 1 {
            let h = slots.insert(()).unwrap();
            assert!(h >= 0, "{h}");
            assert!(slots.get(h).is_some());
            slots.remove(h);
        }
        assert_eq!(slots.entries.len(), 1);
    }

    #[test]
    fn a_full_table_refuses_another_value() {
        let mut slots = Slots::new();
        for _ in 0..CAPACITY {
            assert!(slots.insert(()).is_some());
        }
        assert_eq!(slots.insert(()), None);
        let last = i32::try_from(CAPACITY - 1).unwrap();
        slots.remove(last);
        assert!(slots.insert(()).is_some());
    }
}
