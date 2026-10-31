mod buckets;
mod export;
mod kmeans;
mod lbr;
mod measure;
mod parallel;
mod potential;
mod schedule;
mod thresholds;
mod train;
mod tree;
mod verify;

use clap::{Parser, Subcommand};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};

static STOP: AtomicBool = AtomicBool::new(false);

#[derive(Parser)]
#[command(name = "mallorca-trainer", about = "Heads-up NLHE CFR trainer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Buckets(buckets::BucketsArgs),
    Tree(tree::TreeArgs),
    Train(train::TrainArgs),
    Calibrate(train::calibrate::CalibrateArgs),
    Export(export::ExportArgs),
    Lbr(lbr::LbrArgs),
    Match(measure::MatchArgs),
}

fn catch_ctrl_c() -> Result<(), String> {
    ctrlc::set_handler(|| {
        if STOP.swap(true, Ordering::Relaxed) {
            std::process::exit(130);
        }
        eprintln!(
            "stopping after the current iterations; Ctrl-C again aborts without a checkpoint"
        );
    })
    .map_err(|e| format!("cannot install the Ctrl-C handler: {e}"))
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Buckets(args) => buckets::run(&args),
        Command::Tree(args) => tree::run(&args),
        Command::Train(args) => catch_ctrl_c().and_then(|()| train::run(&args, &STOP)),
        Command::Calibrate(args) => {
            catch_ctrl_c().and_then(|()| train::calibrate::calibrate(&args, &STOP))
        }
        Command::Export(args) => export::run(&args),
        Command::Lbr(args) => lbr::run(&args),
        Command::Match(args) => measure::run(&args),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}
