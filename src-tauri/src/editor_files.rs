// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//! Text editor IO: native file choices, bounded reads, explicit write authority.
use crate::editor_file_core::{commit, digest, read, revision, Revision};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri_plugin_dialog::DialogExt;
static CHOICES: OnceLock<Mutex<HashMap<PathBuf, Revision>>> = OnceLock::new();
fn choices() -> &'static Mutex<HashMap<PathBuf, Revision>> {
    CHOICES.get_or_init(|| Mutex::new(HashMap::new()))
}
fn path_key(path: &Path) -> io::Result<PathBuf> {
    if !path.is_absolute() {
        return Err(io::Error::other("An absolute file path is required"));
    }
    if path.exists() {
        path.canonicalize()
    } else {
        Ok(path
            .parent()
            .ok_or_else(|| io::Error::other("Missing parent"))?
            .canonicalize()?
            .join(
                path.file_name()
                    .ok_or_else(|| io::Error::other("Missing file name"))?,
            ))
    }
}
fn authorize(path: &str) -> io::Result<()> {
    let path = path_key(Path::new(path))?;
    let expected = revision(&path)?;
    choices()
        .lock()
        .map_err(|_| io::Error::other("File session unavailable"))?
        .insert(path, expected);
    Ok(())
}
pub fn open_dialog(app: &tauri::AppHandle, args: &Value) -> Value {
    let result = crate::native_ops::show_open_dialog(app, args);
    if let Some(paths) = result.get("filePaths").and_then(Value::as_array) {
        for path in paths.iter().filter_map(Value::as_str) {
            if let Err(error) = authorize(path) {
                return json!({"canceled":false, "success":false, "error":error.to_string()});
            }
        }
    }
    result
}
pub fn save_dialog(app: &tauri::AppHandle, args: &Value) -> Value {
    let options = args.get(0).cloned().unwrap_or(Value::Null);
    let mut picker = app.dialog().file();
    if let Some(default) = options.get("defaultPath").and_then(Value::as_str) {
        let path = Path::new(default);
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            picker = picker.set_file_name(name);
        }
        if let Some(parent) = path.parent().filter(|p| p.is_absolute()) {
            picker = picker.set_directory(parent);
        }
    }
    if let Some(filters) = options.get("filters").and_then(Value::as_array) {
        for filter in filters {
            let extensions: Vec<&str> = filter
                .get("extensions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .collect();
            if !extensions.is_empty() {
                picker = picker.add_filter(
                    filter
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("Files"),
                    &extensions,
                );
            }
        }
    }
    let Some(path) = picker
        .blocking_save_file()
        .and_then(crate::native_ops::fp_to_string)
    else {
        return json!({"canceled":true});
    };
    match authorize(&path) {
        Ok(()) => json!({"canceled":false, "filePath":path}),
        Err(error) => json!({"canceled":false, "success":false, "error":error.to_string()}),
    }
}
pub fn read_text(path: &str) -> Value {
    let result = path_key(Path::new(path))
        .and_then(|path| read(&path))
        .and_then(|bytes| {
            String::from_utf8(bytes).map_err(|_| io::Error::other("File is not UTF-8 text"))
        });
    match result {
        Ok(text) => json!(text),
        Err(error) => json!({"success":false,"error":error.to_string()}),
    }
}
pub fn write_text(path: &str, content: &str) -> Value {
    let result = (|| {
        let path = path_key(Path::new(path))?;
        let mut choices = choices()
            .lock()
            .map_err(|_| io::Error::other("File session unavailable"))?;
        let expected = choices.get(&path).ok_or_else(|| {
            io::Error::other("Choose Open File or Save As to authorize this file")
        })?;
        commit(&path, content, expected)?;
        choices.insert(path, Some(digest(content.as_bytes())));
        Ok::<(), io::Error>(())
    })();
    match result {
        Ok(()) => json!({"success":true}),
        Err(error) => json!({"success":false,"error":error.to_string()}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn changed_files_and_unauthorized_paths_are_not_overwritten() {
        let path = std::env::temp_dir().join(format!(
            "dex-editor-test-{}.txt",
            crate::util::pseudo_uuid_v4()
        ));
        fs::write(&path, "original").unwrap();
        let expected = revision(&path).unwrap();
        fs::write(&path, "external edit").unwrap();
        assert!(commit(&path, "clobbered", &expected).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external edit");
        assert_eq!(
            write_text(path.to_str().unwrap(), "clobbered")["success"],
            false
        );
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn authorized_saves_update_revision_and_round_trip_utf8() {
        let path = std::env::temp_dir().join(format!(
            "dex-editor-test-{}.txt",
            crate::util::pseudo_uuid_v4()
        ));
        authorize(path.to_str().unwrap()).unwrap();
        assert_eq!(
            write_text(path.to_str().unwrap(), "Hello λ")["success"],
            true
        );
        assert_eq!(
            write_text(path.to_str().unwrap(), "Revised λ")["success"],
            true
        );
        assert_eq!(read_text(path.to_str().unwrap()), json!("Revised λ"));
        choices().lock().unwrap().remove(&path);
        fs::remove_file(path).unwrap();
    }
}
