use mallorca_core::abstraction::{decode_table, Abstraction};
use mallorca_core::cfr::SLOT_BYTES;
use mallorca_core::preset::Preset;
use mallorca_core::tree::{Street, Tree};
use std::path::Path;

pub const TABLES: [(&str, Street); 3] = [
    ("flop.bkt", Street::Flop),
    ("turn.bkt", Street::Turn),
    ("river.bkt", Street::River),
];

pub fn read_file(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| format!("cannot read {}: {e}", path.display()))
}

pub fn memory_estimate(tree: &Tree, tables: &Path) -> Result<u64, String> {
    let mut bytes = tree.action_slot_count() * SLOT_BYTES as u64;
    for (name, _) in TABLES {
        let path = tables.join(name);
        let meta =
            std::fs::metadata(&path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        bytes += meta.len();
    }
    Ok(bytes)
}

pub fn read_table(path: &Path, street: Street, buckets: u16) -> Result<Vec<u8>, String> {
    let (header, table) =
        decode_table(read_file(path)?).map_err(|e| format!("{}: {e}", path.display()))?;
    if header.street != street {
        return Err(format!(
            "{}: a {:?} table, expected {street:?}",
            path.display(),
            header.street
        ));
    }
    if header.buckets != buckets {
        return Err(format!(
            "{}: built for {} buckets, the preset has {buckets}; rebuild it with `buckets`",
            path.display(),
            header.buckets
        ));
    }
    Ok(table)
}

pub fn load_abstraction(preset: &Preset, dir: &Path) -> Result<Abstraction, String> {
    let mut tables: [Vec<u8>; 3] = Default::default();
    for (i, (slot, (name, street))) in tables.iter_mut().zip(TABLES).enumerate() {
        *slot = read_table(&dir.join(name), street, preset.buckets[i])?;
    }
    let abstraction = Abstraction::new(tables);
    for (i, (name, street)) in TABLES.into_iter().enumerate() {
        let path = dir.join(name);
        let table = abstraction.table_bytes(street);
        let classes = abstraction.class_count(street);
        if table.len() as u64 != classes {
            return Err(format!(
                "{}: {} bytes, expected {classes}",
                path.display(),
                table.len()
            ));
        }
        let buckets = preset.buckets[i];
        if let Some(&b) = table.iter().find(|&&b| u16::from(b) >= buckets) {
            return Err(format!(
                "{}: bucket {b} out of range for {buckets} buckets",
                path.display()
            ));
        }
    }
    Ok(abstraction)
}
