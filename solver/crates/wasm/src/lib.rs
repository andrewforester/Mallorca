mod buffers;
mod slots;

use buffers::Buffers;
use mallorca_core::bot::{Bot, Legal, Model, Move, SpotView, Style};
use mallorca_core::cards::Card;
use mallorca_core::strategy::{StrategyError, StrategyFile};
use slots::Slots;
use std::sync::{Arc, Mutex, MutexGuard};

pub const KIND_FOLD: u32 = 0;
pub const KIND_CHECK: u32 = 1;
pub const KIND_CALL: u32 = 2;
pub const KIND_RAISE: u32 = 3;
pub const KIND_NONE: u32 = 9;
pub const NO_MODEL_SLOT: i32 = -7;
pub const NOT_ALLOCATED: i32 = -8;

struct Seat {
    model: Arc<Model>,
    bot: Bot,
    to: u32,
    range: Vec<f32>,
    opponent_range: Vec<f32>,
    spot: Option<SpotView>,
    head: Vec<f32>,
    grid: Vec<f32>,
}

struct Registry {
    buffers: Buffers,
    models: Slots<Arc<Model>>,
    bots: Slots<Seat>,
}

static REGISTRY: Mutex<Registry> = Mutex::new(Registry {
    buffers: Buffers::new(),
    models: Slots::new(),
    bots: Slots::new(),
});

fn registry() -> MutexGuard<'static, Registry> {
    REGISTRY.lock().unwrap_or_else(|e| e.into_inner())
}

fn with_seat<T>(bot: i32, fallback: T, f: impl FnOnce(&mut Seat) -> T) -> T {
    match registry().bots.get_mut(bot) {
        Some(seat) => f(seat),
        None => fallback,
    }
}

fn error_code(e: StrategyError) -> i32 {
    match e {
        StrategyError::BadMagic => -1,
        StrategyError::UnknownVersion(_) => -2,
        StrategyError::Truncated => -3,
        StrategyError::Inconsistent => -4,
        StrategyError::MissingStreet(_) => -5,
        StrategyError::BucketOutOfRange(_) => -6,
    }
}

fn to_move(kind: u32, to: u32) -> Option<Move> {
    match kind {
        KIND_FOLD => Some(Move::Fold),
        KIND_CHECK => Some(Move::Check),
        KIND_CALL => Some(Move::Call),
        KIND_RAISE => Some(Move::RaiseTo(to)),
        _ => None,
    }
}

fn from_move(mv: Move) -> (u32, u32) {
    match mv {
        Move::Fold => (KIND_FOLD, 0),
        Move::Check => (KIND_CHECK, 0),
        Move::Call => (KIND_CALL, 0),
        Move::RaiseTo(to) => (KIND_RAISE, to),
    }
}

fn legal_of(fold: i32, check: i32, call: i32, raise_min: i32, raise_max: i32) -> Legal {
    Legal {
        fold: fold != 0,
        check: check != 0,
        call: u32::try_from(call).ok(),
        raise: u32::try_from(raise_min)
            .ok()
            .zip(u32::try_from(raise_max).ok()),
    }
}

fn card(c: u32) -> Card {
    Card::try_from(c).unwrap_or(Card::MAX)
}

#[no_mangle]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    registry().buffers.alloc(len as usize)
}

#[no_mangle]
pub extern "C" fn load(ptr: *mut u8, len: u32) -> i32 {
    let Some(bytes) = registry().buffers.take(ptr, len as usize) else {
        return NOT_ALLOCATED;
    };
    let model = StrategyFile::from_bytes(&bytes).and_then(Model::new);
    drop(bytes);
    match model {
        Ok(model) => registry()
            .models
            .insert(Arc::new(model))
            .unwrap_or(NO_MODEL_SLOT),
        Err(e) => error_code(e),
    }
}

#[no_mangle]
pub extern "C" fn model_free(model: i32) {
    registry().models.remove(model);
}

#[no_mangle]
pub extern "C" fn bot_new(model: i32) -> i32 {
    let mut r = registry();
    let Some(model) = r.models.get(model) else {
        return -1;
    };
    let seat = Seat {
        model: Arc::clone(model),
        bot: Bot::new(),
        to: 0,
        range: Vec::new(),
        opponent_range: Vec::new(),
        spot: None,
        head: Vec::new(),
        grid: Vec::new(),
    };
    r.bots.insert(seat).unwrap_or(-1)
}

#[no_mangle]
pub extern "C" fn bot_free(bot: i32) {
    registry().bots.remove(bot);
}

#[no_mangle]
pub extern "C" fn hand_started(
    bot: i32,
    hero_button: i32,
    hero_stack: u32,
    villain_stack: u32,
    small_blind: u32,
    big_blind: u32,
) {
    with_seat(bot, (), |s| {
        s.spot = None;
        s.bot.hand_started(
            &s.model,
            hero_button != 0,
            [hero_stack, villain_stack],
            [small_blind, big_blind],
        );
    });
}

#[no_mangle]
pub extern "C" fn hole_cards(bot: i32, a: u32, b: u32) {
    with_seat(bot, (), |s| {
        s.spot = None;
        s.bot.hole_cards([card(a), card(b)]);
    });
}

#[no_mangle]
pub extern "C" fn bot_style(
    bot: i32,
    aggression: f64,
    bluff: f64,
    tightness: f64,
    sizing: f64,
    stickiness: f64,
) {
    with_seat(bot, (), |s| {
        s.bot.set_style(Style {
            aggression,
            bluff,
            tightness,
            sizing,
            stickiness,
        });
    });
}

#[no_mangle]
pub extern "C" fn street(bot: i32, count: u32, c0: u32, c1: u32, c2: u32, c3: u32, c4: u32) {
    let all = [c0, c1, c2, c3, c4].map(card);
    let board = &all[..(count as usize).clamp(3, 5)];
    with_seat(bot, (), |s| {
        s.spot = None;
        s.bot.street(&s.model, board);
    });
}

#[no_mangle]
pub extern "C" fn acted(bot: i32, hero: i32, kind: u32, to: u32, draw: f64) {
    with_seat(bot, (), |s| {
        s.spot = None;
        match to_move(kind, to) {
            Some(mv) => s.bot.acted(&s.model, hero != 0, mv, draw),
            None => s.bot.abandon_hand(),
        }
    });
}

#[no_mangle]
pub extern "C" fn decide(
    bot: i32,
    fold: i32,
    check: i32,
    call: i32,
    raise_min: i32,
    raise_max: i32,
    draw: f64,
) -> u32 {
    let legal = legal_of(fold, check, call, raise_min, raise_max);
    with_seat(bot, KIND_NONE, |s| {
        s.spot = None;
        let (kind, to) = from_move(s.bot.decide(&s.model, &legal, draw));
        s.to = to;
        kind
    })
}

#[no_mangle]
pub extern "C" fn decided_to(bot: i32) -> u32 {
    with_seat(bot, 0, |s| s.to)
}

#[no_mangle]
pub extern "C" fn bot_range(bot: i32) -> *const f32 {
    with_seat(bot, std::ptr::null(), |s| {
        s.range = s.bot.range(&s.model);
        s.range.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn bot_opponent_range(bot: i32) -> *const f32 {
    with_seat(bot, std::ptr::null(), |s| {
        s.opponent_range = s.bot.opponent_range(&s.model);
        s.opponent_range.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn bot_spot(
    bot: i32,
    fold: i32,
    check: i32,
    call: i32,
    raise_min: i32,
    raise_max: i32,
) -> *const f32 {
    let legal = legal_of(fold, check, call, raise_min, raise_max);
    with_seat(bot, std::ptr::null(), |s| {
        s.spot = s.bot.spot(&s.model, &legal);
        s.grid.clear();
        let Some(spot) = &s.spot else {
            return std::ptr::null();
        };
        s.head.clear();
        s.head.push(f32::from(u8::from(spot.approximate)));
        s.head.push(spot.moves.len() as f32);
        for &mv in &spot.moves {
            let (kind, to) = from_move(mv);
            s.head.push(kind as f32);
            s.head.push(to as f32);
        }
        s.head.as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn bot_spot_grid(bot: i32) -> *const f32 {
    with_seat(bot, std::ptr::null(), |s| {
        let Some(spot) = &s.spot else {
            return std::ptr::null();
        };
        s.grid = s.bot.strategy_grid(&s.model, spot);
        s.grid.as_ptr()
    })
}

#[cfg(test)]
mod tests;
