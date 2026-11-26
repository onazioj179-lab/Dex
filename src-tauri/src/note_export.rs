// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{io, io::Write, path::Path};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#;
const RELATIONSHIPS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

const LIMIT: usize = 32 * 1024 * 1024;

fn word_document(xml: &str, links: &str, numbering: &str, images: &Value) -> io::Result<Vec<u8>> {
    let mut total = xml
        .len()
        .saturating_add(links.len())
        .saturating_add(numbering.len());
    if total > LIMIT {
        return Err(io::Error::other("The formatted export exceeds 32 MiB."));
    }
    let mut pictures = Vec::new();
    for (index, image) in images.as_array().into_iter().flatten().enumerate() {
        let format = image["format"].as_str().unwrap_or("");
        let base64 = image["base64"]
            .as_str()
            .ok_or_else(|| io::Error::other("Missing image data."))?;
        total = total.saturating_add(base64.len());
        if total > LIMIT {
            return Err(io::Error::other("The formatted export exceeds 32 MiB."));
        }
        let bytes = STANDARD.decode(base64).map_err(io::Error::other)?;
        let supported = match format {
            "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            "jpeg" => bytes.starts_with(b"\xff\xd8"),
            "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
            _ => false,
        };
        if !supported {
            return Err(io::Error::other("Invalid embedded image."));
        }
        pictures.push((format!("word/media/image{}.{format}", index + 1), bytes));
    }
    let types = if numbering.is_empty() {
        CONTENT_TYPES.to_owned()
    } else {
        CONTENT_TYPES.replace("</Types>", "<Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/>\n</Types>")
    };
    let mut parts = vec![
        ("[Content_Types].xml", types.as_bytes()),
        ("_rels/.rels", RELATIONSHIPS.as_bytes()),
        ("word/document.xml", xml.as_bytes()),
        ("word/_rels/document.xml.rels", links.as_bytes()),
    ];
    if !numbering.is_empty() {
        parts.push(("word/numbering.xml", numbering.as_bytes()));
    }
    parts.extend(
        pictures
            .iter()
            .map(|(path, bytes)| (path.as_str(), bytes.as_slice())),
    );
    Ok(crate::archive_ctl::zip_parts(&parts))
}

fn save(app: &AppHandle, args: &Value) -> io::Result<Value> {
    let format = args[0].as_str().unwrap_or("");
    let label = match format {
        "docx" => "Word document",
        "md" => "Markdown",
        "txt" => "Plain text",
        "html" => "HTML document",
        "json" => "JSON",
        _ => return Err(io::Error::other("Unsupported note export format.")),
    };
    let title = args[1].as_str().unwrap_or("Untitled");
    let text = args[2]
        .as_str()
        .ok_or_else(|| io::Error::other("Missing export content."))?;
    let links = args[3].as_str().unwrap_or("");
    let numbering = args[4].as_str().unwrap_or("");
    if text.len() > LIMIT {
        return Err(io::Error::other("The formatted export exceeds 32 MiB."));
    }
    let name: String = title
        .chars()
        .take(96)
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let name = name.trim_matches(|c: char| c == '.' || c.is_whitespace());
    let name = if name.is_empty() { "Untitled" } else { name };
    let Some(destination) = app
        .dialog()
        .file()
        .set_file_name(format!("{name}.{format}"))
        .add_filter(label, &[format])
        .blocking_save_file()
        .and_then(crate::native_ops::fp_to_string)
    else {
        return Ok(json!({"success": true, "canceled": true}));
    };
    let path = Path::new(&destination);
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Missing export folder."))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    if format == "docx" {
        temp.write_all(&word_document(text, links, numbering, &args[5])?)?;
    } else {
        temp.write_all(text.as_bytes())?;
    }
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(json!({"success": true, "path": destination}))
}

pub(crate) fn export(app: &AppHandle, args: &Value) -> Value {
    save(app, args).unwrap_or_else(|error| json!({"success": false, "error": error.to_string()}))
}
