use super::tables::read_file;
use mallorca_core::cfr::Storage;
use mallorca_core::checkpoint::{
    read_checkpoint, write_checkpoint, CheckpointHeader, FORMAT_VERSION,
};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub struct Resume {
    pub storage: Storage,
    pub iterations: u64,
    pub elapsed_seconds: u64,
    pub checkpoint: u32,
}

pub fn checkpoint_path(dir: &Path, n: u32) -> PathBuf {
    dir.join(format!("{n}.ckpt"))
}

pub fn latest_checkpoint(dir: &Path) -> Result<Option<u32>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
    let mut latest = None;
    for entry in entries {
        let entry = entry.map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
        let name = entry.file_name();
        let Some(n) = name
            .to_str()
            .and_then(|s| s.strip_suffix(".ckpt"))
            .and_then(|s| s.parse::<u32>().ok())
        else {
            continue;
        };
        latest = latest.max(Some(n));
    }
    Ok(latest)
}

pub fn load_checkpoint(
    dir: &Path,
    n: u32,
    expected: &[u8; 32],
    slots: u64,
) -> Result<Resume, String> {
    let path = checkpoint_path(dir, n);
    let bytes = read_file(&path)?;
    let (header, storage) =
        read_checkpoint(&bytes, expected).map_err(|e| format!("{}: {e}", path.display()))?;
    if storage.len() != slots {
        return Err(format!(
            "{}: {} action slots, the tree has {slots}",
            path.display(),
            storage.len()
        ));
    }
    Ok(Resume {
        storage,
        iterations: header.iterations,
        elapsed_seconds: header.elapsed_seconds,
        checkpoint: n,
    })
}

pub fn resume(dir: &Path, expected: &[u8; 32], slots: u64) -> Result<Option<Resume>, String> {
    let Some(n) = latest_checkpoint(dir)? else {
        return Ok(None);
    };
    load_checkpoint(dir, n, expected, slots).map(Some)
}

fn save(dir: &Path, header: &CheckpointHeader, storage: &Storage) -> Result<PathBuf, String> {
    let path = checkpoint_path(dir, header.checkpoint);
    let tmp = dir.join(format!("{}.ckpt.tmp", header.checkpoint));
    let failed = |e: std::io::Error| format!("cannot write {}: {e}", tmp.display());
    let mut out = BufWriter::new(File::create(&tmp).map_err(failed)?);
    write_checkpoint(&mut out, header, storage).map_err(failed)?;
    let file = out.into_inner().map_err(|e| failed(e.into_error()))?;
    file.sync_all().map_err(failed)?;
    drop(file);
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("cannot rename {} to {}: {e}", tmp.display(), path.display()))?;
    File::open(dir)
        .and_then(|d| d.sync_all())
        .map_err(|e| format!("cannot sync {}: {e}", dir.display()))?;
    Ok(path)
}

pub fn average_positive_regret(storage: &Storage, iterations: u64) -> f64 {
    if iterations == 0 {
        return 0.0;
    }
    let sum: f64 = (0..storage.len())
        .map(|i| f64::from(storage.regret(i).max(0.0)))
        .sum();
    sum / iterations as f64
}

pub struct Progress<'a> {
    pub dir: &'a Path,
    pub fingerprint: [u8; 32],
    pub start_iterations: u64,
    pub start_elapsed: u64,
    pub next: u32,
}

impl Progress<'_> {
    pub fn checkpoint(
        &mut self,
        storage: &Storage,
        iterations: u64,
        session: Duration,
    ) -> Result<PathBuf, String> {
        let header = CheckpointHeader {
            format_version: FORMAT_VERSION,
            fingerprint: self.fingerprint,
            iterations,
            elapsed_seconds: self.start_elapsed + session.as_secs(),
            checkpoint: self.next,
        };
        let path = save(self.dir, &header, storage)?;
        self.next += 1;
        let secs = session.as_secs_f64();
        let rate = if secs > 0.0 {
            (iterations - self.start_iterations) as f64 / secs
        } else {
            0.0
        };
        println!(
            "checkpoint {}: {iterations} iterations, {rate:.1} it/s, avg positive regret {:.6e} per iteration, {}",
            header.checkpoint,
            average_positive_regret(storage, iterations),
            path.display()
        );
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn average_positive_regret_ignores_negative_regrets() {
        let s = Storage::new(3);
        s.add_regret(0, 2.0);
        s.add_regret(1, -1.0);
        s.add_regret(2, 4.0);
        assert_eq!(average_positive_regret(&s, 3), 2.0);
        assert_eq!(average_positive_regret(&s, 0), 0.0);
    }
}
