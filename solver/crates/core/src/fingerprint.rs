use crate::abstraction::Abstraction;
use crate::preset::Preset;
use crate::tree::{Street, Tree};
use sha2::{Digest, Sha256};

pub fn fingerprint(preset: &Preset, tree: &Tree, abstraction: &Abstraction) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(preset.abstraction_toml().as_bytes());
    hasher.update(tree.serialize());
    for street in [Street::Flop, Street::Turn, Street::River] {
        hasher.update(abstraction.table_bytes(street));
    }
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preset::Sizes;

    const TINY: &str = include_str!("../../../presets/tiny.toml");

    fn tables() -> [Vec<u8>; 3] {
        [vec![0, 1, 2, 3], vec![4, 5, 6], vec![7, 0, 1, 2, 3]]
    }

    fn of(preset: &Preset, tables: [Vec<u8>; 3]) -> [u8; 32] {
        fingerprint(preset, &Tree::build(preset), &Abstraction::new(tables))
    }

    #[test]
    fn same_inputs_give_same_fingerprint() {
        let p = Preset::from_toml(TINY).unwrap();
        assert_eq!(of(&p, tables()), of(&p, tables()));
    }

    #[test]
    fn preset_size_changes_fingerprint() {
        let p = Preset::from_toml(TINY).unwrap();
        let mut q = p.clone();
        q.postflop.first_bet_pot = vec![0.75];
        assert_ne!(of(&p, tables()), of(&q, tables()));
    }

    #[test]
    fn tree_node_changes_fingerprint() {
        let p = Preset::from_toml(TINY).unwrap();
        let mut q = p.clone();
        q.stack = 420;
        let abstraction = Abstraction::new(tables());
        let tree = Tree::build(&p);
        let other = Tree::build(&q);
        assert_ne!(tree.serialize(), other.serialize());
        assert_ne!(
            fingerprint(&p, &tree, &abstraction),
            fingerprint(&p, &other, &abstraction)
        );
    }

    fn with_tree(preset: &Preset) -> [u8; 32] {
        let base = Preset::from_toml(TINY).unwrap();
        fingerprint(preset, &Tree::build(&base), &Abstraction::new(tables()))
    }

    #[test]
    fn run_settings_leave_fingerprint_unchanged() {
        let p = Preset::from_toml(TINY).unwrap();
        let base = with_tree(&p);
        let edits: [fn(&mut Preset); 8] = [
            |q| q.threads = 12,
            |q| q.checkpoint_minutes = 60,
            |q| q.memory_limit_gb = 3.0,
            |q| q.name = "other".to_string(),
            |q| q.cfr.alpha = 1.0,
            |q| q.cfr.beta = 0.5,
            |q| q.cfr.gamma = 1.0,
            |q| q.cfr.discount_interval = 7,
        ];
        for (i, edit) in edits.into_iter().enumerate() {
            let mut q = p.clone();
            edit(&mut q);
            assert_eq!(base, with_tree(&q), "edit {i}");
        }
    }

    #[test]
    fn game_settings_change_fingerprint() {
        let p = Preset::from_toml(TINY).unwrap();
        let base = with_tree(&p);
        let edits: [fn(&mut Preset); 13] = [
            |q| q.small_blind = 5,
            |q| q.big_blind = 30,
            |q| q.stack = 500,
            |q| q.buckets[1] = 9,
            |q| q.preflop.open_bb = Sizes(vec![3.0]),
            |q| q.preflop.three_bet_x = Sizes(vec![3.5]),
            |q| q.postflop.first_bet_pot = vec![0.5],
            |q| q.postflop.first_raise_pot = vec![1.0],
            |q| q.postflop.max_aggressive = 3,
            |q| q.postflop.all_in_threshold = 0.5,
            |q| q.preflop.iso_vs_limp_bb = Sizes(vec![4.0]),
            |q| q.postflop.min_raise = true,
            |q| q.bucketing = crate::preset::Bucketing::Potential,
        ];
        for (i, edit) in edits.into_iter().enumerate() {
            let mut q = p.clone();
            edit(&mut q);
            assert_ne!(base, with_tree(&q), "edit {i}");
        }
    }

    #[test]
    fn bucket_byte_changes_fingerprint() {
        let p = Preset::from_toml(TINY).unwrap();
        let base = of(&p, tables());
        for street in 0..3 {
            let mut t = tables();
            t[street][1] ^= 1;
            assert_ne!(base, of(&p, t), "street {street}");
        }
    }
}
