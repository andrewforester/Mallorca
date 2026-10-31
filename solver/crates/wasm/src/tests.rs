use super::*;
use mallorca_core::preset::Preset;
use mallorca_core::strategy::{quantize, StrategyFile, StrategyHeader};
use mallorca_core::tree::{Node, Street, Tree};

const TINY: &str = include_str!("../../../presets/tiny.toml");
const FLOP_CLASSES: usize = 1_286_792;

fn uniform_file() -> StrategyFile {
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
    StrategyFile::new(header, tree, vec![flop], probabilities)
}

fn play_file() -> Vec<u8> {
    let t: Vec<f32> = (1..8).map(|i| i as f32 / 8.0).collect();
    uniform_file()
        .with_thresholds(vec![(Street::Turn, t.clone()), (Street::River, t)])
        .to_bytes()
}

fn centroid_file() -> Vec<u8> {
    let turn: Vec<f32> = (0..8)
        .flat_map(|k| (0..50).map(move |bin| if bin == k * 7 { 1.0 } else { 0.0 }))
        .collect();
    let river: Vec<f32> = (0..8)
        .flat_map(|k| (0..8).map(move |_| k as f32 / 7.0))
        .collect();
    let clusters = std::array::from_fn(|i| (i % 8) as u8);
    uniform_file()
        .with_centroids(vec![(Street::Turn, turn), (Street::River, river)], clusters)
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
fn a_bot_plays_a_hand_on_a_centroid_file() {
    let bytes = centroid_file();
    assert_eq!(u16::from_le_bytes([bytes[4], bytes[5]]), 3);
    let model = loaded(&bytes);
    assert!(model >= 0, "{model}");
    let bot = bot_new(model);
    assert!(bot >= 0);
    hand_started(bot, 0, 400, 400, 10, 20);
    hole_cards(bot, 48, 45);
    acted(bot, 0, KIND_CALL, 0, 0.5);
    assert_eq!(decide(bot, 0, 1, -1, 40, 400, 0.0), KIND_CHECK);
    acted(bot, 1, KIND_CHECK, 0, 0.0);
    let boards: [(u32, [u32; 5]); 3] = [
        (3, [0, 21, 38, 0, 0]),
        (4, [0, 21, 38, 9, 0]),
        (5, [0, 21, 38, 9, 30]),
    ];
    for (count, b) in boards {
        street(bot, count, b[0], b[1], b[2], b[3], b[4]);
        assert_eq!(decide(bot, 0, 1, -1, 20, 400, 0.0), KIND_CHECK);
        acted(bot, 1, KIND_CHECK, 0, 0.0);
        acted(bot, 0, KIND_CHECK, 0, 0.5);
    }
    bot_free(bot);
}

#[test]
fn unknown_handles_are_harmless() {
    assert_eq!(bot_new(9999), -1);
    hand_started(9999, 1, 400, 400, 10, 20);
    bot_style(9999, 1.25, 1.3, 0.85);
    bot_style(-1, 1.25, 1.3, 0.85);
    assert_eq!(decide(9999, 1, 0, 10, -1, -1, 0.5), KIND_NONE);
}

#[test]
fn a_styled_bot_keeps_its_style_and_plays_legal_moves() {
    let model = loaded(&play_file());
    let bot = bot_new(model);
    bot_style(bot, 1.25, 1.3, 0.85);
    for draw in [0.0, 0.3, 0.6, 0.99] {
        hand_started(bot, 1, 400, 400, 10, 20);
        hole_cards(bot, 48, 49);
        let kind = decide(bot, 1, 0, 10, 40, 400, draw);
        assert!([KIND_FOLD, KIND_CALL, KIND_RAISE].contains(&kind), "{kind}");
    }
    let style = with_seat(bot, None, |s| Some(s.bot.style()));
    assert_eq!(
        style,
        Some(Style {
            aggression: 1.25,
            bluff: 1.3,
            tightness: 0.85,
        })
    );
    bot_free(bot);
    bot_style(bot, 1.0, 1.0, 1.0);
}
