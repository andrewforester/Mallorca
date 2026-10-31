pub mod lbr;
pub mod play;
pub mod policy;
pub mod stats;

#[cfg(test)]
pub(crate) mod fixtures {
    use crate::abstraction::Abstraction;
    use crate::cfr::{iterate, Game, Storage};
    use crate::holdem::Holdem;
    use crate::preset::{Preset, Sizes};
    use crate::rng::Rng;
    use crate::strategy::{quantize, StrategyFile, StrategyHeader};
    use crate::tree::{Node, Tree};
    use std::sync::OnceLock;

    const TINY: &str = include_str!("../../../../presets/tiny.toml");
    const V1: &str = include_str!("../../../../presets/v1.toml");
    const SIZES: [usize; 3] = [1_286_792, 13_960_050, 123_156_254];
    pub const TRAIN_ITERATIONS: u64 = 20_000;

    pub fn tiny_tree() -> &'static Tree {
        static T: OnceLock<Tree> = OnceLock::new();
        T.get_or_init(|| Tree::build(&Preset::from_toml(TINY).unwrap()))
    }

    pub fn v1_tree() -> &'static Tree {
        static T: OnceLock<Tree> = OnceLock::new();
        T.get_or_init(|| Tree::build(&Preset::from_toml(V1).unwrap()))
    }

    fn tables() -> Vec<Vec<u8>> {
        SIZES
            .iter()
            .map(|&n| (0..n).map(|i| (i % 8) as u8).collect())
            .collect()
    }

    pub fn trained() -> &'static StrategyFile {
        static F: OnceLock<StrategyFile> = OnceLock::new();
        F.get_or_init(|| train(tiny_tree().clone(), 400))
    }

    pub fn trained_multi_open() -> &'static StrategyFile {
        static F: OnceLock<StrategyFile> = OnceLock::new();
        F.get_or_init(|| {
            let mut preset = Preset::from_toml(TINY).unwrap();
            preset.preflop.open_bb = Sizes(vec![2.0, 3.0, 4.0]);
            preset.stack = 2000;
            train(Tree::build(&preset), preset.stack)
        })
    }

    fn train(tree: Tree, stack: u32) -> StrategyFile {
        {
            let tables = tables();
            let abstraction = Abstraction::new(tables.clone().try_into().unwrap());
            let game = Holdem::new(&tree, &abstraction);
            let storage = Storage::new(game.infoset_len());
            let mut rng = Rng::new(17);
            for i in 0..TRAIN_ITERATIONS {
                iterate(&game, &storage, (i % 2) as u8, &mut rng);
            }
            let mut probabilities = Vec::new();
            for (id, node) in tree.nodes().iter().enumerate() {
                let Node::Decision {
                    street, actions, ..
                } = node
                else {
                    continue;
                };
                for bucket in 0..tree.buckets()[street.as_index()] {
                    let offset = tree.offset(id as u32, bucket);
                    probabilities
                        .extend(quantize(&storage.average_strategy(offset, actions.len())));
                }
            }
            let header = StrategyHeader {
                fingerprint: [0; 32],
                small_blind: 10,
                big_blind: 20,
                stack,
                streets: 0b1111,
                iterations: TRAIN_ITERATIONS,
                checkpoint: 1,
            };
            StrategyFile::new(header, tree, tables, probabilities)
        }
    }

    pub fn abstraction() -> &'static Abstraction {
        static A: OnceLock<Abstraction> = OnceLock::new();
        A.get_or_init(|| Abstraction::from_strategy(trained()).unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use crate::abstraction::Abstraction;
    use crate::cards::Card;
    use crate::rng::Rng;
    use crate::strategy::StrategyError;
    use crate::strength::{bucket_of, river_hs, turn_value};
    use crate::tree::Street;

    #[test]
    fn abstraction_from_a_full_file_matches_its_tables() {
        let file = trained();
        let abstraction = Abstraction::from_strategy(file).unwrap();
        for (street, table) in [Street::Flop, Street::Turn, Street::River]
            .into_iter()
            .zip(&file.tables)
        {
            assert_eq!(abstraction.table_bytes(street), &table[..]);
        }
    }

    #[test]
    fn abstraction_needs_every_postflop_street() {
        let mut file = trained().clone();
        file.streets = 0b0011;
        file.tables.truncate(1);
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::MissingStreet(Street::Turn))
        );
    }

    #[test]
    fn abstraction_refuses_a_bucket_beyond_the_tree() {
        let mut file = trained().clone();
        file.tables[1][1000] = 8;
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::BucketOutOfRange(Street::Turn))
        );
        let mut file = trained().clone();
        *file.tables[0].last_mut().unwrap() = 200;
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::BucketOutOfRange(Street::Flop))
        );
    }

    fn play_file(flop_thresholds: bool) -> crate::strategy::StrategyFile {
        let t: Vec<f32> = (1..8).map(|i| i as f32 / 8.0).collect();
        let mut file = trained().clone();
        let mut thresholds = vec![(Street::Turn, t.clone()), (Street::River, t)];
        if flop_thresholds {
            file.tables.clear();
            thresholds.insert(0, (Street::Flop, thresholds[0].1.clone()));
        } else {
            file.tables.truncate(1);
        }
        file.with_thresholds(thresholds)
    }

    #[test]
    fn abstraction_from_a_play_file_computes_turn_and_river() {
        let file = play_file(false);
        let t = file.thresholds_of(Street::Turn).unwrap().to_vec();
        let live = Abstraction::from_strategy(&file).unwrap();
        let tables = abstraction();
        let mut rng = Rng::new(3);
        for _ in 0..4 {
            let mut deck: Vec<Card> = (0..52).collect();
            rng.shuffle(&mut deck);
            let hole = [deck[0], deck[1]];
            assert_eq!(
                live.bucket(Street::Flop, hole, &deck[2..5]),
                tables.bucket(Street::Flop, hole, &deck[2..5])
            );
            let turn: [Card; 4] = deck[2..6].try_into().unwrap();
            assert_eq!(
                live.bucket(Street::Turn, hole, &turn),
                bucket_of(&t, turn_value(hole, &turn))
            );
            let river: [Card; 5] = deck[2..7].try_into().unwrap();
            assert_eq!(
                live.bucket(Street::River, hole, &river),
                bucket_of(&t, river_hs(hole, &river))
            );
        }
    }

    #[test]
    fn abstraction_needs_a_flop_table() {
        assert_eq!(
            Abstraction::from_strategy(&play_file(true)).err(),
            Some(StrategyError::MissingStreet(Street::Flop))
        );
    }

    #[test]
    fn abstraction_refuses_a_table_of_the_wrong_size() {
        let mut file = trained().clone();
        file.tables[2].pop();
        assert_eq!(
            Abstraction::from_strategy(&file).err(),
            Some(StrategyError::Inconsistent)
        );
    }
}
