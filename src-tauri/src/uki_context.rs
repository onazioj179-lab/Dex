// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use serde_json::{json, Value};

fn bounded(text: &str, max: usize) -> String {
    text.chars()
        .filter(|ch| !ch.is_control() || matches!(ch, '\n' | '\t'))
        .take(max)
        .collect()
}

fn file_label(path: &str) -> Option<String> {
    if let Ok(url) = tauri::Url::parse(path) {
        if matches!(url.scheme(), "http" | "https") {
            return url.host_str().map(|host| bounded(host, 120));
        }
    }
    let file = path.rsplit(['/', '\\']).find(|part| !part.is_empty())?;
    Some(bounded(file.split(['?', '#']).next()?, 120))
}

fn sanitize(app_id: &str, selection: bool, snapshot: &Value) -> Value {
    let mut result = json!({ "appId": app_id });
    // The Notes resolver's "file" is derived from the first line of the body.
    // It is document content, so it is excluded from both metadata modes.
    if app_id != "notes" {
        let file = snapshot["currentFile"].as_str();
        let label = if app_id == "browser" {
            file.and_then(|address| {
                let url = tauri::Url::parse(address).ok()?;
                if !matches!(url.scheme(), "http" | "https") {
                    return None;
                }
                url.host_str().map(|host| bounded(host, 120))
            })
        } else {
            file.and_then(file_label)
        };
        if let Some(label) = label {
            if !label.is_empty() {
                result["currentFile"] = json!(label);
            }
        }
    }
    let mut details = serde_json::Map::new();
    for key in [
        "loading",
        "openTabs",
        "selectedCount",
        "itemCount",
        "wordCount",
        "fileCount",
    ] {
        if let Some(value) = snapshot["custom"].get(key) {
            if value.is_boolean() || value.as_u64().is_some_and(|count| count <= 1_000_000) {
                details.insert(key.into(), value.clone());
            }
        }
    }
    if !details.is_empty() {
        result["custom"] = Value::Object(details);
    }
    if selection {
        if let Some(text) = snapshot["selectionText"].as_str() {
            let selection = bounded(text.trim(), 320);
            if !selection.is_empty() {
                result["selectionText"] = json!(selection);
            }
        }
    }
    result
}

pub fn filter(app: &tauri::AppHandle, snapshot: &Value) -> Value {
    let Some(id) = snapshot["appId"].as_str() else {
        return Value::Null;
    };
    let Some(selection) = crate::app_preferences::uki_context_mode(app, id) else {
        return Value::Null;
    };
    if !crate::uki_permissions::granted(app, "screen-read") {
        return Value::Null;
    }
    sanitize(id, selection, snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_notes_body_and_arbitrary_metadata() {
        let snapshot = json!({ "currentFile": "private opening line", "focusedItemId": "private ID",
            "selectionText": "private text", "custom": { "fileCount": 4, "folder": "private path" } });
        assert_eq!(
            sanitize("notes", false, &snapshot),
            json!({ "appId": "notes", "custom": { "fileCount": 4 } })
        );
        assert_eq!(
            sanitize("notes", true, &snapshot)["selectionText"],
            "private text"
        );
    }

    #[test]
    fn browser_metadata_contains_the_host_and_omits_url_credentials_and_query() {
        let snapshot = json!({ "currentFile": "https://user:secret@example.org/private?token=private", "custom": { "openTabs": 5 } });
        assert_eq!(
            sanitize("browser", false, &snapshot),
            json!({ "appId": "browser", "currentFile": "example.org", "custom": { "openTabs": 5 } })
        );
    }
}
