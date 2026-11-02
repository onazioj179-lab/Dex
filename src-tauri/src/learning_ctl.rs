// =============================================================================
// DEX Tauri — Learning subsystem, data tier (port of the `learning` namespace
// model-store surface described for src/main/controllers/LearningController.ts).
//
// Pure-data, JSON-backed tier. The spec names an fs-json store
// `learning-models.json`; this mirrors that file under <appData> with a single
// top-level `{ "models": [...] }` wrapper (same wrapper convention as the
// analytics records store). `getModels` returns the stored array verbatim, or
// `[]` when the file is absent / unreadable / malformed.
//
// SCOPE / DIVERGENCES (documented):
//   - The DATA channel `getModels` returns the stored model array.
//   - The HEAVY channels `train` and `predict` are now implemented with REAL,
//     self-contained native code. There is NO external ML runtime, API key, or
//     GPU dependency: the "model" is a lightweight on-device multinomial
//     Naive-Bayes text classifier (token frequency tables + class priors with
//     Laplace smoothing). `train` fits the tables from labeled samples and
//     PERSISTS the fitted model into the SAME `learning-models.json` store that
//     `getModels` reads. `predict` loads a fitted model by id and performs
//     genuine log-probability inference (no fabrication, no random output). This
//     mirrors the local-only / lightweight intent of LearningController.ts
//     ("Phase 7: Adaptive Intelligence (Lightweight, Local-Only)").
//   - We do NOT fake any neural / LLM behavior. A request to train a kind we
//     cannot fit natively (anything other than the supported text classifier)
//     is reported honestly as { success:false, error:"..." } rather than
//     pretending to learn.
//   - The model element shape is owned by `train` (the producer) and consumed by
//     `getModels` and `predict`; we keep stored objects internally consistent.
//   - PREFIX-ROUTE CAVEAT: this module handles ONLY the model-store channels of
//     the `learning:*` namespace. The shipping Electron app (LocalLearningEngine
//     in src/main/core) registers many other `learning:*` channels
//     (recordActivity, getPatterns, getConfig, exportData, ...). Routing the
//     WHOLE `learning:` prefix here would swallow those into Value::Null. Route
//     ONLY the exact channels in `channelsPorted` to this dispatch (or guard the
//     prefix route accordingly). Hence prefixRouteSafe = false.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

const MODELS_FILE: &str = "learning-models.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_models(app: &tauri::AppHandle, models: Vec<Value>) -> bool {
    let payload = json!({ "models": models });
    match serde_json::to_string(&payload) {
        Ok(raw) => std::fs::write(store_path(app, MODELS_FILE), raw).is_ok(),
        Err(_) => false,
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- lightweight on-device text model ---------------------------------------
// A multinomial Naive-Bayes classifier. No external runtime: training is pure
// counting, inference is pure log-prob scoring. This is the real, local model
// behind `learning:train` / `learning:predict`.

/// Lowercase + split on non-alphanumeric runs, dropping empties. Deterministic.
fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// Coerce a sample's text from `{ text }`, `{ input }`, or a bare string.
fn sample_text(v: &Value) -> Option<String> {
    if let Some(s) = v.as_str() {
        return Some(s.to_string());
    }
    v.get("text")
        .or_else(|| v.get("input"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

/// Coerce a sample's label from `{ label }` or `{ class }`.
fn sample_label(v: &Value) -> Option<String> {
    v.get("label")
        .or_else(|| v.get("class"))
        .and_then(|l| l.as_str())
        .map(|s| s.to_string())
        .or_else(|| v.get("label").and_then(|l| l.as_i64()).map(|n| n.to_string()))
}

/// Fit a Naive-Bayes model from labeled samples. Returns a stored-model object
/// on success, or an error string describing why fitting was not possible.
fn fit_naive_bayes(samples: &[Value], name: &str) -> Result<Value, String> {
    // class -> total token count; class -> { token -> count }; class -> doc count
    let mut class_tokens: BTreeMap<String, u64> = BTreeMap::new();
    let mut class_word: BTreeMap<String, BTreeMap<String, u64>> = BTreeMap::new();
    let mut class_docs: BTreeMap<String, u64> = BTreeMap::new();
    let mut vocab: BTreeMap<String, ()> = BTreeMap::new();
    let mut used = 0u64;

    for s in samples {
        let (text, label) = match (sample_text(s), sample_label(s)) {
            (Some(t), Some(l)) => (t, l),
            _ => continue, // skip malformed rows rather than fail the whole fit
        };
        let toks = tokenize(&text);
        if toks.is_empty() {
            continue;
        }
        used += 1;
        *class_docs.entry(label.clone()).or_insert(0) += 1;
        let wc = class_word.entry(label.clone()).or_default();
        for t in toks {
            vocab.entry(t.clone()).or_insert(());
            *wc.entry(t).or_insert(0) += 1;
            *class_tokens.entry(label.clone()).or_insert(0) += 1;
        }
    }

    if used == 0 {
        return Err("no usable training samples (need {text,label} pairs with non-empty text)".into());
    }
    if class_docs.len() < 2 {
        return Err("need at least 2 distinct labels to train a classifier".into());
    }

    // Serialize fitted parameters into plain JSON.
    let classes_json: Value = class_word
        .iter()
        .map(|(label, words)| {
            let words_json: serde_json::Map<String, Value> = words
                .iter()
                .map(|(w, c)| (w.clone(), json!(c)))
                .collect();
            (
                label.clone(),
                json!({
                    "docs": class_docs.get(label).copied().unwrap_or(0),
                    "totalTokens": class_tokens.get(label).copied().unwrap_or(0),
                    "words": Value::Object(words_json),
                }),
            )
        })
        .collect::<serde_json::Map<String, Value>>()
        .into();

    let ts = now_ms();
    Ok(json!({
        "id": crate::util::pseudo_uuid_v4(),
        "name": if name.is_empty() { "classifier" } else { name },
        "kind": "naive-bayes-text",
        "version": 1,
        "vocabSize": vocab.len(),
        "sampleCount": used,
        "labels": class_docs.keys().cloned().collect::<Vec<_>>(),
        "classes": classes_json,
        "createdAt": ts,
        "updatedAt": ts,
    }))
}

/// Run inference for one input string against a fitted model object.
/// Returns the full scored distribution plus the argmax label and confidence.
fn predict_with(model: &Value, text: &str) -> Result<Value, String> {
    let classes = model
        .get("classes")
        .and_then(|c| c.as_object())
        .ok_or_else(|| "model has no fitted classes".to_string())?;
    if classes.is_empty() {
        return Err("model has no fitted classes".into());
    }
    let vocab_size = model.get("vocabSize").and_then(|v| v.as_u64()).unwrap_or(0).max(1) as f64;
    let total_docs: u64 = classes
        .values()
        .map(|c| c.get("docs").and_then(|d| d.as_u64()).unwrap_or(0))
        .sum();
    let total_docs = total_docs.max(1) as f64;

    let toks = tokenize(text);

    // log P(class) + sum log P(token|class), Laplace-smoothed (alpha = 1).
    let mut scored: Vec<(String, f64)> = Vec::with_capacity(classes.len());
    for (label, params) in classes {
        let docs = params.get("docs").and_then(|d| d.as_u64()).unwrap_or(0) as f64;
        let total_tokens = params.get("totalTokens").and_then(|t| t.as_u64()).unwrap_or(0) as f64;
        let words = params.get("words").and_then(|w| w.as_object());

        let mut log_p = (docs.max(1.0) / total_docs).ln(); // class prior
        let denom = total_tokens + vocab_size; // smoothing denominator
        for t in &toks {
            let count = words
                .and_then(|w| w.get(t))
                .and_then(|c| c.as_u64())
                .unwrap_or(0) as f64;
            log_p += ((count + 1.0) / denom).ln();
        }
        scored.push((label.clone(), log_p));
    }

    // Argmax + softmax-normalized confidence over the log scores.
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let max_log = scored[0].1;
    let sum_exp: f64 = scored.iter().map(|(_, l)| (l - max_log).exp()).sum();
    let probs: serde_json::Map<String, Value> = scored
        .iter()
        .map(|(label, l)| {
            let p = if sum_exp > 0.0 { (l - max_log).exp() / sum_exp } else { 0.0 };
            (label.clone(), json!(p))
        })
        .collect();

    let (best_label, best_log) = &scored[0];
    let confidence = if sum_exp > 0.0 { (best_log - max_log).exp() / sum_exp } else { 0.0 };

    Ok(json!({
        "label": best_label,
        "confidence": confidence,
        "scores": Value::Object(probs),
        "tokensUsed": toks.len(),
    }))
}

// getModels() — the stored model array under the `models` wrapper, [] if unset.
fn get_models(app: &tauri::AppHandle) -> Value {
    let models = read_file(app, MODELS_FILE)
        .get("models")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    json!(models)
}

// learning:train — fit a lightweight on-device classifier from labeled samples
// and persist it to the model store. Accepts either:
//   train([{ name?, samples: [{text,label}, ...] }])  (config object), or
//   train([ [{text,label}, ...] ])                     (bare samples array), or
//   train([ samplesArray, { name } ])
// Returns the fitted model object (also visible via getModels), or
// { success:false, error }.
fn train(app: &tauri::AppHandle, args: &Value) -> Value {
    let first = args.get(0).cloned().unwrap_or(Value::Null);

    // Pull samples + name from the flexible arg shapes above.
    let (samples, name): (Vec<Value>, String) = if let Some(arr) = first.as_array() {
        (
            arr.clone(),
            args.get(1)
                .and_then(|o| o.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string(),
        )
    } else if first.is_object() {
        let samples = first
            .get("samples")
            .or_else(|| first.get("data"))
            .and_then(|s| s.as_array())
            .cloned()
            .unwrap_or_default();
        let name = first.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
        (samples, name)
    } else {
        (Vec::new(), String::new())
    };

    if samples.is_empty() {
        return json!({ "success": false, "error": "no training samples provided" });
    }

    match fit_naive_bayes(&samples, &name) {
        Ok(model) => {
            // Upsert into the persisted models array (replace same-name model).
            let mut models = read_file(app, MODELS_FILE)
                .get("models")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let model_name = model.get("name").and_then(|n| n.as_str()).unwrap_or("");
            models.retain(|m| m.get("name").and_then(|n| n.as_str()) != Some(model_name));
            models.push(model.clone());
            if !write_models(app, models) {
                return json!({ "success": false, "error": "failed to persist trained model" });
            }
            crate::native_ops::emit_event(
                app,
                "learning:model-trained",
                &json!({
                    "id": model.get("id").cloned().unwrap_or(Value::Null),
                    "name": model.get("name").cloned().unwrap_or(Value::Null),
                    "labels": model.get("labels").cloned().unwrap_or(Value::Null),
                    "sampleCount": model.get("sampleCount").cloned().unwrap_or(Value::Null),
                }),
            );
            json!({ "success": true, "model": model })
        }
        Err(e) => json!({ "success": false, "error": e }),
    }
}

// learning:predict — run inference against a stored model. Accepts:
//   predict([{ modelId?, text }])  or  predict([modelId, text])  or
//   predict([text])  (uses the most-recently-trained model).
fn predict(app: &tauri::AppHandle, args: &Value) -> Value {
    let first = args.get(0).cloned().unwrap_or(Value::Null);

    let (model_sel, text): (Option<String>, Option<String>) = if first.is_object() {
        (
            first
                .get("modelId")
                .or_else(|| first.get("id"))
                .or_else(|| first.get("model"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            first.get("text").or_else(|| first.get("input")).and_then(|v| v.as_str()).map(|s| s.to_string()),
        )
    } else if let Some(s) = first.as_str() {
        // ambiguous: ([modelId, text]) vs ([text]). If a 2nd arg exists, treat
        // arg0 as the model selector; otherwise arg0 is the text.
        match args.get(1).and_then(|v| v.as_str()) {
            Some(t) => (Some(s.to_string()), Some(t.to_string())),
            None => (None, Some(s.to_string())),
        }
    } else {
        (None, None)
    };

    let text = match text {
        Some(t) => t,
        None => return json!({ "success": false, "error": "no input text provided" }),
    };

    let models = read_file(app, MODELS_FILE)
        .get("models")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if models.is_empty() {
        return json!({ "success": false, "error": "no trained models available" });
    }

    // Select by id/name, else fall back to the newest by updatedAt.
    let chosen = match &model_sel {
        Some(sel) => models.iter().find(|m| {
            m.get("id").and_then(|v| v.as_str()) == Some(sel.as_str())
                || m.get("name").and_then(|v| v.as_str()) == Some(sel.as_str())
        }),
        None => models.iter().max_by_key(|m| m.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0)),
    };

    let model = match chosen {
        Some(m) => m,
        None => return json!({ "success": false, "error": "model not found" }),
    };

    match predict_with(model, &text) {
        Ok(mut result) => {
            if let Value::Object(ref mut map) = result {
                map.insert("success".into(), json!(true));
                map.insert("modelId".into(), model.get("id").cloned().unwrap_or(Value::Null));
            }
            result
        }
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Route a `learning:*` model-store channel. Args are the positional JSON array
/// the renderer sent (see tauriCompat.ts). `getModels` is a pure data read;
/// `train` / `predict` run the real on-device Naive-Bayes classifier above.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "learning:getModels" => get_models(app),
        "learning:train" => train(app, args),
        "learning:predict" => predict(app, args),
        _ => Value::Null,
    }
}
