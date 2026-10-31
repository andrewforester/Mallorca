use crate::buckets::turn_values;
use mallorca_core::abstraction::Abstraction;
use mallorca_core::bytes::f32s;
use mallorca_core::iso::street_indexers;
use mallorca_core::preset::Preset;
use mallorca_core::strength::{bucket_of, percentile_thresholds};
use mallorca_core::tree::Street;
use std::path::Path;

pub fn verified(
    street: Street,
    values: &[f32],
    buckets: u16,
    table: &[u8],
) -> Result<Vec<f32>, String> {
    if values.len() != table.len() {
        return Err(format!(
            "the {street:?} has {} values but its table has {} classes",
            values.len(),
            table.len()
        ));
    }
    let thresholds = percentile_thresholds(values, buckets);
    let mismatch = values
        .iter()
        .zip(table)
        .position(|(&v, &b)| bucket_of(&thresholds, v) != u16::from(b));
    match mismatch {
        Some(class) => Err(format!(
            "the {street:?} thresholds do not reproduce its table at class {class}"
        )),
        None => Ok(thresholds),
    }
}

pub fn read_river_hs(data: &Path, classes: usize) -> Result<Vec<f32>, String> {
    let path = data.join("river_hs.f32");
    let bytes = std::fs::read(&path).map_err(|e| {
        format!(
            "cannot read {}: {e}; rebuild it with `buckets`",
            path.display()
        )
    })?;
    if bytes.len() != classes * 4 {
        return Err(format!(
            "{} has {} bytes, expected {}",
            path.display(),
            bytes.len(),
            classes * 4
        ));
    }
    Ok(f32s(&bytes))
}

pub fn play_thresholds(
    data: &Path,
    preset: &Preset,
    abstraction: &Abstraction,
) -> Result<Vec<(Street, Vec<f32>)>, String> {
    let indexers = street_indexers();
    let river = read_river_hs(data, abstraction.class_count(Street::River) as usize)?;
    let turn = turn_values(&indexers, &river, preset.threads);
    let turn_t = verified(
        Street::Turn,
        &turn,
        preset.buckets[1],
        abstraction.table_bytes(Street::Turn),
    )?;
    drop(turn);
    let river_t = verified(
        Street::River,
        &river,
        preset.buckets[2],
        abstraction.table_bytes(Street::River),
    )?;
    Ok(vec![(Street::Turn, turn_t), (Street::River, river_t)])
}

#[cfg(test)]
mod tests {
    use super::*;
    use mallorca_core::abstraction::percentile_buckets;

    fn values() -> Vec<f32> {
        (0..1000)
            .map(|v| ((v * 37) % 1000) as f32 / 1000.0)
            .collect()
    }

    #[test]
    fn matching_table_gives_its_thresholds() {
        let v = values();
        let table = percentile_buckets(&v, 8);
        let t = verified(Street::Turn, &v, 8, &table).unwrap();
        assert_eq!(t, mallorca_core::strength::percentile_thresholds(&v, 8));
    }

    #[test]
    fn a_different_table_is_refused_with_its_street_and_class() {
        let v = values();
        let mut table = percentile_buckets(&v, 8);
        table[17] = (table[17] + 1) % 8;
        let err = verified(Street::River, &v, 8, &table).err().unwrap();
        assert!(err.contains("River") && err.contains("17"), "{err}");
    }

    #[test]
    fn a_table_of_another_length_is_refused() {
        let v = values();
        let err = verified(Street::Turn, &v, 8, &[0; 10]).err().unwrap();
        assert!(err.contains("Turn"), "{err}");
    }

    #[test]
    fn missing_river_strengths_are_an_error() {
        let dir = std::env::temp_dir().join("mallorca-thresholds-missing");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let err = read_river_hs(&dir, 5).err().unwrap();
        assert!(
            err.contains("river_hs.f32") && err.contains("buckets"),
            "{err}"
        );
        std::fs::write(dir.join("river_hs.f32"), [0u8; 12]).unwrap();
        let err = read_river_hs(&dir, 5).err().unwrap();
        assert!(err.contains("river_hs.f32"), "{err}");
        assert_eq!(read_river_hs(&dir, 3).unwrap(), vec![0.0; 3]);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
