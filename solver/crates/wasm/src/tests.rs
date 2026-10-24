use super::*;
use mallorca_core::preset::Preset;
use mallorca_core::strategy::{quantize, StrategyFile, StrategyHeader};
use mallorca_core::tree::{Node, Street, Tree};

const TINY: &str = include_str!("../../../presets/tiny.toml");
const FLOP_CLASSES: usize = 1_286_792;

fn play_file() -> Vec<u8> {
    let preset = Preset::from_toml(TINY).unwrap();
    let tree = Tree::build(&preset);
    let mut probabilities = Vec::new();
    for node in tree.nodes() {
        if let Node::Decision {
            street, actions, ..
        } = node
        {
            for _ in 0..tree.buckets()[street.as_index()] {
                probabilities.extend(quantize(&vec![1.0; actions.len()]));
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
        .to_bytes()
}

fn loaded(bytes: &[u8]) -> i32 {
    let ptr = alloc(bytes.len() as u32);
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len()) };
    load(ptr, bytes.len() as u32)
}

#[test]
fn a_bad_file_gives_a_negative_code() {
    assert_eq!(loaded(b"nope, not a strategy"), -1);
    let mut bytes = play_file();
    bytes[4] = 9;
    assert_eq!(loaded(&bytes), -2);
    bytes[4] = 2;
    bytes.truncate(20);
    assert_eq!(loaded(&bytes), -3);
}

#[test]
fn a_bot_plays_a_hand_through_the_abi() {
    let model = loaded(&play_file());
    assert!(model >= 0, "{model}");
    let bot = bot_new(model);
    assert!(bot >= 0);
    hand_started(bot, 1, 400, 400, 10, 20);
    hole_cards(bot, 48, 49);
    let kind = decide(bot, 1, 0, 10, 40, 400, 0.99);
    assert_eq!(kind, KIND_RAISE);
    assert_eq!(decided_to(bot), 400);
    acted(bot, 1, kind, decided_to(bot), 0.5);
    acted(bot, 0, KIND_CALL, 0, 0.5);
    street(bot, 3, 0, 4, 8, 0, 0);
    let kind = decide(bot, 0, 1, -1, -1, -1, 0.0);
    assert_eq!(kind, KIND_CHECK);
    bot_free(bot);
    assert_eq!(decide(bot, 0, 1, -1, -1, -1, 0.0), KIND_NONE);
}

#[test]
fn unknown_handles_are_harmless() {
    assert_eq!(bot_new(9999), -1);
    hand_started(9999, 1, 400, 400, 10, 20);
    assert_eq!(decide(9999, 1, 0, 10, -1, -1, 0.5), KIND_NONE);
}

#[test]
fn bot_solver_turns_the_solver_on() {
    let model = loaded(&play_file());
    let bot = bot_new(model);
    bot_solver(bot, 4, 8);
    hand_started(bot, 1, 400, 400, 10, 20);
    hole_cards(bot, 48, 49);
    acted(bot, 1, KIND_CALL, 0, 0.5);
    acted(bot, 0, KIND_CHECK, 0, 0.5);
    street(bot, 3, 0, 4, 8, 0, 0);
    acted(bot, 0, KIND_CHECK, 0, 0.5);
    acted(bot, 1, KIND_CHECK, 0, 0.5);
    street(bot, 4, 0, 4, 8, 13, 0);
    acted(bot, 0, KIND_CHECK, 0, 0.5);
    let kind = decide(bot, 0, 1, -1, 20, 380, 0.3);
    assert!(kind == KIND_CHECK || kind == KIND_RAISE, "{kind}");
    bot_solver(9999, 4, 8);
    bot_free(bot);
}
