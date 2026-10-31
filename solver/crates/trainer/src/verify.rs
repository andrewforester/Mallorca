use crate::potential::{river_table, turn_table};
use crate::thresholds::read_river_hs;
use mallorca_core::abstraction::Abstraction;
use mallorca_core::centroids::{Centroids, RIVER_DIMENSION, TURN_DIMENSION};
use mallorca_core::iso::street_indexers;
use mallorca_core::preset::Preset;
use mallorca_core::tree::Street;
use std::path::Path;

fn name(street: Street) -> &'static str {
    match street {
        Street::Preflop => "preflop",
        Street::Flop => "flop",
        Street::Turn => "turn",
        Street::River => "river",
    }
}

pub fn reproduced(street: Street, recomputed: &[u8], table: &[u8]) -> Result<(), String> {
    let street = name(street);
    if recomputed.len() != table.len() {
        return Err(format!(
            "the {street} centroids bucket {} classes but its table has {}",
            recomputed.len(),
            table.len()
        ));
    }
    match recomputed.iter().zip(table).position(|(a, b)| a != b) {
        Some(class) => Err(format!(
            "the {street} centroids do not reproduce its table at class {class}"
        )),
        None => Ok(()),
    }
}

pub fn read_centroids(data: &Path, buckets: [u16; 3]) -> Result<Centroids, String> {
    let path = data.join("centroids.bin");
    let bytes = std::fs::read(&path).map_err(|e| {
        format!(
            "cannot read {}: {e}; rebuild it with `buckets`",
            path.display()
        )
    })?;
    let centroids = Centroids::decode(&bytes).map_err(|e| format!("{}: {e}", path.display()))?;
    for (street, values, dimension, count) in [
        (Street::Turn, &centroids.turn, TURN_DIMENSION, buckets[1]),
        (Street::River, &centroids.river, RIVER_DIMENSION, buckets[2]),
    ] {
        if values.len() != usize::from(count) * dimension {
            return Err(format!(
                "{}: {} {} centroids, the preset has {count} buckets",
                path.display(),
                values.len() / dimension,
                name(street)
            ));
        }
    }
    Ok(centroids)
}

pub fn play_centroids(
    data: &Path,
    preset: &Preset,
    abstraction: &Abstraction,
) -> Result<Centroids, String> {
    let centroids = read_centroids(data, preset.buckets)?;
    let indexers = street_indexers();
    let river_hs = read_river_hs(data, abstraction.class_count(Street::River) as usize)?;
    let turn = turn_table(&indexers, &river_hs, &centroids.turn, preset.threads);
    drop(river_hs);
    reproduced(Street::Turn, &turn, abstraction.table_bytes(Street::Turn))?;
    drop(turn);
    let river = river_table(
        &indexers[3],
        &centroids.clusters,
        &centroids.river,
        preset.threads,
    )?;
    reproduced(
        Street::River,
        &river,
        abstraction.table_bytes(Street::River),
    )?;
    Ok(centroids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mallorca-verify-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn centroids(turn: usize, river: usize) -> Centroids {
        Centroids {
            clusters: [0; 169],
            turn: vec![0.0; turn * TURN_DIMENSION],
            river: vec![0.0; river * RIVER_DIMENSION],
        }
    }

    #[test]
    fn an_equal_table_is_reproduced() {
        assert_eq!(reproduced(Street::Turn, &[0, 3, 7], &[0, 3, 7]), Ok(()));
    }

    #[test]
    fn the_first_different_class_is_named_with_its_street() {
        let err = reproduced(Street::River, &[0, 3, 7, 1, 2], &[0, 3, 7, 2, 3])
            .err()
            .unwrap();
        assert!(err.contains("river") && err.contains("class 3"), "{err}");
    }

    #[test]
    fn a_table_of_another_length_is_refused() {
        let err = reproduced(Street::Turn, &[0, 1], &[0, 1, 2]).err().unwrap();
        assert!(err.contains("turn"), "{err}");
    }

    #[test]
    fn centroids_are_read_and_checked_against_the_preset() {
        let dir = scratch("read");
        let err = read_centroids(&dir, [8, 8, 8]).err().unwrap();
        assert!(
            err.contains("centroids.bin") && err.contains("buckets"),
            "{err}"
        );
        std::fs::write(dir.join("centroids.bin"), centroids(8, 8).encode()).unwrap();
        assert_eq!(read_centroids(&dir, [8, 8, 8]).unwrap(), centroids(8, 8));
        let err = read_centroids(&dir, [8, 6, 8]).err().unwrap();
        assert!(err.contains("turn"), "{err}");
        let err = read_centroids(&dir, [8, 8, 9]).err().unwrap();
        assert!(err.contains("river"), "{err}");
        std::fs::write(dir.join("centroids.bin"), [0u8; 3]).unwrap();
        assert!(read_centroids(&dir, [8, 8, 8]).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
