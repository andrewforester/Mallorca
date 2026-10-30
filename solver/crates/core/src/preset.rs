use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreflopSizes {
    pub open_bb: f64,
    pub iso_vs_limp_bb: f64,
    pub three_bet_x: f64,
    pub four_bet_x: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PostflopSizes {
    pub first_bet_pot: Vec<f64>,
    pub first_raise_pot: Vec<f64>,
    pub max_aggressive: u8,
    pub all_in_threshold: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CfrParams {
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
    pub discount_interval: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preset {
    pub name: String,
    pub small_blind: u32,
    pub big_blind: u32,
    pub stack: u32,
    pub buckets: [u16; 3],
    pub memory_limit_gb: f64,
    pub threads: usize,
    pub checkpoint_minutes: u64,
    pub preflop: PreflopSizes,
    pub postflop: PostflopSizes,
    pub cfr: CfrParams,
}

#[derive(Serialize)]
struct AbstractionIdentity<'a> {
    small_blind: u32,
    big_blind: u32,
    stack: u32,
    buckets: [u16; 3],
    preflop: &'a PreflopSizes,
    postflop: &'a PostflopSizes,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PresetError {
    Parse(String),
    Invalid(String),
}

impl fmt::Display for PresetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PresetError::Parse(m) => write!(f, "cannot parse preset: {m}"),
            PresetError::Invalid(m) => write!(f, "invalid preset: {m}"),
        }
    }
}

impl std::error::Error for PresetError {}

impl Preset {
    pub fn from_toml(s: &str) -> Result<Preset, PresetError> {
        let preset: Preset = toml::from_str(s).map_err(|e| PresetError::Parse(e.to_string()))?;
        preset.validate()?;
        Ok(preset)
    }

    pub fn canonical_toml(&self) -> String {
        toml::to_string(self).expect("preset serializes to toml")
    }

    pub fn abstraction_toml(&self) -> String {
        let identity = AbstractionIdentity {
            small_blind: self.small_blind,
            big_blind: self.big_blind,
            stack: self.stack,
            buckets: self.buckets,
            preflop: &self.preflop,
            postflop: &self.postflop,
        };
        toml::to_string(&identity).expect("abstraction identity serializes to toml")
    }

    pub fn tree_buckets(&self) -> [u16; 4] {
        [169, self.buckets[0], self.buckets[1], self.buckets[2]]
    }

    fn validate(&self) -> Result<(), PresetError> {
        let invalid = |m: &str| Err(PresetError::Invalid(m.to_string()));
        if self.small_blind == 0 || self.small_blind >= self.big_blind {
            return invalid("blinds must satisfy 0 < small_blind < big_blind");
        }
        if self.stack <= self.big_blind {
            return invalid("stack must exceed the big blind");
        }
        if self.buckets.iter().any(|b| !(1..=256).contains(b)) {
            return invalid("bucket counts must be in 1..=256, the range of the u8 bucket tables");
        }
        let pf = &self.preflop;
        if [pf.open_bb, pf.iso_vs_limp_bb, pf.three_bet_x, pf.four_bet_x]
            .iter()
            .any(|&x| !x.is_finite() || x <= 1.0)
        {
            return invalid("preflop sizes must be greater than 1");
        }
        let post = &self.postflop;
        if post
            .first_bet_pot
            .iter()
            .chain(&post.first_raise_pot)
            .any(|&x| !x.is_finite() || x <= 0.0)
        {
            return invalid("postflop pot fractions must be positive");
        }
        if !(post.all_in_threshold > 0.0 && post.all_in_threshold <= 1.0) {
            return invalid("all_in_threshold must be in (0, 1]");
        }
        if post.max_aggressive == 0 {
            return invalid("max_aggressive must be positive");
        }
        if self.threads == 0 {
            return invalid("threads must be positive");
        }
        if self.checkpoint_minutes == 0 {
            return invalid("checkpoint_minutes must be positive");
        }
        if self.cfr.discount_interval == 0 {
            return invalid("discount_interval must be positive");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const V1: &str = include_str!("../../../presets/v1.toml");
    const TINY: &str = include_str!("../../../presets/tiny.toml");

    #[test]
    fn v1_values() {
        let p = Preset::from_toml(V1).unwrap();
        assert_eq!(p.name, "v1");
        assert_eq!((p.small_blind, p.big_blind, p.stack), (10, 20, 2000));
        assert_eq!(p.buckets, [128, 128, 128]);
        assert_eq!(p.tree_buckets(), [169, 128, 128, 128]);
        assert_eq!(
            p.preflop,
            PreflopSizes {
                open_bb: 2.5,
                iso_vs_limp_bb: 3.5,
                three_bet_x: 3.0,
                four_bet_x: 2.2
            }
        );
        assert_eq!(p.postflop.first_bet_pot, vec![0.5, 0.75, 1.0, 1.5, 2.0]);
        assert_eq!(p.postflop.first_raise_pot, vec![1.0]);
        assert_eq!(p.postflop.max_aggressive, 3);
        assert_eq!(p.postflop.all_in_threshold, 0.6667);
        assert_eq!(
            p.cfr,
            CfrParams {
                alpha: 1.5,
                beta: 0.0,
                gamma: 2.0,
                discount_interval: 1_000_000
            }
        );
        assert_eq!(p.memory_limit_gb, 12.0);
        assert_eq!(p.threads, 12);
        assert_eq!(p.checkpoint_minutes, 30);
    }

    #[test]
    fn tiny_values() {
        let p = Preset::from_toml(TINY).unwrap();
        assert_eq!(p.name, "tiny");
        assert_eq!((p.small_blind, p.big_blind, p.stack), (10, 20, 400));
        assert_eq!(p.buckets, [8, 8, 8]);
        assert_eq!(p.postflop.first_bet_pot, vec![1.0]);
        assert!(p.postflop.first_raise_pot.is_empty());
        assert_eq!(p.postflop.max_aggressive, 2);
        assert_eq!(p.threads, 2);
        assert_eq!(p.cfr.discount_interval, 1000);
        assert_eq!(p.checkpoint_minutes, 1);
    }

    #[test]
    fn missing_field_is_rejected() {
        let s = V1.replace("stack = 2000\n", "");
        match Preset::from_toml(&s) {
            Err(PresetError::Parse(m)) => assert!(m.contains("stack"), "{m}"),
            other => panic!("expected parse error, got {other:?}"),
        }
        let s = V1.replace("all_in_threshold = 0.6667\n", "");
        assert!(matches!(Preset::from_toml(&s), Err(PresetError::Parse(_))));
    }

    #[test]
    fn unknown_field_is_rejected() {
        let s = V1.replace("stack = 2000\n", "stack = 2000\nante = 5\n");
        assert!(matches!(Preset::from_toml(&s), Err(PresetError::Parse(_))));
    }

    #[test]
    fn inconsistent_values_are_rejected() {
        for (from, to) in [
            ("big_blind = 20", "big_blind = 5"),
            ("stack = 2000", "stack = 10"),
            ("buckets = [128, 128, 128]", "buckets = [128, 0, 128]"),
            ("buckets = [128, 128, 128]", "buckets = [128, 128, 257]"),
            ("buckets = [128, 128, 128]", "buckets = [512, 128, 128]"),
            ("all_in_threshold = 0.6667", "all_in_threshold = 0.0"),
            ("first_raise_pot = [1.0]", "first_raise_pot = [-1.0]"),
            ("open_bb = 2.5", "open_bb = 0.5"),
            ("threads = 12", "threads = 0"),
            ("checkpoint_minutes = 30", "checkpoint_minutes = 0"),
            ("discount_interval = 1000000", "discount_interval = 0"),
        ] {
            let s = V1.replace(from, to);
            assert!(
                matches!(Preset::from_toml(&s), Err(PresetError::Invalid(_))),
                "{to}"
            );
        }
    }

    #[test]
    fn bucket_counts_up_to_256_are_accepted() {
        let s = V1.replace("buckets = [128, 128, 128]", "buckets = [1, 256, 256]");
        assert_eq!(Preset::from_toml(&s).unwrap().buckets, [1, 256, 256]);
    }

    #[test]
    fn canonical_toml_round_trips() {
        for src in [V1, TINY] {
            let p = Preset::from_toml(src).unwrap();
            let c = p.canonical_toml();
            let q = Preset::from_toml(&c).unwrap();
            assert_eq!(p, q);
            assert_eq!(c, q.canonical_toml());
        }
    }

    #[test]
    fn canonical_toml_ignores_formatting() {
        let p = Preset::from_toml(V1).unwrap();
        let reformatted = V1.replace(" = ", "=").replace("2.0]", "2.00]");
        let q = Preset::from_toml(&reformatted).unwrap();
        assert_eq!(p.canonical_toml(), q.canonical_toml());
    }

    #[test]
    fn v1_abstraction_toml_is_pinned() {
        let p = Preset::from_toml(V1).unwrap();
        assert_eq!(
            p.abstraction_toml(),
            "small_blind = 10\nbig_blind = 20\nstack = 2000\nbuckets = [128, 128, 128]\n\n[preflop]\nopen_bb = 2.5\niso_vs_limp_bb = 3.5\nthree_bet_x = 3.0\nfour_bet_x = 2.2\n\n[postflop]\nfirst_bet_pot = [0.5, 0.75, 1.0, 1.5, 2.0]\nfirst_raise_pot = [1.0]\nmax_aggressive = 3\nall_in_threshold = 0.6667\n"
        );
    }
}
