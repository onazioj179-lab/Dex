// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs::File,
    io::{self, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const IMAGES: &[&str] = &[
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico", ".avif", ".tif", ".tiff",
    ".heic", ".heif",
];
pub(crate) const VIDEOS: &[&str] = &[
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv", ".flv", ".m4v", ".mpeg", ".mpg",
    ".ts", ".m2ts", ".mts", ".3gp", ".ogv", ".vob", ".asf", ".divx",
];
pub(crate) const AUDIO: &[&str] = &[
    ".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wma",
    ".aif", ".aiff", ".caf", ".alac", ".ape", ".mka", ".ac3", ".dts", ".amr", ".au",
];
const IMPORTS: &str = "imports";
const MAX_PNG_BYTES: usize = 64 * 1024 * 1024;

fn is_media(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            let ext = format!(".{}", ext.to_ascii_lowercase());
            IMAGES.contains(&ext.as_str()) || VIDEOS.contains(&ext.as_str()) || AUDIO.contains(&ext.as_str())
        })
}

fn catalog(app: &AppHandle) -> io::Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("gallery-imports.json"))
        .map_err(io::Error::other)
}

fn approved_records(
    app: &AppHandle,
    records: impl IntoIterator<Item = Value>,
    root: Option<&Path>,
    seen: &mut HashSet<PathBuf>,
) -> Vec<Value> {
    let scope = app.asset_protocol_scope();
    records
        .into_iter()
        .filter(|record| {
            let Some(path) = record["path"].as_str().map(Path::new) else {
                return false;
            };
            let Ok(canonical) = path.canonicalize() else {
                return false;
            };
            if seen.contains(&canonical)
                || !is_media(&canonical)
                || root.is_some_and(|dir| !canonical.starts_with(dir))
            {
                return false;
            }
            if scope.allow_file(path).is_err() {
                return false;
            }
            seen.insert(canonical);
            true
        })
        .collect()
}

fn library(app: &AppHandle) -> io::Result<Value> {
    let resolver = app.path();
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for (dir, extensions) in [
        (resolver.picture_dir(), IMAGES),
        (resolver.video_dir(), VIDEOS),
    ] {
        let Ok(dir) = dir else { continue };
        if let Ok(root) = dir.canonicalize() {
            items.extend(approved_records(
                app,
                crate::fs_ops::scan_media(&dir, extensions),
                Some(&root),
                &mut seen,
            ));
        }
    }
    let imports = crate::kv_repository::get_current(&catalog(app)?, IMPORTS)?;
    let imports = imports
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let path = Path::new(entry["path"].as_str()?);
            let canonical = Path::new(entry["canonical"].as_str()?);
            if path.canonicalize().ok().as_deref() != Some(canonical) {
                return None;
            }
            crate::fs_ops::media_record(path).ok()
        });
    items.extend(approved_records(app, imports, None, &mut seen));
    Ok(json!({"success": true, "items": items}))
}

fn import_media(app: &AppHandle) -> io::Result<Value> {
    let extensions: Vec<_> = IMAGES.iter().chain(VIDEOS).chain(AUDIO).map(|ext| &ext[1..]).collect();
    let Some(paths) = app
        .dialog()
        .file()
        .add_filter("Photos, videos and audio", &extensions)
        .blocking_pick_files()
    else {
        return Ok(json!({"success": true, "canceled": true}));
    };
    let mut items = Vec::new();
    let mut skipped = 0;
    for path in paths
        .into_iter()
        .filter_map(crate::native_ops::fp_to_string)
    {
        let file = Path::new(&path);
        match file.canonicalize() {
            Ok(canonical) if is_media(file) && is_media(&canonical) && canonical.is_file() => {
                items.push(json!({"path": path, "canonical": canonical}));
            }
            _ => skipped += 1,
        }
    }
    let count = items.len();
    if count > 0 {
        crate::kv_repository::update_authority(&catalog(app)?, |map| {
            let mut imports = map
                .remove(IMPORTS)
                .and_then(|value| value.as_array().cloned())
                .unwrap_or_default();
            let mut paths: HashSet<Value> = imports
                .iter()
                .map(|entry| entry["canonical"].clone())
                .collect();
            imports.extend(
                items
                    .into_iter()
                    .filter(|entry| paths.insert(entry["canonical"].clone())),
            );
            map.insert(IMPORTS.into(), json!(imports));
            Ok(())
        })?;
    }
    Ok(json!({"success": true, "count": count, "skipped": skipped}))
}

fn local_file(raw: &str) -> io::Result<&Path> {
    let path = Path::new(raw);
    if path.is_absolute() && path.metadata()?.is_file() {
        Ok(path)
    } else {
        Err(io::Error::other("Choose a regular local file."))
    }
}

pub(crate) fn preview(app: &AppHandle, raw: &str) -> Value {
    let result = (|| -> io::Result<Value> {
        let path = local_file(raw)?;
        let ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase();
        if !is_media(path) && ext != "pdf" {
            return Err(io::Error::other("This file format has no media preview."));
        }
        // Scope the original URL path so the asset protocol can serve byte ranges.
        app.asset_protocol_scope().allow_file(path).map_err(io::Error::other)?;
        Ok(json!({"success": true}))
    })();
    result.unwrap_or_else(|error| json!({"success": false, "error": error.to_string()}))
}


fn save_copy(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Missing export folder"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    write(temp.as_file_mut())?;
    temp.as_file().sync_all()?;
    temp.persist_noclobber(path).map_err(|error| {
        if error.error.kind() == io::ErrorKind::AlreadyExists {
            io::Error::new(
                io::ErrorKind::AlreadyExists,
                "A file with that name already exists. Choose a new name.",
            )
        } else {
            error.error
        }
    })?;
    Ok(())
}

fn export_edited(app: &AppHandle, args: &Value) -> io::Result<Value> {
    let name = args[0]
        .as_str()
        .and_then(|name| Path::new(name).file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("edited.png");
    let encoded = args[1]["__dexBinary"]
        .as_str()
        .filter(|data| data.len() <= MAX_PNG_BYTES.div_ceil(3) * 4)
        .ok_or_else(|| io::Error::other("The edited PNG exceeds 64 MB or is missing"))?;
    let bytes = STANDARD.decode(encoded).map_err(io::Error::other)?;
    if bytes.len() > MAX_PNG_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(io::Error::other("Expected a PNG image up to 64 MB"));
    }
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter("PNG image", &["png"])
        .blocking_save_file()
        .and_then(crate::native_ops::fp_to_string)
    else {
        return Ok(json!({"success": true, "canceled": true}));
    };
    let path = PathBuf::from(path).with_extension("png");
    save_copy(&path, |file| file.write_all(&bytes))?;
    Ok(json!({"success": true, "path": path}))
}

fn export_originals(app: &AppHandle, args: &Value) -> io::Result<Value> {
    let paths = args[0]
        .as_array()
        .ok_or_else(|| io::Error::other("Select media to export"))?;
    let Some(folder) = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .and_then(crate::native_ops::fp_to_string)
    else {
        return Ok(json!({"success": true, "canceled": true}));
    };
    let folder = Path::new(&folder);
    let scope = app.asset_protocol_scope();
    let mut failed = Vec::new();
    for value in paths {
        let path = Path::new(value.as_str().unwrap_or_default());
        let result = (|| {
            let source = path.canonicalize()?;
            if !is_media(&source) || !source.is_file() || !scope.is_allowed(&source) {
                return Err(io::Error::other("Media is unavailable"));
            }
            let name = path
                .file_name()
                .ok_or_else(|| io::Error::other("Media has no name"))?;
            let mut input = File::open(source)?;
            save_copy(&folder.join(name), |file| {
                io::copy(&mut input, file).map(|_| ())
            })
        })();
        if let Err(error) = result {
            failed.push(json!({"path": path, "error": error.to_string()}));
        }
    }
    Ok(json!({"success": true, "count": paths.len() - failed.len(), "failed": failed}))
}

pub fn dispatch(app: &AppHandle, channel: &str, args: &Value) -> Value {
    let result = match channel {
        "gallery:mediaLibrary" => library(app),
        "gallery:importMedia" => import_media(app),
        "gallery:exportEdited" => export_edited(app, args),
        "gallery:exportOriginals" => export_originals(app, args),
        _ => return Value::Null,
    };
    result.unwrap_or_else(|error| json!({"success": false, "error": error.to_string()}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn export_publishes_only_complete_new_copies() {
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("edited.png");
        let result = save_copy(&destination, |file| {
            file.write_all(b"partial")?;
            Err(io::Error::other("write interrupted"))
        });
        assert!(result.is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
        save_copy(&destination, |file| file.write_all(b"complete")).unwrap();
        let result = save_copy(&destination, |file| file.write_all(b"replacement"));
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&destination).unwrap(), b"complete");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
