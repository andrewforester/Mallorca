pub mod exact;
pub mod kuhn;
pub mod leduc;

pub use exact::{exploitability, ExactGame};
pub use kuhn::KuhnPoker;
pub use leduc::LeducPoker;

pub(crate) fn train<G: crate::cfr::Game>(
    game: &G,
    iterations: u64,
    params: &crate::preset::CfrParams,
    seed: u64,
) -> crate::cfr::Storage {
    let storage = crate::cfr::Storage::new(game.infoset_len());
    let mut rng = crate::rng::Rng::new(seed);
    for i in 0..iterations {
        crate::cfr::iterate(game, &storage, (i % 2) as u8, &mut rng);
        if (i + 1) % params.discount_interval == 0 {
            storage.discount((i + 1) / params.discount_interval, params);
        }
    }
    storage
}
