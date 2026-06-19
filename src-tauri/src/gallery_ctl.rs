// =============================================================================
// DEX Tauri — Gallery subsystem (port of the data/read channels in
// src/main/core/GalleryViewer.ts).
//
// Pure-data, JSON-backed tier. Electron's GalleryViewer persisted its in-memory
// Maps to <userData>/gallery/gallery-data.json as { images: GalleryImage[],
// folders: GalleryFolder[] }. Per the migration plan this lands as an fs-json
// store named `gallery-state.json` under <appData>, keeping the SAME top-level
// key wrappers ("images" / "folders") so the persisted shape is unchanged. Read
// channels return the exact GalleryImage shape the renderer already consumes.
//
// PORTED (read-only data):
//   - gallery:getImages   (filter?) -> GalleryImage[]   (filtered + sorted)
//   - gallery:getImage    (imageId) -> GalleryImage | null
//   - gallery:getMetadata (imageId) -> ImageMetadata | null  (the `metadata`
//                          object embedded in the matching GalleryImage; Electron
//                          stored EXIF/format metadata inline on each image, so
//                          reading it needs no native runtime)
//
// SKIPPED (heavy — need the native runtime: filesystem scans, nativeImage
// decode/resize, thumbnail JPEG encoding, disk writes):
//   - upload   -> covered by gallery:openFolder / addFolder / loadImage (fs walk
//                 + nativeImage dimension probe + thumbnail generation)
//   - delete   -> gallery:removeFolder (mutates store + deletes images)
//   - edit     -> gallery:updateMetadata / setRating / toggleFavorite / addTags
//   - organize -> gallery:setSort / setFilter / select* / navigate (live view
//                 state held in the singleton; no stateless data equivalent)
//   None of the above are faked here; the prefix route returns Value::Null for
//   any gallery channel this module does not handle (honest degrade).
//
// DIVERGENCES (documented):
//   - The Electron handler returns images filtered by the request filter OR, when
//     no filter is passed, by the viewer's persisted `this.filter`, then sorted
//     by the persisted `this.sort`. The Tauri dispatch is stateless (no live
//     singleton), so getImages applies ONLY the per-call filter argument and the
//     viewer's DEFAULT sort ({ field: "date", direction: "desc" }), matching a
//     fresh viewer. Sort/filter view state is itself a SKIPPED (organize) concern.
//   - Sort stability: Electron used Array.prototype.sort (stable). Rust's
//     sort_by is also stable, so equal-key ordering matches insertion order
//     exactly as in Electron.
//   - localeCompare: name/type sorts use a plain byte/str Ord here rather than
//     ICU locale collation. For ASCII filenames (the overwhelming common case)
//     the order is identical; this is the same simplification used elsewhere in
//     the Tauri port and only the default date sort is reachable by default.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STATE_FILE: &str = "gallery-state.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_state(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, STATE_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn read_images(app: &tauri::AppHandle) -> Vec<Value> {
    read_state(app)
        .get("images")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// --- GalleryImage field accessors -------------------------------------------

fn id_of(img: &Value) -> &str {
    img.get("id").and_then(|v| v.as_str()).unwrap_or("")
}
fn path_of(img: &Value) -> &str {
    img.get("path").and_then(|v| v.as_str()).unwrap_or("")
}
fn filename_of(img: &Value) -> &str {
    img.get("filename").and_then(|v| v.as_str()).unwrap_or("")
}
fn extension_of(img: &Value) -> &str {
    img.get("extension").and_then(|v| v.as_str()).unwrap_or("")
}
fn size_of(img: &Value) -> i64 {
    img.get("size").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn created_at(img: &Value) -> i64 {
    img.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn favorite_of(img: &Value) -> Option<bool> {
    img.get("favorite").and_then(|v| v.as_bool())
}
fn width_of(img: &Value) -> Option<i64> {
    img.get("width").and_then(|v| v.as_i64())
}
fn height_of(img: &Value) -> Option<i64> {
    img.get("height").and_then(|v| v.as_i64())
}
fn tags_of(img: &Value) -> Vec<String> {
    img.get("tags")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|t| t.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

// --- filtering (mirrors GalleryViewer.applyFilter) --------------------------

fn passes_filter(img: &Value, filter: &Value) -> bool {
    // folder
    if let Some(folder) = filter.get("folder").and_then(|v| v.as_str()) {
        if !path_of(img).starts_with(folder) {
            return false;
        }
    }
    // tags (any-of)
    if let Some(tags) = filter.get("tags").and_then(|v| v.as_array()) {
        if !tags.is_empty() {
            let img_tags = tags_of(img);
            let any = tags
                .iter()
                .filter_map(|t| t.as_str())
                .any(|t| img_tags.iter().any(|it| it == t));
            if !any {
                return false;
            }
        }
    }
    // favorite (only when defined)
    if let Some(fav) = filter.get("favorite").and_then(|v| v.as_bool()) {
        if favorite_of(img).unwrap_or(false) != fav {
            return false;
        }
    }
    // rating (>=)
    if let Some(rating) = filter.get("rating").and_then(|v| v.as_f64()) {
        let r = img.get("rating").and_then(|v| v.as_f64());
        match r {
            Some(rv) if rv >= rating => {}
            _ => return false,
        }
    }
    // date range (against createdAt)
    if let Some(dr) = filter.get("dateRange") {
        let start = dr.get("start").and_then(|v| v.as_i64()).unwrap_or(i64::MIN);
        let end = dr.get("end").and_then(|v| v.as_i64()).unwrap_or(i64::MAX);
        let c = created_at(img);
        if c < start || c > end {
            return false;
        }
    }
    // size range (min/max are optional and truthy-gated, mirroring JS `&&`)
    if let Some(sr) = filter.get("sizeRange") {
        if let Some(min) = sr.get("min").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if size_of(img) < min {
                return false;
            }
        }
        if let Some(max) = sr.get("max").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if size_of(img) > max {
                return false;
            }
        }
    }
    // dimensions
    if let Some(d) = filter.get("dimensions") {
        let w = width_of(img);
        let h = height_of(img);
        if let Some(min_w) = d.get("minWidth").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            match w {
                Some(wv) if wv >= min_w => {}
                _ => return false,
            }
        }
        if let Some(min_h) = d.get("minHeight").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            match h {
                Some(hv) if hv >= min_h => {}
                _ => return false,
            }
        }
        if let Some(max_w) = d.get("maxWidth").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if let Some(wv) = w {
                if wv > max_w {
                    return false;
                }
            }
        }
        if let Some(max_h) = d.get("maxHeight").and_then(|v| v.as_i64()).filter(|n| *n != 0) {
            if let Some(hv) = h {
                if hv > max_h {
                    return false;
                }
            }
        }
    }
    // search (filename or tags, case-insensitive)
    if let Some(search) = filter.get("search").and_then(|v| v.as_str()) {
        if !search.is_empty() {
            let needle = search.to_lowercase();
            let in_name = filename_of(img).to_lowercase().contains(&needle);
            let in_tags = tags_of(img).iter().any(|t| t.to_lowercase().contains(&needle));
            if !in_name && !in_tags {
                return false;
            }
        }
    }
    // extensions (exact membership)
    if let Some(exts) = filter.get("extensions").and_then(|v| v.as_array()) {
        if !exts.is_empty() {
            let ext = extension_of(img);
            let member = exts.iter().filter_map(|e| e.as_str()).any(|e| e == ext);
            if !member {
                return false;
            }
        }
    }
    true
}

// A filter object with no recognized keys is treated as "no filter" upstream;
// here an empty/absent object simply passes everything (passes_filter is all-true).
fn filter_is_active(filter: &Value) -> bool {
    filter
        .as_object()
        .map(|o| !o.is_empty())
        .unwrap_or(false)
}

// --- sorting (default viewer sort: date desc) -------------------------------

fn apply_default_sort(images: &mut [Value]) {
    // GalleryViewer default sort = { field: 'date', direction: 'desc' }.
    // multiplier for desc is -1; comparison = a.createdAt - b.createdAt.
    // desc => larger createdAt first. Stable sort preserves Electron ordering.
    images.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
}

// gallery:getImages(filter?)
fn get_images(app: &tauri::AppHandle, filter: &Value) -> Vec<Value> {
    let mut images = read_images(app);
    if filter_is_active(filter) {
        images.retain(|img| passes_filter(img, filter));
    }
    apply_default_sort(&mut images);
    images
}

// gallery:getImage(imageId)
fn get_image(app: &tauri::AppHandle, image_id: &str) -> Value {
    read_images(app)
        .into_iter()
        .find(|img| id_of(img) == image_id)
        .unwrap_or(Value::Null)
}

// gallery:getMetadata(imageId) -> the GalleryImage.metadata object, or null.
fn get_metadata(app: &tauri::AppHandle, image_id: &str) -> Value {
    read_images(app)
        .into_iter()
        .find(|img| id_of(img) == image_id)
        .and_then(|img| img.get("metadata").cloned())
        .unwrap_or(Value::Null)
}

/// Route a `gallery:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read/data channels are handled; every
/// other gallery channel (the heavy fs/native ones) returns Value::Null so the
/// renderer degrades honestly rather than receiving faked data.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "gallery:getImages" => {
            let filter = args.get(0).cloned().unwrap_or(Value::Null);
            json!(get_images(app, &filter))
        }
        "gallery:getImage" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_image(app, id)
        }
        "gallery:getMetadata" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_metadata(app, id)
        }
        _ => Value::Null,
    }
}
