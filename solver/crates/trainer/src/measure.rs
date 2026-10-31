use clap::{Args, ValueEnum};
use mallorca_core::abstraction::Abstraction;
use mallorca_core::measure::play::{duplicate_match, MatchResult};
use mallorca_core::measure::policy::{
    AlwaysCall, AlwaysRaise, Policy, RandomPolicy, StrategyPolicy,
};
use mallorca_core::strategy::StrategyFile;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum Opponent {
    Call,
    Raise,
    Random,
    All,
}

#[derive(Args)]
pub struct MatchArgs {
    #[arg(long)]
    pub strategy: PathBuf,
    #[arg(long, value_enum)]
    pub opponent: Opponent,
    #[arg(long)]
    pub deals: u64,
    #[arg(long, default_value_t = 1)]
    pub seed: u64,
    #[arg(long, default_value_t = 2000)]
    pub stack: u32,
}

pub fn load_strategy(path: &Path) -> Result<(StrategyFile, Abstraction), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let file = StrategyFile::from_bytes(&bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    let abstraction =
        Abstraction::from_strategy(&file).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok((file, abstraction))
}

pub fn results(args: &MatchArgs) -> Result<Vec<(&'static str, MatchResult)>, String> {
    if args.deals == 0 {
        return Err("deals must be at least 1".to_string());
    }
    let (file, abstraction) = load_strategy(&args.strategy)?;
    if args.stack < file.stack {
        return Err(format!(
            "stack {} is below the strategy's {}",
            args.stack, file.stack
        ));
    }
    let tree = &file.tree;
    let strategy = StrategyPolicy {
        file: &file,
        abstraction: &abstraction,
    };
    let call = AlwaysCall { tree };
    let raise = AlwaysRaise { tree };
    let random = RandomPolicy { tree };
    let all: [(Opponent, &'static str, &dyn Policy); 3] = [
        (Opponent::Call, "call", &call),
        (Opponent::Raise, "raise", &raise),
        (Opponent::Random, "random", &random),
    ];
    Ok(all
        .into_iter()
        .filter(|(which, _, _)| args.opponent == Opponent::All || args.opponent == *which)
        .map(|(_, name, policy)| {
            let result =
                duplicate_match(tree, &strategy, policy, args.stack, args.deals, args.seed);
            (name, result)
        })
        .collect())
}

pub fn line(name: &str, r: &MatchResult) -> String {
    format!(
        "{name}: {:+.2} bb/100 ± {:.2} over {} deals",
        r.bb_per_100, r.ci95, r.deals
    )
}

pub fn run(args: &MatchArgs) -> Result<(), String> {
    for (name, result) in results(args)? {
        println!("{}", line(name, &result));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::{build, StreetSet};
    use crate::train::tests::{data_dir, go, session};
    use mallorca_core::strategy::StrategyHeader;
    use mallorca_core::tree::{Node, Street};

    fn exported(name: &str, iterations: u64) -> (PathBuf, PathBuf) {
        let dir = data_dir(name);
        go(&session(&dir, Some(iterations), 3, Some(1))).unwrap();
        let file = build(&dir.join("tiny.toml"), &dir, None, StreetSet::All).unwrap();
        let path = dir.join("strategy.bin");
        std::fs::write(&path, file.to_bytes()).unwrap();
        (dir, path)
    }

    fn args(strategy: &Path, opponent: Opponent, stack: u32) -> MatchArgs {
        MatchArgs {
            strategy: strategy.to_path_buf(),
            opponent,
            deals: 200,
            seed: 5,
            stack,
        }
    }

    #[test]
    fn all_opponents_give_one_result_each_in_order() {
        let (dir, path) = exported("match-all", 200);
        let results = results(&args(&path, Opponent::All, 400)).unwrap();
        let names: Vec<&str> = results.iter().map(|(n, _)| *n).collect();
        assert_eq!(names, ["call", "raise", "random"]);
        for (_, r) in &results {
            assert_eq!(r.deals, 200);
            assert!(r.bb_per_100.is_finite() && r.ci95 >= 0.0);
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn one_opponent_gives_one_result_and_is_reproducible() {
        let (dir, path) = exported("match-one", 200);
        let a = results(&args(&path, Opponent::Raise, 400)).unwrap();
        let b = results(&args(&path, Opponent::Raise, 400)).unwrap();
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].0, "raise");
        assert_eq!(a, b);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_deeper_stack_runs() {
        let (dir, path) = exported("match-deep", 200);
        assert!(results(&args(&path, Opponent::Call, 600)).is_ok());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_stack_below_the_blueprints_is_refused() {
        let (dir, path) = exported("match-shallow", 100);
        let err = results(&args(&path, Opponent::Call, 300)).err().unwrap();
        assert!(err.contains("400"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn zero_deals_are_refused() {
        let (dir, path) = exported("match-zero", 100);
        let mut a = args(&path, Opponent::Call, 400);
        a.deals = 0;
        assert!(results(&a).err().unwrap().contains("deals"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    fn preflop_and_flop_only(full: &StrategyFile) -> StrategyFile {
        let mut probabilities = Vec::new();
        for (id, node) in full.tree.nodes().iter().enumerate() {
            if let Node::Decision { street, .. } = node {
                if matches!(street, Street::Preflop | Street::Flop) {
                    for bucket in 0..full.tree.buckets()[street.as_index()] {
                        probabilities.extend_from_slice(full.probabilities(id as u32, bucket));
                    }
                }
            }
        }
        let header = StrategyHeader {
            fingerprint: full.fingerprint,
            small_blind: full.small_blind,
            big_blind: full.big_blind,
            stack: full.stack,
            streets: 0b0011,
            iterations: full.iterations,
            checkpoint: full.checkpoint,
        };
        StrategyFile::new(
            header,
            full.tree.clone(),
            vec![full.tables[0].clone()],
            probabilities,
        )
    }

    #[test]
    fn file_without_late_streets_is_an_error() {
        let dir = data_dir("match-flop-only");
        go(&session(&dir, Some(100), 3, Some(1))).unwrap();
        let full = build(&dir.join("tiny.toml"), &dir, None, StreetSet::All).unwrap();
        let file = preflop_and_flop_only(&full);
        let path = dir.join("flop-only.bin");
        std::fs::write(&path, file.to_bytes()).unwrap();
        let err = results(&args(&path, Opponent::Call, 400)).err().unwrap();
        assert!(err.contains("Turn"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_table_byte_is_an_error_not_a_panic() {
        let (dir, path) = exported("match-corrupt", 100);
        let mut file =
            mallorca_core::strategy::StrategyFile::from_bytes(&std::fs::read(&path).unwrap())
                .unwrap();
        file.tables[0][10] = 200;
        std::fs::write(&path, file.to_bytes()).unwrap();
        let err = results(&args(&path, Opponent::Call, 400)).err().unwrap();
        assert!(err.contains("Flop"), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn missing_file_names_the_path() {
        let err = results(&args(Path::new("/nonexistent/s.bin"), Opponent::Call, 400))
            .err()
            .unwrap();
        assert!(err.contains("/nonexistent/s.bin"), "{err}");
    }

    #[test]
    fn lines_show_name_bb_interval_and_deals() {
        let r = MatchResult {
            bb_per_100: 12.345,
            ci95: 3.21,
            deals: 20_000,
        };
        assert_eq!(
            line("call", &r),
            "call: +12.35 bb/100 ± 3.21 over 20000 deals"
        );
        let r = MatchResult {
            bb_per_100: -0.5,
            ..r
        };
        assert_eq!(
            line("random", &r),
            "random: -0.50 bb/100 ± 3.21 over 20000 deals"
        );
    }
}
