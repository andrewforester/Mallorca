use super::{train, wall_clock, Session};
use clap::Args;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

const NIGHTS: [u64; 2] = [8, 10];

#[derive(Args)]
pub struct CalibrateArgs {
    #[arg(long)]
    pub preset: PathBuf,
    #[arg(long)]
    pub data: PathBuf,
    #[arg(long, default_value_t = 30)]
    pub minutes: u64,
    #[arg(long)]
    pub threads: Option<usize>,
}

pub fn calibrate(args: &CalibrateArgs, stop: &AtomicBool) -> Result<(), String> {
    let scratch = args.data.join("calibrate");
    let clear = || match std::fs::remove_dir_all(&scratch) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("cannot remove {}: {e}", scratch.display()))
        }
        _ => Ok(()),
    };
    clear()?;
    let session = Session {
        preset: args.preset.clone(),
        tables: args.data.clone(),
        checkpoints: scratch.clone(),
        minutes: Some(args.minutes),
        iterations: None,
        seed: 0,
        threads: args.threads,
    };
    let outcome = train(&session, &wall_clock(), stop);
    clear()?;
    let outcome = outcome?;
    let rate = if outcome.seconds > 0.0 {
        outcome.trained as f64 / outcome.seconds
    } else {
        0.0
    };
    println!(
        "calibrated {} iterations in {:.1}s: {rate:.1} iterations per second",
        outcome.trained, outcome.seconds
    );
    for hours in NIGHTS {
        println!(
            "{hours} hours: {:.0} iterations",
            rate * (hours * 3600) as f64
        );
    }
    Ok(())
}
