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

fn play_strategy() -> StrategyFile {
    let t: Vec<f32> = (1..8).map(|i| i as f32 / 8.0).collect();
    uniform_file().with_thresholds(vec![(Street::Turn, t.clone()), (Street::River, t)])
}

fn play_file() -> Vec<u8> {
    play_strategy().to_bytes()
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

fn seated(hole: [u32; 2]) -> i32 {
    let model = loaded(&play_file());
    assert!(model >= 0, "{model}");
    let bot = bot_new(model);
    assert!(bot >= 0);
    hand_started(bot, 1, 400, 400, 10, 20);
    hole_cards(bot, hole[0], hole[1]);
    bot
}

#[test]
fn a_raise_minimum_above_the_maximum_plays_passive() {
    let bot = seated([48, 49]);
    assert_eq!(decide(bot, 1, 0, 10, 400, 40, 0.99), KIND_CALL);
    assert_eq!(decide(bot, 1, 0, 10, 40, 400, 0.99), KIND_RAISE);
    bot_free(bot);
}

#[test]
fn invalid_hole_cards_play_passive() {
    for hole in [[48, 48], [48, 100], [52, 49], [u32::MAX, 49]] {
        let bot = seated(hole);
        assert_eq!(decide(bot, 1, 0, 10, 40, 400, 0.99), KIND_CALL, "{hole:?}");
        bot_free(bot);
    }
}

#[test]
fn a_board_that_repeats_a_card_plays_passive() {
    for board in [[48, 4, 8], [0, 0, 8], [0, 4, 60]] {
        let bot = seated([48, 49]);
        acted(bot, 1, KIND_CALL, 0, 0.5);
        acted(bot, 0, KIND_CHECK, 0, 0.5);
        street(bot, 3, board[0], board[1], board[2], 0, 0);
        assert_eq!(
            decide(bot, 0, 1, -1, 20, 400, 0.99),
            KIND_CHECK,
            "{board:?}"
        );
        bot_free(bot);
    }
}

#[test]
fn a_tree_with_too_few_preflop_buckets_is_refused() {
    let file = play_strategy();
    let mut tree = file.tree.serialize();
    tree[..2].copy_from_slice(&8u16.to_le_bytes());
    let mut bytes = file.to_bytes();
    let at = 67;
    bytes[at..at + 2].copy_from_slice(&tree[..2]);
    let preflop_slots: usize = file
        .tree
        .nodes()
        .iter()
        .map(|n| match n {
            Node::Decision {
                street: Street::Preflop,
                actions,
                ..
            } => (169 - 8) * actions.len(),
            _ => 0,
        })
        .sum();
    bytes.truncate(bytes.len() - preflop_slots);
    assert_eq!(loaded(&bytes), -6);
}

#[test]
fn a_raise_is_the_answer_when_it_is_the_only_legal_move() {
    for hole in [[48, 49], [48, 48]] {
        for draw in [0.0, 0.5, 0.99] {
            let bot = seated(hole);
            assert_eq!(decide(bot, 0, 0, -1, 40, 400, draw), KIND_RAISE);
            assert!((40..=400).contains(&decided_to(bot)), "{}", decided_to(bot));
            bot_free(bot);
        }
    }
}

#[test]
fn unknown_handles_are_harmless() {
    assert_eq!(bot_new(9999), -1);
    hand_started(9999, 1, 400, 400, 10, 20);
    bot_style(9999, 1.25, 1.3, 0.85, 1.0, 1.0);
    bot_style(-1, 1.25, 1.3, 0.85, 1.0, 1.0);
    assert_eq!(decide(9999, 1, 0, 10, -1, -1, 0.5), KIND_NONE);
}

#[test]
fn a_styled_bot_keeps_its_style_and_plays_legal_moves() {
    let model = loaded(&play_file());
    let bot = bot_new(model);
    bot_style(bot, 1.25, 1.3, 0.85, 1.2, 1.4);
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
            sizing: 1.2,
            stickiness: 1.4,
        })
    );
    bot_free(bot);
    bot_style(bot, 1.0, 1.0, 1.0, 1.0, 1.0);
}

#[test]
fn a_freed_model_keeps_its_bots_and_refuses_new_ones() {
    let model = loaded(&play_file());
    let bot = bot_new(model);
    model_free(model);
    assert_eq!(bot_new(model), -1);
    hand_started(bot, 1, 400, 400, 10, 20);
    hole_cards(bot, 48, 49);
    assert_eq!(decide(bot, 1, 0, 10, 40, 400, 0.99), KIND_RAISE);
    bot_free(bot);
    model_free(model);
    model_free(-1);
}

#[test]
fn a_freed_bot_handle_stays_dead_when_its_slot_is_reused() {
    let first = seated([48, 49]);
    bot_free(first);
    let second = seated([48, 49]);
    assert_ne!(first, second);
    assert_eq!(decide(first, 1, 0, 10, 40, 400, 0.99), KIND_NONE);
    assert_eq!(decide(second, 1, 0, 10, 40, 400, 0.99), KIND_RAISE);
    bot_free(second);
}

#[test]
fn a_buffer_that_alloc_did_not_hand_out_is_refused_untouched() {
    let mut bytes = play_file();
    assert_eq!(load(bytes.as_mut_ptr(), bytes.len() as u32), -8);
    let ptr = alloc(16);
    assert_eq!(load(ptr, 8), -8);
    assert_eq!(load(ptr, 16), -1);
    assert_eq!(load(ptr, 16), -8);
    assert_eq!(load(std::ptr::null_mut(), 0), -8);
}

#[test]
fn an_unknown_action_kind_abandons_the_hand_instead_of_raising() {
    for kind in [4, KIND_NONE, u32::MAX] {
        let bot = seated([48, 49]);
        assert!(with_seat(bot, None, |s| s.bot.cursor()).is_some());
        acted(bot, 1, kind, 400, 0.5);
        assert_eq!(with_seat(bot, Some(0), |s| s.bot.cursor()), None, "{kind}");
        for draw in [0.0, 0.5, 0.99] {
            assert_eq!(decide(bot, 1, 0, 10, 40, 400, draw), KIND_CALL, "{kind}");
        }
        bot_free(bot);
    }
}

fn read(ptr: *const f32, len: usize) -> Vec<f32> {
    assert!(!ptr.is_null());
    unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec()
}

fn core_bot(hole: [u8; 2]) -> (mallorca_core::bot::Model, Bot) {
    let model = Model::new(play_strategy()).unwrap();
    let mut bot = Bot::new();
    bot.hand_started(&model, true, [400, 400], [10, 20]);
    bot.hole_cards(hole);
    (model, bot)
}

const OPEN: Legal = Legal {
    fold: true,
    check: false,
    call: Some(10),
    raise: Some((40, 400)),
};

#[test]
fn range_of_a_fresh_hand_is_uniform() {
    let bot = seated([48, 49]);
    let range = read(bot_range(bot), 1326);
    assert!(range.iter().all(|&w| w == 1.0));
    bot_free(bot);
}

#[test]
fn spot_layout_matches_the_core_spot() {
    let (model, core) = core_bot([48, 49]);
    let expected = core.spot(&model, &OPEN).unwrap();
    let bot = seated([48, 49]);
    let n = expected.moves.len();
    let head = read(bot_spot(bot, 1, 0, 10, 40, 400), 2 + 2 * n);
    assert_eq!(head[0], 0.0);
    assert_eq!(head[1], n as f32);
    for (k, mv) in expected.moves.iter().enumerate() {
        let (kind, to) = match *mv {
            Move::Fold => (KIND_FOLD, 0),
            Move::Check => (KIND_CHECK, 0),
            Move::Call => (KIND_CALL, 0),
            Move::RaiseTo(to) => (KIND_RAISE, to),
        };
        assert_eq!(head[2 + 2 * k], kind as f32, "{mv:?}");
        assert_eq!(head[3 + 2 * k], to as f32, "{mv:?}");
    }
    bot_free(bot);
}

#[test]
fn grid_matches_the_core_grid() {
    let (model, core) = core_bot([48, 49]);
    let spot = core.spot(&model, &OPEN).unwrap();
    let expected = core.strategy_grid(&model, &spot);
    let bot = seated([48, 49]);
    assert!(!bot_spot(bot, 1, 0, 10, 40, 400).is_null());
    assert_eq!(read(bot_spot_grid(bot), expected.len()), expected);
    bot_free(bot);
}

#[test]
fn the_range_narrows_after_a_decision() {
    let bot = seated([48, 49]);
    let kind = decide(bot, 1, 0, 10, 40, 400, 0.99);
    acted(bot, 1, kind, decided_to(bot), 0.5);
    let range = read(bot_range(bot), 1326);
    assert!(range.iter().any(|&w| w != 1.0));
    bot_free(bot);
}

#[test]
fn the_opponent_range_narrows_after_his_action_without_her_cards() {
    let bot = seated([48, 49]);
    let before = read(bot_opponent_range(bot), 1326);
    let kind = decide(bot, 1, 0, 10, 40, 400, 0.99);
    acted(bot, 1, kind, decided_to(bot), 0.5);
    acted(bot, 0, KIND_CALL, 0, 0.5);
    let after = read(bot_opponent_range(bot), 1326);
    let hers = mallorca_core::pairs::pair_index(48, 49);
    assert_eq!((before[hers], after[hers]), (0.0, 0.0));
    assert!(before.iter().all(|&w| w == 0.0 || w == 1.0));
    assert!(after.iter().any(|&w| w > 0.0 && w < 1.0));
    bot_free(bot);
}

#[test]
fn unknown_seat_gives_null() {
    assert!(bot_range(9999).is_null());
    assert!(bot_opponent_range(9999).is_null());
    assert!(bot_spot(9999, 1, 0, 10, 40, 400).is_null());
    assert!(bot_spot_grid(9999).is_null());
}

#[test]
fn freed_seat_gives_null() {
    let bot = seated([48, 49]);
    assert!(!bot_spot(bot, 1, 0, 10, 40, 400).is_null());
    bot_free(bot);
    assert!(bot_range(bot).is_null());
    assert!(bot_opponent_range(bot).is_null());
    assert!(bot_spot(bot, 1, 0, 10, 40, 400).is_null());
    assert!(bot_spot_grid(bot).is_null());
}

#[test]
fn no_spot_gives_null_and_clears_the_grid() {
    let bot = seated([48, 48]);
    assert!(bot_spot(bot, 1, 0, 10, 40, 400).is_null());
    assert!(bot_spot_grid(bot).is_null());
    bot_free(bot);
}

#[test]
fn the_grid_needs_a_fresh_spot_after_the_hand_moves() {
    let bot = seated([48, 49]);
    assert!(!bot_spot(bot, 1, 0, 10, 40, 400).is_null());
    acted(bot, 1, KIND_CALL, 0, 0.5);
    assert!(bot_spot_grid(bot).is_null());
    bot_free(bot);
}
