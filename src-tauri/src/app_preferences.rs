// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use serde_json::{json, Value};
use std::{io, sync::OnceLock};
use tauri::{Emitter, Manager};

pub(crate) const KEY: &str = "app-preferences";
const VERSION: u64 = 1;

fn schema() -> &'static Value {
    static SCHEMA: OnceLock<Value> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/shared/appPreferences.json"))
            .expect("app preferences schema must be valid JSON")
    })
}

fn read(value: Value) -> io::Result<Value> {
    if value.is_null() {
        Ok(json!({ "version": VERSION, "apps": {} }))
    } else if value["version"].as_u64() == Some(VERSION) && value["apps"].is_object() {
        Ok(value)
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported app preferences version or invalid app preferences",
        ))
    }
}

fn inherit_legacy_browser(preferences: &mut Value, legacy: &Value) {
    let decoded = legacy
        .as_str()
        .and_then(|text| serde_json::from_str::<Value>(text).ok());
    let legacy = decoded.as_ref().unwrap_or(legacy);
    let provider = &legacy["defaultSearchEngine"];
    if valid(
        &schema()["applications"]["browser"]["searchProvider"],
        provider,
    ) {
        preferences["apps"]["browser"]["searchProvider"] = provider.clone();
    }
    if legacy["clearOnExit"].as_bool() == Some(true) {
        preferences["apps"]["browser"]["restoreTabs"] = json!(false);
    }
}

fn valid(field: &Value, value: &Value) -> bool {
    if field["default"].is_boolean() {
        return value.is_boolean();
    }
    value
        .as_str()
        .is_some_and(|option| field["options"].get(option).is_some())
}

fn valid_window_size(value: &Value) -> bool {
    let Some(text) = value.as_str() else {
        return false;
    };
    if text == "default" {
        return true;
    }
    let Some((width, height)) = text.split_once('x') else {
        return false;
    };
    let spec = &schema()["windowSize"];
    let valid_side = |text: &str, limits: &Value| {
        !text.starts_with('0')
            && text.bytes().all(|byte| byte.is_ascii_digit())
            && text.parse::<u64>().ok().is_some_and(|number| {
                limits["min"].as_u64().unwrap() <= number
                    && number <= limits["max"].as_u64().unwrap()
            })
    };
    valid_side(width, &spec["width"]) && valid_side(height, &spec["height"])
}

fn has_uki_context(app_id: &str) -> bool {
    schema()["ukiContextApps"]
        .as_array()
        .is_some_and(|apps| apps.iter().any(|app| app.as_str() == Some(app_id)))
}

pub fn uki_context_mode(app: &tauri::AppHandle, app_id: &str) -> Option<bool> {
    if !has_uki_context(app_id) {
        return None;
    }
    let path = crate::kv_path(app).ok()?;
    let prefs = read(crate::kv_repository::get_current(&path, KEY).ok()?).ok()?;
    match prefs["apps"][app_id]["ukiContext"].as_str() {
        Some("metadata") => Some(false),
        Some("selection") => Some(true),
        _ => None,
    }
}

pub fn dispatch(app: &tauri::AppHandle, source: &str, channel: &str, args: &Value) -> Value {
    match dispatch_result(app, channel, args) {
        Ok(preferences) => {
            if channel != "app-preferences:get" {
                for label in app.webview_windows().into_keys() {
                    if label != source
                        && (label == "main" || label.starts_with(crate::multi_window::LABEL_PREFIX))
                    {
                        let _ = app.emit_to(
                            tauri::EventTarget::webview_window(label),
                            "dex-app-preferences-changed",
                            (),
                        );
                    }
                }
            }
            json!({ "success": true, "preferences": preferences })
        }
        Err(error) => json!({ "success": false, "error": error.to_string() }),
    }
}

fn dispatch_result(app: &tauri::AppHandle, channel: &str, args: &Value) -> Result<Value, String> {
    let path = crate::kv_path(app)?;
    if channel == "app-preferences:get" {
        let current = crate::kv_repository::get(&path, KEY).map_err(|error| error.to_string())?;
        let missing = current.is_null();
        let mut preferences = read(current).map_err(|error| error.to_string())?;
        if missing {
            let legacy = crate::kv_repository::get(&path, "dex-browser-settings")
                .map_err(|error| error.to_string())?;
            inherit_legacy_browser(&mut preferences, &legacy);
        }
        return Ok(preferences);
    }
    // The renderer provides the installed desktop registry. Shared window
    // preferences accept bounded identifiers so the native store can also
    // persist future app entries without maintaining a second app roster.
    let app_id = args[0]
        .as_str()
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 48
                && *id != "home"
                && id
                    .bytes()
                    .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == b'-')
        })
        .ok_or("Invalid application ID")?;
    let change = match channel {
        "app-preferences:update" => {
            let key = args[1].as_str().ok_or("Preference key required")?;
            let accepted = match key {
                "windowOpenMode" | "windowTheme" | "appMotion" => valid(&schema()[key], &args[2]),
                "windowSize" => valid_window_size(&args[2]),
                "ukiContext" if has_uki_context(app_id) => valid(&schema()["ukiContext"], &args[2]),
                _ => valid(
                    schema()["applications"][app_id]
                        .get(key)
                        .ok_or("Unknown preference")?,
                    &args[2],
                ),
            };
            if !accepted {
                return Err("Invalid preference value".into());
            }
            Some((key, args[2].clone()))
        }
        "app-preferences:reset" => None,
        _ => return Err("Unknown preference operation".into()),
    };
    let mut result = Value::Null;
    crate::kv_repository::update(&path, |repository| {
        let mut preferences = read(repository.get(KEY).cloned().unwrap_or_default())?;
        if !repository.contains_key(KEY) {
            inherit_legacy_browser(
                &mut preferences,
                repository
                    .get("dex-browser-settings")
                    .unwrap_or(&Value::Null),
            );
        }
        let apps = preferences["apps"]
            .as_object_mut()
            .expect("validated above");
        if let Some((key, value)) = change {
            if apps.len() >= 128 && !apps.contains_key(app_id) {
                return Err(io::Error::other("Application preferences storage is full"));
            }
            let settings = apps.entry(app_id).or_insert_with(|| json!({}));
            let fields = settings.as_object_mut().ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Invalid application preferences",
                )
            })?;
            fields.insert(key.into(), value);
        } else {
            apps.remove(app_id);
        }
        repository.insert(KEY.into(), preferences.clone());
        result = preferences;
        Ok(())
    })
    .map_err(|error| error.to_string())?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_start_at_the_current_version_and_future_versions_are_preserved() {
        assert_eq!(
            read(Value::Null).unwrap(),
            json!({ "version": 1, "apps": {} })
        );
        assert!(read(json!({ "version": 2, "apps": {} })).is_err());
    }

    #[test]
    fn validates_type_and_membership() {
        let browser = &schema()["applications"]["browser"];
        assert!(valid(&browser["restoreTabs"], &json!(false)));
        assert!(!valid(&browser["restoreTabs"], &json!("false")));
        assert!(valid(&browser["searchProvider"], &json!("brave")));
        assert!(!valid(&browser["searchProvider"], &json!("unknown")));
        assert!(valid(&schema()["windowTheme"], &json!("dark")));
        assert!(!valid(&schema()["windowTheme"], &json!("native")));
        assert!(valid(&schema()["appMotion"], &json!("reduced")));
        assert!(!valid(&schema()["appMotion"], &json!("force")));
    }

    #[test]
    fn validates_window_size_atomically_and_accepts_inheritance() {
        for value in ["default", "260x220", "1280x720", "3840x2160"] {
            assert!(valid_window_size(&json!(value)), "{value}");
        }
        for value in [
            "259x220",
            "260x219",
            "3841x2160",
            "3840x2161",
            "0260x220",
            "+260x220",
            "260 x220",
            "260x220x1",
            "260x",
        ] {
            assert!(!valid_window_size(&json!(value)), "{value}");
        }
        assert!(!valid_window_size(&json!({ "w": 800, "h": 600 })));
    }

    #[test]
    fn migrates_a_legacy_search_provider() {
        let mut preferences = read(Value::Null).unwrap();
        inherit_legacy_browser(
            &mut preferences,
            &json!("{\"defaultSearchEngine\":\"brave\",\"clearOnExit\":true}"),
        );
        assert_eq!(preferences["apps"]["browser"]["searchProvider"], "brave");
        assert_eq!(preferences["apps"]["browser"]["restoreTabs"], false);
    }
}
