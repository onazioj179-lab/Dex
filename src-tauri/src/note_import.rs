// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{fs::File, io::Read, path::Path};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const LIMIT: usize = 24 * 1024 * 1024;

pub(crate) fn pick(app: &AppHandle) -> Value {
    match app
        .dialog()
        .file()
        .add_filter("Word documents and text", &["docx", "txt"])
        .blocking_pick_file()
        .and_then(crate::native_ops::fp_to_string)
    {
        Some(path) => json!({"filePath": path}),
        None => Value::Null,
    }
}

fn decode_text(bytes: Vec<u8>) -> Result<String, String> {
    let Some((endian, raw)) = bytes
        .strip_prefix(&[0xff, 0xfe])
        .map(|raw| (u16::from_le_bytes as fn([u8; 2]) -> u16, raw))
        .or_else(|| {
            bytes
                .strip_prefix(&[0xfe, 0xff])
                .map(|raw| (u16::from_be_bytes as fn([u8; 2]) -> u16, raw))
        })
    else {
        return String::from_utf8(bytes)
            .map(|text| text.trim_start_matches('\u{feff}').to_owned())
            .map_err(|_| "This file is not UTF-8 or UTF-16 text.".into());
    };
    if raw.len() % 2 != 0 {
        return Err("The text file ends in an incomplete UTF-16 character.".into());
    }
    let words: Vec<_> = raw
        .chunks_exact(2)
        .map(|pair| endian([pair[0], pair[1]]))
        .collect();
    String::from_utf16(&words).map_err(|_| "Could not decode the UTF-16 text.".into())
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else {
        None
    }
}

fn read_document(raw: &str) -> Result<Value, String> {
    let path = Path::new(raw);
    if !path.is_absolute() || !path.is_file() {
        return Err("The local document is unavailable.".into());
    }
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension != "docx" && extension != "txt" {
        return Err("Choose a Word .docx or plain-text .txt file.".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|error| error.to_string())?
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > LIMIT {
        return Err("The imported document exceeds the 24 MiB Notes import limit.".into());
    }
    let title = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Imported note");
    if extension == "txt" {
        return Ok(
            json!({"success": true, "title": title, "kind": "text", "text": decode_text(bytes)?}),
        );
    }
    let parts = crate::archive_ctl::read_zip_parts(&bytes, LIMIT, |name| {
        matches!(
            name,
            "word/document.xml" | "word/numbering.xml" | "word/_rels/document.xml.rels"
        ) || name
            .strip_prefix("word/media/")
            .is_some_and(|file| !file.is_empty() && !file.contains(['/', '\\']))
    })?;
    let mut document = None;
    let mut numbering = None;
    let mut relationships = None;
    let mut images = serde_json::Map::new();
    for (name, bytes) in parts {
        match name.as_str() {
            "word/document.xml" => document = Some(decode_text(bytes)?),
            "word/numbering.xml" => numbering = Some(decode_text(bytes)?),
            "word/_rels/document.xml.rels" => relationships = Some(decode_text(bytes)?),
            _ => {
                if let Some(mime) = image_mime(&bytes) {
                    images.insert(
                        name,
                        json!(format!("data:{mime};base64,{}", STANDARD.encode(bytes))),
                    );
                }
            }
        }
    }
    Ok(json!({"success": true, "title": title, "kind": "word",
        "document": document.ok_or("The file does not contain a Word document body.")?,
        "numbering": numbering, "relationships": relationships, "images": images}))
}

pub(crate) fn read(raw: &str) -> Value {
    read_document(raw).unwrap_or_else(|error| json!({"success": false, "error": error}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_word_parts_without_extracting_other_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Example.docx");
        let package = crate::archive_ctl::zip_parts(&[
            ("word/document.xml", b"<document/>"),
            ("word/numbering.xml", b"<numbering/>"),
            ("word/media/image1.png", b"\x89PNG\r\n\x1a\n"),
            ("word/media/image2.svg", b"<svg/>"),
            ("../ignored.txt", b"ignored"),
        ]);
        std::fs::write(&path, package).unwrap();
        let result = read_document(path.to_str().unwrap()).unwrap();
        assert_eq!(result["title"], "Example");
        assert_eq!(result["document"], "<document/>");
        assert_eq!(result["numbering"], "<numbering/>");
        assert_eq!(result["images"].as_object().unwrap().len(), 1);
        assert_eq!(
            result["images"]["word/media/image1.png"],
            "data:image/png;base64,iVBORw0KGgo="
        );
        assert!(!dir.path().join("ignored.txt").exists());
    }

    #[test]
    fn decodes_utf16_bom_and_rejects_incomplete_text() {
        assert_eq!(decode_text(vec![0xff, 0xfe, 65, 0]).unwrap(), "A");
        assert!(decode_text(vec![0xff, 0xfe, 65]).is_err());
    }
}
