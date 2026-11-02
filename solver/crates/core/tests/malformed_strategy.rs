use mallorca_core::bot::{Bot, Legal, Model, Move};
use mallorca_core::cards::Card;
use mallorca_core::preset::Preset;
use mallorca_core::rng::Rng;
use mallorca_core::strategy::{quantize, StrategyError, StrategyFile, StrategyHeader};
use mallorca_core::tree::{Node, Street, Tree};

const TINY: &str = include_str!("../../../presets/tiny.toml");
const FLOP_CLASSES: usize = 1_286_792;
const MUTATIONS: usize = 400;
const THRESHOLD_SECTION: usize = 2 * (1 + 2 + 7 * 4);

fn tiny_tree() -> Tree {
    Tree::build(&Preset::from_toml(TINY).unwrap())
}

fn file_for(tree: Tree) -> StrategyFile {
    let mut probabilities = Vec::new();
    for (i, node) in tree.nodes().iter().enumerate() {
        if let Node::Decision {
            street, actions, ..
        } = node
        {
            for b in 0..tree.buckets()[street.as_index()] {
                let weights: Vec<f32> = (0..actions.len())
                    .map(|a| ((i + a + usize::from(b)) % 3) as f32)
                    .collect();
                probabilities.extend(quantize(&weights));
            }
        }
    }
    let header = StrategyHeader {
        fingerprint: [1; 32],
        small_blind: 10,
        big_blind: 20,
        stack: 400,
        streets: 0b1111,
        iterations: 1,
        checkpoint: 1,
    };
    let flop = (0..FLOP_CLASSES).map(|i| (i % 8) as u8).collect();
    let t: Vec<f32> = (1..8).map(|i| i as f32 / 8.0).collect();
    StrategyFile::new(header, tree, vec![flop], probabilities)
        .with_thresholds(vec![(Street::Turn, t.clone()), (Street::River, t)])
}

fn amount(rng: &mut Rng) -> u32 {
    match rng.below(5) {
        0 => 0,
        1 => u32::MAX - rng.below(100),
        _ => rng.below(1000),
    }
}

fn card(rng: &mut Rng) -> Card {
    if rng.below(10) == 0 {
        (52 + rng.below(204)) as Card
    } else {
        rng.below(52) as Card
    }
}

fn legal(rng: &mut Rng) -> Legal {
    Legal {
        fold: rng.below(2) == 0,
        check: rng.below(2) == 0,
        call: (rng.below(2) == 0).then(|| amount(rng)),
        raise: (rng.below(2) == 0).then(|| (amount(rng), amount(rng))),
    }
}

fn any_move(rng: &mut Rng) -> Move {
    match rng.below(4) {
        0 => Move::Fold,
        1 => Move::Check,
        2 => Move::Call,
        _ => Move::RaiseTo(amount(rng)),
    }
}

fn play(model: &Model, rng: &mut Rng) {
    let mut bot = Bot::new();
    let stacks = [amount(rng), amount(rng)];
    let blinds = [amount(rng), amount(rng)];
    bot.hand_started(model, rng.below(2) == 0, stacks, blinds);
    bot.hole_cards([card(rng), card(rng)]);
    for count in [0, 3, 4, 5] {
        if count > 0 {
            let board: Vec<Card> = (0..count).map(|_| card(rng)).collect();
            bot.street(model, &board);
        }
        for _ in 0..2 {
            let mv = bot.decide(model, &legal(rng), rng.next_f64());
            bot.acted(model, true, mv, rng.next_f64());
            bot.acted(model, false, any_move(rng), rng.next_f64());
        }
    }
}

fn overwrite(bytes: &mut [u8], region: (usize, usize), rng: &mut Rng) {
    let (start, end) = region;
    let at = |rng: &mut Rng, width: usize| start + rng.below((end - start - width) as u32) as usize;
    if rng.below(2) == 0 {
        for _ in 0..1 + rng.below(4) {
            let i = at(rng, 1);
            bytes[i] = rng.below(256) as u8;
        }
    } else {
        let i = at(rng, 4);
        let value = match rng.below(3) {
            0 => 0,
            1 => u32::MAX,
            _ => rng.next_u64() as u32,
        };
        bytes[i..i + 4].copy_from_slice(&value.to_le_bytes());
    }
}

#[test]
fn a_tree_with_too_few_preflop_buckets_is_refused() {
    let mut tree = tiny_tree().serialize();
    tree[..2].copy_from_slice(&8u16.to_le_bytes());
    let tree = Tree::deserialize(&tree).unwrap();
    let file = StrategyFile::from_bytes(&file_for(tree).to_bytes()).unwrap();
    assert_eq!(
        Model::new(file).err(),
        Some(StrategyError::BucketOutOfRange(Street::Preflop))
    );
}

#[test]
fn random_hands_on_a_valid_model_never_panic() {
    let model = Model::new(file_for(tiny_tree())).unwrap();
    let mut rng = Rng::new(32);
    for _ in 0..200 {
        play(&model, &mut rng);
    }
}

#[test]
fn random_bytes_never_panic() {
    let mut rng = Rng::new(7);
    for _ in 0..2000 {
        let len = rng.below(400) as usize;
        let mut bytes: Vec<u8> = (0..len).map(|_| rng.below(256) as u8).collect();
        if len >= 6 && rng.below(2) == 0 {
            bytes[..4].copy_from_slice(b"MLCS");
            bytes[4] = 1 + rng.below(3) as u8;
            bytes[5] = 0;
        }
        if let Ok(model) = StrategyFile::from_bytes(&bytes).and_then(Model::new) {
            play(&model, &mut rng);
        }
    }
}

#[test]
fn mutated_files_never_panic() {
    let file = file_for(tiny_tree());
    let valid = file.to_bytes();
    let probabilities = valid.len() - file.probabilities.len();
    let tree = 63 + 4 + file.tree.serialize().len();
    let regions = [
        (0, tree),
        (probabilities - THRESHOLD_SECTION, probabilities),
        (probabilities, valid.len()),
    ];
    let mut rng = Rng::new(32);
    let mut models = 0;
    for _ in 0..MUTATIONS {
        let mut bytes = valid.clone();
        if rng.below(8) == 0 {
            bytes.truncate(rng.below(valid.len() as u32) as usize);
        } else {
            let region = regions[rng.below(regions.len() as u32) as usize];
            overwrite(&mut bytes, region, &mut rng);
        }
        if let Ok(model) = StrategyFile::from_bytes(&bytes).and_then(Model::new) {
            models += 1;
            play(&model, &mut rng);
        }
    }
    assert!(models >= MUTATIONS / 4, "{models}");
}
