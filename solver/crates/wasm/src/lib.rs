use mallorca_core::bot::{Bot, Legal, Model, Move, SolverConfig};
use mallorca_core::cards::Card;
use mallorca_core::strategy::{StrategyError, StrategyFile};
use std::sync::{Arc, Mutex, MutexGuard};

pub const KIND_FOLD: u32 = 0;
pub const KIND_CHECK: u32 = 1;
pub const KIND_CALL: u32 = 2;
pub const KIND_RAISE: u32 = 3;
pub const KIND_NONE: u32 = 9;

struct Seat {
    model: Arc<Model>,
    bot: Bot,
    to: u32,
}

#[derive(Default)]
struct Registry {
    models: Vec<Arc<Model>>,
    bots: Vec<Option<Seat>>,
}

static REGISTRY: Mutex<Registry> = Mutex::new(Registry {
    models: Vec::new(),
    bots: Vec::new(),
});

fn registry() -> MutexGuard<'static, Registry> {
    REGISTRY.lock().unwrap_or_else(|e| e.into_inner())
}

fn with_seat<T>(bot: i32, fallback: T, f: impl FnOnce(&mut Seat) -> T) -> T {
    let mut r = registry();
    match usize::try_from(bot).ok().and_then(|i| r.bots.get_mut(i)) {
        Some(Some(seat)) => f(seat),
        _ => fallback,
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

fn to_move(kind: u32, to: u32) -> Move {
    match kind {
        KIND_FOLD => Move::Fold,
        KIND_CHECK => Move::Check,
        KIND_CALL => Move::Call,
        _ => Move::RaiseTo(to),
    }
}

fn card(c: u32) -> Card {
    (c % 52) as Card
}

#[no_mangle]
pub extern "C" fn alloc(len: u32) -> *mut u8 {
    let buffer = vec![0u8; len as usize].into_boxed_slice();
    Box::into_raw(buffer).cast::<u8>()
}

#[no_mangle]
pub extern "C" fn load(ptr: *mut u8, len: u32) -> i32 {
    let raw = std::ptr::slice_from_raw_parts_mut(ptr, len as usize);
    let bytes = unsafe { Box::from_raw(raw) };
    let model = StrategyFile::from_bytes(&bytes).and_then(Model::new);
    drop(bytes);
    match model {
        Ok(model) => {
            let mut r = registry();
            r.models.push(Arc::new(model));
            (r.models.len() - 1) as i32
        }
        Err(e) => error_code(e),
    }
}

#[no_mangle]
pub extern "C" fn bot_new(model: i32) -> i32 {
    let mut r = registry();
    let Some(model) = usize::try_from(model).ok().and_then(|i| r.models.get(i)) else {
        return -1;
    };
    let seat = Seat {
        model: Arc::clone(model),
        bot: Bot::new(),
        to: 0,
    };
    r.bots.push(Some(seat));
    (r.bots.len() - 1) as i32
}

#[no_mangle]
pub extern "C" fn bot_solver(bot: i32, turn_iterations: u32, river_iterations: u32) {
    with_seat(bot, (), |s| {
        s.bot.set_solver(Some(SolverConfig {
            turn_iterations,
            river_iterations,
        }));
    });
}

#[no_mangle]
pub extern "C" fn bot_free(bot: i32) {
    let mut r = registry();
    if let Some(slot) = usize::try_from(bot).ok().and_then(|i| r.bots.get_mut(i)) {
        *slot = None;
    }
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
    with_seat(bot, (), |s| s.bot.hole_cards([card(a), card(b)]));
}

#[no_mangle]
pub extern "C" fn street(bot: i32, count: u32, c0: u32, c1: u32, c2: u32, c3: u32, c4: u32) {
    let all = [c0, c1, c2, c3, c4].map(card);
    let board = &all[..(count as usize).clamp(3, 5)];
    with_seat(bot, (), |s| s.bot.street(&s.model, board));
}

#[no_mangle]
pub extern "C" fn acted(bot: i32, hero: i32, kind: u32, to: u32, draw: f64) {
    with_seat(bot, (), |s| {
        s.bot.acted(&s.model, hero != 0, to_move(kind, to), draw);
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
    let legal = Legal {
        fold: fold != 0,
        check: check != 0,
        call: u32::try_from(call).ok(),
        raise: u32::try_from(raise_min)
            .ok()
            .zip(u32::try_from(raise_max).ok()),
    };
    with_seat(bot, KIND_NONE, |s| {
        let mv = s.bot.decide(&s.model, &legal, draw);
        let (kind, to) = match mv {
            Move::Fold => (KIND_FOLD, 0),
            Move::Check => (KIND_CHECK, 0),
            Move::Call => (KIND_CALL, 0),
            Move::RaiseTo(to) => (KIND_RAISE, to),
        };
        s.to = to;
        kind
    })
}

#[no_mangle]
pub extern "C" fn decided_to(bot: i32) -> u32 {
    with_seat(bot, 0, |s| s.to)
}

#[cfg(test)]
mod tests;
