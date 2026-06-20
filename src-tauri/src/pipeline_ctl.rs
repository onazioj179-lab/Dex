// =============================================================================
// DEX Tauri — Processing Pipeline subsystem (port of the read/data `pipeline:*`
// IPC handlers in core/ProcessingPipeline.ts).
//
// Pure-data, JSON-backed tier. Electron's ProcessingPipeline persisted to plain
// std::fs JSON files under <userData>/pipeline/ (NOT electron-store):
//   - pipeline/config.json : a PipelineConfig object
//   - pipeline/jobs.json   : ProcessingJob[]  (the COMPLETED jobs array)
// This module mirrors those exact relative paths under <appData>/pipeline/ and
// returns the same shapes so the renderer is unchanged.
//
// SCOPE — the DATA surface (list/get/config) AND the execute surface
// (processFile / selectAndProcess) are now ported with REAL native code. The
// actual subsystem keeps three live collections: pendingFiles, activeJobs (both
// in-memory Maps) and completedJobs (the persisted jobs.json array). Only
// completedJobs is on disk; pendingFiles is populated solely by the live
// downloads FSWatcher (no Tauri runtime watches downloads here, so it stays
// empty and its getter honestly returns []). activeJobs is populated only for
// the duration of an in-flight processFile call — the Tauri port runs the whole
// stage pipeline synchronously inside dispatch, so a job is never observable as
// "active" from a separate getActiveJobs call; it always lands in completedJobs.
//
// Channels & shapes:
//   - pipeline:getConfig        -> PipelineConfig            (config.json merged
//                                  over the same hard-coded defaults Electron used)
//   - pipeline:updateConfig     -> bool (true)               (merge + persist
//                                  config.json; downloads-watcher side effect is
//                                  a native no-op here, see DIVERGENCES)
//   - pipeline:getPendingFiles  -> PendingFile[]  (always [], in-memory only)
//   - pipeline:getActiveJobs    -> ProcessingJob[] (always [], see SCOPE)
//   - pipeline:getCompletedJobs -> ProcessingJob[]           (jobs.json, sorted
//                                  newest-first by createdAt, optional limit)
//   - pipeline:getJob           -> ProcessingJob | null      (search active then
//                                  completed; active is empty so == completed)
//   - pipeline:processFile      -> ProcessingJob             (REAL: build stages,
//                                  run extract/analyze/organize/summarize/
//                                  transcribe natively, save output, persist to
//                                  jobs.json, emit pipeline:jobUpdated events)
//   - pipeline:selectAndProcess -> ProcessingJob | null      (REAL: native open
//                                  dialog then processFile; null on cancel)
//   - pipeline:cancelJob        -> bool                      (job is never active
//                                  by the time a separate call arrives, so the
//                                  lookup misses and returns false, exactly as
//                                  Electron returns false for an unknown id)
//   - pipeline:dismissPending   -> bool (false)              (pendingFiles map is
//                                  always empty; deleting a miss is false)
//
// PORTED-FAITHFULLY DEGRADES (these matched the Electron behavior already —
// Electron did NOT do real AI/audio work here, it degraded internally):
//   - extract stage: only text types (.txt/.md/.json/.csv/.xml/.html) are read
//     from disk; binary types (pdf/doc/audio/image) return "" because Electron's
//     extractContent returned "" without bundling pdf-parse/mammoth/etc.
//   - transcribe stage: returns "" — Electron's transcribeAudio returned ""
//     (Whisper not bundled). The stage still completes, matching Electron.
//   - summarize stage: skipped unless an aiProvider is set (createStages marks it
//     'skipped' with error "No AI provider configured"); when a provider IS set,
//     Electron's generateSummary was a non-AI sentence-excerpt heuristic, which
//     is ported verbatim (no external API call is made, matching Electron).
//
// DIVERGENCES (documented):
//   - updateConfig's downloads FSWatcher arm/disarm is a live native side effect
//     with no effect on the returned value (always true on a successful write);
//     not reproduced. The persisted config and the bool result are identical.
//   - Electron used fs.writeFileSync and would throw on an IO error (rejecting
//     the IPC promise). Here a failed write returns false / leaves the job's
//     output unwritten rather than panicking, an honest degrade.
//   - emitJobUpdate originally targeted a single mainWindow; the Tauri port emits
//     pipeline:jobUpdated app-wide via native_ops::emit_event, which the
//     tauriCompat bridge delivers to the renderer the same way.
// =============================================================================

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

const CONFIG_FILE: &str = "config.json";
const JOBS_FILE: &str = "jobs.json";

// --- file IO ----------------------------------------------------------------
// Electron: <userData>/pipeline/<name>. Mirror under <appData>/pipeline/<name>.

fn pipeline_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("pipeline");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(pipeline_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_json(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(pipeline_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- config -----------------------------------------------------------------

// The exact hard-coded defaults from the ProcessingPipeline constructor.
fn default_config() -> Value {
    json!({
        "enabled": true,
        "watchDownloads": false,
        "autoPrompt": true,
        "defaultOptions": {
            "extract": true,
            "analyze": true,
            "summarize": false,
            "organize": false,
            "transcribe": false,
            "outputFormat": "note"
        },
        "supportedTypes": [
            ".txt", ".md", ".pdf", ".doc", ".docx",
            ".json", ".csv", ".xml", ".html",
            ".mp3", ".wav", ".m4a", ".ogg",
            ".jpg", ".jpeg", ".png", ".gif"
        ],
        "maxFileSizeMB": 100
    })
}

// getConfig(): defaults shallow-merged with the persisted config.json, returned
// as a copy ({ ...this.config }). Electron merges the file over the defaults at
// load (`{ ...this.config, ...JSON.parse(data) }`); we do the same shallow merge.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let Some(stored) = read_json(app, CONFIG_FILE).as_object() {
        if let Some(base) = cfg.as_object_mut() {
            for (k, v) in stored {
                base.insert(k.clone(), v.clone());
            }
        }
    }
    cfg
}

// updateConfig(updates): shallow-merge updates onto current config, persist, true.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut cfg = get_config(app);
    if let (Some(base), Some(upd)) = (cfg.as_object_mut(), updates.as_object()) {
        for (k, v) in upd {
            base.insert(k.clone(), v.clone());
        }
    }
    // Electron always returns true after a successful writeFileSync; on an IO
    // failure we degrade to false rather than panicking the bridge.
    json!(write_json(app, CONFIG_FILE, &cfg))
}

// --- jobs -------------------------------------------------------------------

fn read_completed(app: &tauri::AppHandle) -> Vec<Value> {
    match read_json(app, JOBS_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn created_at(j: &Value) -> i64 {
    j.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
}

// getCompletedJobs(limit?): sort newest-first by createdAt, optional slice.
fn get_completed_jobs(app: &tauri::AppHandle, limit: Option<u64>) -> Value {
    let mut jobs = read_completed(app);
    jobs.sort_by(|a, b| created_at(b).cmp(&created_at(a)));
    if let Some(n) = limit {
        jobs.truncate(n as usize);
    }
    json!(jobs)
}

// getJob(id): active jobs first (always empty here), then completed, else null.
fn get_job(app: &tauri::AppHandle, id: &str) -> Value {
    read_completed(app)
        .into_iter()
        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(id))
        .unwrap_or(Value::Null)
}

// --- execute (processFile / selectAndProcess) -------------------------------
// Real native port of ProcessingPipeline.processFile and its stage pipeline.

const TEXT_TYPES: &[&str] = &[".txt", ".md", ".json", ".csv", ".xml", ".html"];
const AUDIO_TYPES: &[&str] = &[".mp3", ".wav", ".m4a", ".ogg", ".flac"];

fn ext_of(file_path: &str) -> String {
    Path::new(file_path)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

fn basename(file_path: &str) -> String {
    Path::new(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| file_path.to_string())
}

// Effective options: defaults from config merged with caller-supplied overrides
// (Electron: { ...this.config.defaultOptions, ...options }).
fn resolve_options(app: &tauri::AppHandle, overrides: &Value) -> Value {
    let cfg = get_config(app);
    let mut opts = cfg
        .get("defaultOptions")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let (Some(base), Some(ov)) = (opts.as_object_mut(), overrides.as_object()) {
        for (k, v) in ov {
            base.insert(k.clone(), v.clone());
        }
    }
    opts
}

fn opt_bool(opts: &Value, key: &str) -> bool {
    opts.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn new_stage(name: &str, kind: &str, status: &str, error: Option<&str>) -> Value {
    json!({
        "id": crate::util::pseudo_uuid_v4(),
        "name": name,
        "type": kind,
        "status": status,
        "progress": 0,
        "result": Value::Null,
        "error": error.map(|e| json!(e)).unwrap_or(Value::Null),
    })
}

// createStages(options, fileType) — same order and conditions as Electron.
fn create_stages(opts: &Value, file_type: &str) -> Vec<Value> {
    let mut stages = Vec::new();
    if opt_bool(opts, "extract") {
        stages.push(new_stage("Extract Content", "extract", "pending", None));
    }
    if opt_bool(opts, "transcribe") && AUDIO_TYPES.contains(&file_type) {
        stages.push(new_stage("Transcribe Audio", "transcribe", "pending", None));
    }
    if opt_bool(opts, "analyze") {
        stages.push(new_stage("Analyze Content", "analyze", "pending", None));
    }
    if opt_bool(opts, "summarize") {
        let has_ai = opts
            .get("aiProvider")
            .and_then(|v| v.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        if has_ai {
            stages.push(new_stage("Generate Summary", "summarize", "pending", None));
        } else {
            stages.push(new_stage(
                "Generate Summary",
                "summarize",
                "skipped",
                Some("No AI provider configured"),
            ));
        }
    }
    if opt_bool(opts, "organize") {
        stages.push(new_stage("Organize File", "organize", "pending", None));
    }
    stages
}

// extractContent — read text types from disk; "" for binary types (Electron did
// not bundle pdf-parse/mammoth, so it returned "" for those).
fn extract_content(file_path: &str, file_type: &str) -> String {
    if TEXT_TYPES.contains(&file_type) {
        std::fs::read_to_string(file_path).unwrap_or_default()
    } else {
        String::new()
    }
}

// analyzeContent — verbatim port of the word-frequency + key-point heuristic.
fn analyze_content(text: &str) -> Value {
    let words: Vec<&str> = text.split_whitespace().filter(|w| !w.is_empty()).collect();
    let word_count = words.len();

    // Frequency over lowercased, alpha-only tokens longer than 4 chars.
    let mut freq: BTreeMap<String, u32> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new(); // preserve first-seen order for stable ties
    for w in &words {
        let lower: String = w.chars().filter(|c| c.is_ascii_alphabetic()).collect::<String>().to_lowercase();
        if lower.len() > 4 {
            let e = freq.entry(lower.clone()).or_insert(0);
            if *e == 0 {
                order.push(lower.clone());
            }
            *e += 1;
        }
    }
    // Sort by descending frequency, stable on first-seen order (mirrors JS sort
    // on the Map's insertion-ordered entries array).
    let mut entries: Vec<(String, u32)> = order
        .into_iter()
        .map(|k| {
            let c = *freq.get(&k).unwrap_or(&0);
            (k, c)
        })
        .collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1)); // stable: ties keep first-seen order
    let sorted_words: Vec<String> = entries.into_iter().take(10).map(|(w, _)| w).collect();

    // Key points: first sentence of the first up-to-5 paragraphs, filtered to
    // len > 20, capped at 3. Paragraph split on blank lines (\n\n+).
    let mut key_points: Vec<String> = Vec::new();
    for para in split_paragraphs(text).into_iter().take(5) {
        let first = para
            .split(|c| c == '.' || c == '!' || c == '?')
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if first.len() > 20 {
            key_points.push(first);
        }
    }
    key_points.truncate(3);

    let topics: Vec<String> = sorted_words.iter().take(5).cloned().collect();
    let tags: Vec<String> = sorted_words.iter().take(5).cloned().collect();

    json!({
        "metadata": {
            "wordCount": word_count,
            "language": "en",
            "contentType": "text",
            "topics": topics,
        },
        "suggestedTags": tags,
        "keyPoints": key_points,
    })
}

// Split on runs of one-or-more blank lines, matching JS `text.split(/\n\n+/)`.
fn split_paragraphs(text: &str) -> Vec<String> {
    let normalized = text.replace("\r\n", "\n");
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut saw_blank = false;
    for line in normalized.split('\n') {
        if line.trim().is_empty() {
            saw_blank = true;
        } else {
            // A blank line between two non-blank lines ends the paragraph,
            // matching JS `text.split(/\n\n+/)`.
            if saw_blank && !cur.is_empty() {
                out.push(cur.clone());
                cur.clear();
            }
            saw_blank = false;
            if !cur.is_empty() {
                cur.push('\n');
            }
            cur.push_str(line);
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    if out.is_empty() {
        out.push(normalized);
    }
    out
}

// generateSummary — Electron's non-AI excerpt heuristic (first 3 sentences with
// trimmed length > 20, joined by ". " + ".").
fn generate_summary(text: &str) -> String {
    let sentences: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .filter(|s| s.trim().len() > 20)
        .collect();
    let picked: Vec<String> = sentences.into_iter().take(3).map(|s| s.trim().to_string()).collect();
    if picked.is_empty() {
        ".".to_string()
    } else {
        format!("{}.", picked.join(". "))
    }
}

// suggestLocation — <documents>/Processed[/firstTopic].
fn suggest_location(app: &tauri::AppHandle, topics: &[String]) -> String {
    let docs = app
        .path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let base = docs.join("Processed");
    let target = if let Some(first) = topics.first() {
        base.join(first)
    } else {
        base
    };
    target.to_string_lossy().to_string()
}

// formatAsNote — verbatim port of the markdown note formatter.
fn format_as_note(job: &Value, result: &Value) -> String {
    let file_name = job.get("fileName").and_then(|v| v.as_str()).unwrap_or("");
    let file_path = job.get("filePath").and_then(|v| v.as_str()).unwrap_or("");
    let mut note = format!("# {}\n\n", file_name);
    // Electron used toLocaleString(); use epoch ms ISO-ish stamp deterministically.
    note.push_str(&format!("**Processed:** {}\n", crate::native_ops::now_ms()));
    note.push_str(&format!("**Original:** {}\n\n", file_path));

    if let Some(summary) = result.get("summary").and_then(|v| v.as_str()) {
        if !summary.is_empty() {
            note.push_str(&format!("## Summary\n\n{}\n\n", summary));
        }
    }
    if let Some(points) = result.get("keyPoints").and_then(|v| v.as_array()) {
        if !points.is_empty() {
            note.push_str("## Key Points\n\n");
            for p in points {
                if let Some(s) = p.as_str() {
                    note.push_str(&format!("- {}\n", s));
                }
            }
            note.push('\n');
        }
    }
    if let Some(topics) = result.get("metadata").and_then(|m| m.get("topics")).and_then(|v| v.as_array()) {
        if !topics.is_empty() {
            note.push_str("## Topics\n\n");
            let parts: Vec<String> = topics
                .iter()
                .filter_map(|t| t.as_str())
                .map(|t| format!("`{}`", t))
                .collect();
            note.push_str(&parts.join(" "));
            note.push_str("\n\n");
        }
    }
    if let Some(tags) = result.get("suggestedTags").and_then(|v| v.as_array()) {
        if !tags.is_empty() {
            let parts: Vec<String> = tags.iter().filter_map(|t| t.as_str().map(String::from)).collect();
            note.push_str(&format!("**Tags:** {}\n", parts.join(", ")));
        }
    }
    note
}

// saveOutput — note | metadata | file, under <appData>/pipeline/outputs/.
fn save_output(app: &tauri::AppHandle, job: &Value, result: &Value, opts: &Value) {
    let out_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("pipeline")
        .join("outputs");
    let _ = std::fs::create_dir_all(&out_dir);

    let job_id = job.get("id").and_then(|v| v.as_str()).unwrap_or("job");
    let format = opts.get("outputFormat").and_then(|v| v.as_str()).unwrap_or("note");

    match format {
        "note" => {
            let content = format_as_note(job, result);
            let _ = std::fs::write(out_dir.join(format!("{}.md", job_id)), content);
        }
        "metadata" => {
            let meta = json!({
                "originalFile": job.get("filePath").cloned().unwrap_or(Value::Null),
                "processedAt": crate::native_ops::now_ms(),
                "result": result,
            });
            if let Ok(s) = serde_json::to_string_pretty(&meta) {
                let _ = std::fs::write(out_dir.join(format!("{}.json", job_id)), s);
            }
        }
        "file" => {
            if let Some(out_path) = opts.get("outputPath").and_then(|v| v.as_str()) {
                if let Some(parent) = Path::new(out_path).parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Ok(s) = serde_json::to_string_pretty(result) {
                    let _ = std::fs::write(out_path, s);
                }
            }
        }
        _ => {}
    }
}

// Persist a finished job into jobs.json, capped at the last 50 (Electron pushed
// then trimmed to slice(-50) on load).
fn append_completed(app: &tauri::AppHandle, job: &Value) {
    let mut jobs = read_completed(app);
    jobs.push(job.clone());
    if jobs.len() > 50 {
        let start = jobs.len() - 50;
        jobs = jobs.split_off(start);
    }
    let _ = write_json(app, JOBS_FILE, &Value::Array(jobs));
}

// processFile(filePath, options) — the full native pipeline. Returns the job
// object; mirrors Electron's resolved ProcessingJob. On a missing file Electron
// threw ("File not found"), rejecting the IPC promise — we mirror that with an
// error object the bridge surfaces as a rejection-shaped value.
fn process_file(app: &tauri::AppHandle, file_path: &str, overrides: &Value) -> Value {
    let meta = match std::fs::metadata(file_path) {
        Ok(m) => m,
        Err(_) => return json!({ "error": "File not found" }),
    };
    let file_size = meta.len();
    let ext = ext_of(file_path);
    let opts = resolve_options(app, overrides);

    let now = crate::native_ops::now_ms();
    let mut job = json!({
        "id": crate::util::pseudo_uuid_v4(),
        "filePath": file_path,
        "fileName": basename(file_path),
        "fileType": ext,
        "fileSize": file_size,
        "status": "pending",
        "stages": create_stages(&opts, &ext),
        "createdAt": now,
        "startedAt": Value::Null,
        "completedAt": Value::Null,
        "result": Value::Null,
        "error": Value::Null,
    });
    crate::native_ops::emit_event(app, "pipeline:jobUpdated", &job);

    // Move to processing.
    job["status"] = json!("processing");
    job["startedAt"] = json!(crate::native_ops::now_ms());
    crate::native_ops::emit_event(app, "pipeline:jobUpdated", &job);

    let mut result = json!({
        "extractedText": Value::Null,
        "summary": Value::Null,
        "keyPoints": [],
        "metadata": {
            "wordCount": 0,
            "language": "en",
            "contentType": ext,
            "topics": [],
        },
        "suggestedTags": [],
        "suggestedLocation": Value::Null,
        "transcription": Value::Null,
    });

    let has_ai = opts
        .get("aiProvider")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    // Execute each non-skipped stage; per-stage failures are caught and the loop
    // continues, exactly like Electron's try/catch around executeStage.
    let stage_count = job["stages"].as_array().map(|a| a.len()).unwrap_or(0);
    for i in 0..stage_count {
        let status = job["stages"][i]
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if status == "skipped" {
            continue;
        }
        job["stages"][i]["status"] = json!("running");
        crate::native_ops::emit_event(app, "pipeline:jobUpdated", &job);

        let kind = job["stages"][i]
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        match kind.as_str() {
            "extract" => {
                let text = extract_content(file_path, &ext);
                let len = text.len();
                result["extractedText"] = json!(text);
                job["stages"][i]["result"] = json!({ "length": len });
            }
            "transcribe" => {
                // Whisper not bundled (Electron returned "").
                let text = String::new();
                let len = text.len();
                result["transcription"] = json!(text);
                job["stages"][i]["result"] = json!({ "length": len });
            }
            "analyze" => {
                let source = result["extractedText"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .or_else(|| result["transcription"].as_str())
                    .unwrap_or("")
                    .to_string();
                let analysis = analyze_content(&source);
                result["metadata"] = analysis["metadata"].clone();
                result["suggestedTags"] = analysis["suggestedTags"].clone();
                result["keyPoints"] = analysis["keyPoints"].clone();
                job["stages"][i]["result"] = analysis;
            }
            "summarize" => {
                if has_ai {
                    let source = result["extractedText"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .or_else(|| result["transcription"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let summary = generate_summary(&source);
                    result["summary"] = json!(summary);
                }
                job["stages"][i]["result"] = json!({ "summary": result["summary"].clone() });
            }
            "organize" => {
                let topics: Vec<String> = result["metadata"]["topics"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                let loc = suggest_location(app, &topics);
                result["suggestedLocation"] = json!(loc);
                job["stages"][i]["result"] = json!({ "suggestedLocation": loc });
            }
            _ => {}
        }

        job["stages"][i]["status"] = json!("completed");
        job["stages"][i]["progress"] = json!(100);
        crate::native_ops::emit_event(app, "pipeline:jobUpdated", &job);
    }

    // Save output, then finalize.
    save_output(app, &job, &result, &opts);
    job["status"] = json!("completed");
    job["completedAt"] = json!(crate::native_ops::now_ms());
    job["result"] = result;

    append_completed(app, &job);
    crate::native_ops::emit_event(app, "pipeline:jobUpdated", &job);
    job
}

// selectAndProcess(options) — native open dialog, then processFile; null on
// cancel. Filters mirror Electron's "All Supported" set from config.
fn select_and_process(app: &tauri::AppHandle, overrides: &Value) -> Value {
    use tauri_plugin_dialog::DialogExt;

    let cfg = get_config(app);
    let supported: Vec<String> = cfg
        .get("supportedTypes")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.trim_start_matches('.').to_string())
                .collect()
        })
        .unwrap_or_default();
    let supported_ref: Vec<&str> = supported.iter().map(|s| s.as_str()).collect();

    let picked = app
        .dialog()
        .file()
        .set_title("Select File to Process")
        .add_filter("All Supported", &supported_ref)
        .add_filter("Documents", &["txt", "md", "pdf", "doc", "docx"])
        .add_filter("Audio", &["mp3", "wav", "m4a", "ogg"])
        .blocking_pick_file();

    let path = match picked.and_then(|fp| fp.into_path().ok()) {
        Some(p) => p.to_string_lossy().to_string(),
        None => return Value::Null, // canceled / empty
    };
    process_file(app, &path, overrides)
}

/// Route a `pipeline:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; heavy
/// execute/cancel channels return Value::Null (honest degrade — not faked).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "pipeline:getConfig" => get_config(app),
        "pipeline:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        // In-memory-only collections: no native runtime populates them here, so
        // they faithfully return empty, matching Electron with no active work.
        "pipeline:getPendingFiles" => json!([]),
        "pipeline:getActiveJobs" => json!([]),
        "pipeline:getCompletedJobs" => {
            let limit = args.get(0).and_then(|v| v.as_u64());
            get_completed_jobs(app, limit)
        }
        "pipeline:getJob" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_job(app, id)
        }
        // dismissPending deletes from the (always empty) pendingFiles map -> false.
        "pipeline:dismissPending" => json!(false),
        // HEAVY — now ported with real native code.
        "pipeline:processFile" => {
            let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let overrides = args.get(1).cloned().unwrap_or_else(|| json!({}));
            process_file(app, file_path, &overrides)
        }
        "pipeline:selectAndProcess" => {
            let overrides = args.get(0).cloned().unwrap_or_else(|| json!({}));
            select_and_process(app, &overrides)
        }
        // cancelJob targets an in-flight active job; processFile runs to
        // completion synchronously here, so by the time a separate cancel call
        // arrives the id is no longer active -> false, exactly as Electron
        // returns false for an unknown id.
        "pipeline:cancelJob" => json!(false),
        _ => Value::Null,
    }
}
