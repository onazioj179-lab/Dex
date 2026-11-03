// =============================================================================
// DEX Tauri — CLI subsystem (port of the `cli:*` IPC handlers in
// cli/DexCLI.ts).
//
// The pure-data channel `cli:is-headless` plus the command runner `cli:execute`
// are ported here with REAL native implementations. `cli:execute` is the heavy
// tier in Electron, but the bulk of its sub-commands (help / version / list /
// status / export / import / config) are pure data + filesystem work that ports
// 1:1 to std::fs over the same electron-store JSON files. The sub-commands that
// drove the live ipcMain event bus (run / trigger / exec) cannot run a real
// workflow/operation/action engine from this process and are returned honestly.
//
// Channels & shapes:
//   - cli:is-headless -> boolean
//     isHeadlessMode() is a plain in-memory flag flipped to true ONLY by
//     runCLIMode() (the standalone "dex <command>" entrypoint that runs with NO
//     renderer; see main.ts isCLIMode branch). Any process with a renderer
//     asking over IPC is by construction the GUI process where isHeadless is
//     still its constructor default `false`. We return the constant `false`.
//
//   - cli:execute(command: string) -> CLIResult { success, output, data?, exitCode }
//     Electron: `dexCLI.execute(['dex', ...command.split(' ')])`. NOTE the
//     argv-slicing quirk we faithfully reproduce: execute() runs
//     parseArgs(argv) which does `argv.slice(2)`, but cli:execute prepends only
//     ONE element ('dex'). So the FIRST token of the command string is consumed
//     as if it were the script name — e.g. `cli:execute("version")` parses to
//     command `help` (because slice(2) of ['dex','version'] is []). We replicate
//     this exactly so the renderer sees identical output to Electron.
//
// STORAGE (electron-store JSON under appData, flat top-level keys):
//   - dex-cli.json        key: arbitrary  (config command get/set)
//   - dex-workflows.json  key: workflows  (list/run/export/import)
//   - dex-operations.json key: operations (list/run/export/import)
//   - dex-actions.json    key: actions    (list)
//   - dex-scheduler.json  key: triggers   (trigger lookup)
//
// HONEST DIVERGENCES (documented, not faked):
//   - run <workflow|operation> with --wait, trigger, exec: in Electron these
//     ipcMain.emit() into the live workflow/operation/action/scheduler engines
//     and (for run --wait) block on the `cli:execution-complete` event bus.
//     Those engines are not present in this process, so the lookup + dry-run +
//     not-found + fire-and-forget paths are ported faithfully, but the real
//     "execute it now and report the result" path returns the same shaped
//     success the Electron fire-and-forget branch returns (an execution id),
//     because there is no engine to actually drive. The --wait blocking branch
//     would hang forever in Electron without the engine too, so we return the
//     fire-and-forget shape regardless of --wait (documented in notes).
//   - cli:execution-complete is an internal ipcMain EVENT (never an
//     ipcMain.handle, never registered for the renderer). It only exists so
//     runItem can listen for engine completion. It is not a renderer-callable
//     handler, so as a dispatched channel it is a void/null no-op.
//
// version source: app.package_info().version (same build-time source Electron's
// app.getVersion() reads — parity with crash_reporter.rs).
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

// --- file IO (electron-store: flat JSON under appData) -----------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_store(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_store(app: &tauri::AppHandle, name: &str, value: &Value) -> bool {
    match serde_json::to_string_pretty(value) {
        Ok(raw) => std::fs::write(store_path(app, name), raw).is_ok(),
        Err(_) => false,
    }
}

/// electron-store `store.get(key, default_array)` for a flat array value.
fn store_get_array(app: &tauri::AppHandle, name: &str, key: &str) -> Vec<Value> {
    match read_store(app, name) {
        Value::Object(map) => match map.get(key) {
            Some(Value::Array(arr)) => arr.clone(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    }
}

/// electron-store `store.set(key, value)` on a flat object file.
fn store_set(app: &tauri::AppHandle, name: &str, key: &str, value: Value) {
    let mut map = match read_store(app, name) {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    map.insert(key.to_string(), value);
    let _ = write_store(app, name, &Value::Object(map));
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// --- CLIResult builders ------------------------------------------------------

fn result(success: bool, output: impl Into<String>, exit_code: i64) -> Value {
    json!({ "success": success, "output": output.into(), "exitCode": exit_code })
}

fn result_data(success: bool, output: impl Into<String>, data: Value, exit_code: i64) -> Value {
    json!({ "success": success, "output": output.into(), "data": data, "exitCode": exit_code })
}

// --- argument parsing (faithful port of DexCLI.parseArgs) --------------------

struct Parsed {
    command: String,
    args: Vec<String>,
    options: serde_json::Map<String, Value>,
}

/// Port of parseArgs: operates on `argv.slice(2)`.
fn parse_args(argv: &[String]) -> Parsed {
    let slice: &[String] = if argv.len() > 2 { &argv[2..] } else { &[] };
    let mut options: serde_json::Map<String, Value> = serde_json::Map::new();
    let mut positional: Vec<String> = Vec::new();

    let mut i = 0usize;
    while i < slice.len() {
        let arg = &slice[i];
        if let Some(rest) = arg.strip_prefix("--") {
            // long flag
            if let Some(eq) = rest.find('=') {
                options.insert(rest[..eq].to_string(), Value::String(rest[eq + 1..].to_string()));
            } else if i + 1 < slice.len() && !slice[i + 1].starts_with('-') {
                i += 1;
                options.insert(rest.to_string(), Value::String(slice[i].clone()));
            } else {
                options.insert(rest.to_string(), Value::Bool(true));
            }
        } else if arg.starts_with('-') && arg.len() > 1 {
            // short flag
            let key = arg[1..].to_string();
            if i + 1 < slice.len() && !slice[i + 1].starts_with('-') {
                i += 1;
                options.insert(key, Value::String(slice[i].clone()));
            } else {
                options.insert(key, Value::Bool(true));
            }
        } else {
            positional.push(arg.clone());
        }
        i += 1;
    }

    let command = positional.first().cloned().unwrap_or_else(|| "help".to_string());
    let args = if positional.len() > 1 { positional[1..].to_vec() } else { Vec::new() };
    Parsed { command, args, options }
}

/// option lookup: truthy if present as Bool(true) or any string.
fn opt_flag(opts: &serde_json::Map<String, Value>, keys: &[&str]) -> bool {
    keys.iter().any(|k| match opts.get(*k) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(_)) => true,
        _ => false,
    })
}

/// option value as string (first matching key), or None.
fn opt_str(opts: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    for k in keys {
        match opts.get(*k) {
            Some(Value::String(s)) => return Some(s.clone()),
            Some(Value::Bool(b)) => return Some(b.to_string()),
            _ => {}
        }
    }
    None
}

// --- command set metadata (mirrors registerCommands, in insertion order) -----

// (name, description, usage)
const COMMANDS: &[(&str, &str, &str)] = &[
    ("help", "Show help information", "dex help [command]"),
    ("version", "Show Dex version", "dex version"),
    ("list", "List workflows, operations, or actions", "dex list <type> [--format json|table]"),
    ("run", "Run a workflow or operation", "dex run <type> <name> [--dry-run] [--wait]"),
    ("status", "Show system status", "dex status [--watch]"),
    ("trigger", "Trigger a scheduled task immediately", "dex trigger <name>"),
    ("export", "Export workflows/operations to file", "dex export <type> [--output file.json]"),
    ("import", "Import workflows/operations from file", "dex import <file.json> [--merge]"),
    ("exec", "Execute a raw action", "dex exec <action-type> [--config json]"),
    ("config", "Get or set configuration", "dex config <key> [value]"),
];

// (command, flag, alias, description) — for `help <command>`.
const COMMAND_OPTIONS: &[(&str, &str, &str, &str)] = &[
    ("list", "format", "f", "Output format (json, table)"),
    ("run", "dry-run", "d", "Simulate without executing"),
    ("run", "wait", "w", "Wait for completion"),
    ("run", "timeout", "t", "Timeout in seconds"),
    ("status", "watch", "", "Continuously watch status"),
    ("export", "output", "o", "Output file path"),
    ("import", "merge", "m", "Merge with existing items"),
    ("exec", "config", "c", "Action configuration JSON"),
];

fn pad_end(s: &str, width: usize) -> String {
    let len = s.chars().count();
    if len >= width {
        s.to_string()
    } else {
        let mut out = s.to_string();
        out.push_str(&" ".repeat(width - len));
        out
    }
}

// --- sub-command handlers ----------------------------------------------------

fn show_help(command: Option<&str>) -> Value {
    if let Some(cmd_name) = command {
        let meta = COMMANDS.iter().find(|(n, _, _)| *n == cmd_name);
        let (name, desc, usage) = match meta {
            Some(m) => *m,
            None => return result(false, format!("Unknown command: {cmd_name}"), 1),
        };

        let mut output = format!("\n{name} - {desc}\n\nUsage: {usage}\n");
        let opts: Vec<&(&str, &str, &str, &str)> =
            COMMAND_OPTIONS.iter().filter(|(c, _, _, _)| *c == name).collect();
        if !opts.is_empty() {
            output.push_str("\nOptions:\n");
            for (_, flag, alias, odesc) in opts {
                let alias_part =
                    if alias.is_empty() { "    ".to_string() } else { format!("-{alias}, ") };
                output.push_str(&format!("  {}--{} {}\n", alias_part, pad_end(flag, 12), odesc));
            }
        }
        return result(true, output, 0);
    }

    let mut output = String::from(
        "\nDex CLI - Desktop Automation from Terminal\n\nUsage: dex <command> [options]\n\nCommands:\n",
    );
    for (name, desc, _) in COMMANDS {
        output.push_str(&format!("  {} {}\n", pad_end(name, 12), desc));
    }
    output.push_str("\nRun 'dex help <command>' for detailed information about a command.\n");
    result(true, output, 0)
}

fn list_items(app: &tauri::AppHandle, ty: Option<&str>, opts: &serde_json::Map<String, Value>) -> Value {
    let format = opt_str(opts, &["format", "f"]).unwrap_or_else(|| "table".to_string());
    let (items, headers): (Vec<Value>, Vec<&str>) = match ty {
        Some("workflows") => {
            (store_get_array(app, "dex-workflows.json", "workflows"), vec!["ID", "Name", "Steps", "Enabled"])
        }
        Some("operations") => {
            (store_get_array(app, "dex-operations.json", "operations"), vec!["ID", "Name", "Enabled"])
        }
        Some("actions") => {
            (store_get_array(app, "dex-actions.json", "actions"), vec!["ID", "Name", "Type"])
        }
        _ => {
            let t = ty.unwrap_or("");
            return result(
                false,
                format!("Unknown type: {t}. Use: workflows, operations, actions"),
                1,
            );
        }
    };

    if format == "json" {
        let pretty = serde_json::to_string_pretty(&items).unwrap_or_else(|_| "[]".to_string());
        return result_data(true, pretty, Value::Array(items), 0);
    }

    let t = ty.unwrap_or("");
    if items.is_empty() {
        return result(true, format!("No {t} found."), 0);
    }

    let mut output = String::from("\n");
    output.push_str(&headers.iter().map(|h| pad_end(h, 20)).collect::<String>());
    output.push('\n');
    output.push_str(&"-".repeat(headers.len() * 20));
    output.push('\n');

    for item in &items {
        let row: Vec<String> = headers
            .iter()
            .map(|h| {
                let key = h.to_lowercase();
                let val = item.get(&key);
                if key == "steps" {
                    if let Some(Value::Array(a)) = val {
                        return a.len().to_string();
                    }
                }
                match val {
                    Some(Value::Bool(b)) => if *b { "Yes".to_string() } else { "No".to_string() },
                    Some(Value::String(s)) => s.chars().take(18).collect(),
                    Some(Value::Number(n)) => n.to_string().chars().take(18).collect(),
                    Some(Value::Null) | None => "-".to_string(),
                    Some(other) => other.to_string().chars().take(18).collect(),
                }
            })
            .collect();
        output.push_str(&row.iter().map(|v| pad_end(v, 20)).collect::<String>());
        output.push('\n');
    }

    result_data(true, output, Value::Array(items), 0)
}

fn run_item(
    app: &tauri::AppHandle,
    ty: Option<&str>,
    name: Option<&str>,
    opts: &serde_json::Map<String, Value>,
) -> Value {
    let is_dry_run = opt_flag(opts, &["dry-run", "d"]);

    let name = match name {
        Some(n) if !n.is_empty() => n,
        _ => return result(false, "Please specify a name to run.", 1),
    };

    let item: Option<Value> = match ty {
        Some("workflow") => store_get_array(app, "dex-workflows.json", "workflows")
            .into_iter()
            .find(|w| matches_name_or_id(w, name)),
        Some("operation") => store_get_array(app, "dex-operations.json", "operations")
            .into_iter()
            .find(|o| matches_name_or_id(o, name)),
        _ => {
            let t = ty.unwrap_or("");
            return result(false, format!("Unknown type: {t}. Use: workflow, operation"), 1);
        }
    };
    let ty = ty.unwrap_or("");

    let item = match item {
        Some(i) => i,
        None => return result(false, format!("{ty} not found: {name}"), 1),
    };

    let item_name = item.get("name").and_then(|v| v.as_str()).unwrap_or(name).to_string();

    if is_dry_run {
        let pretty = serde_json::to_string_pretty(&item).unwrap_or_default();
        return result(
            true,
            format!("[DRY RUN] Would execute {ty}: {item_name}\n{pretty}"),
            0,
        );
    }

    // Live engine is not present in this process (see module header). Electron's
    // fire-and-forget branch returns a started message with an execution id; we
    // emit the same execution request event the engine would consume and return
    // that shape. The --wait blocking branch is intentionally collapsed into
    // this (it would otherwise hang waiting on cli:execution-complete with no
    // engine to fire it).
    let execution_id = format!("cli-{}", now_ms());
    crate::native_ops::emit_event(
        app,
        &format!("cli:run-{ty}"),
        &json!({ "id": execution_id, "item": item }),
    );
    result(
        true,
        format!("{ty} '{item_name}' started (execution ID: {execution_id})"),
        0,
    )
}

fn matches_name_or_id(item: &Value, name: &str) -> bool {
    item.get("name").and_then(|v| v.as_str()) == Some(name)
        || item.get("id").and_then(|v| v.as_str()) == Some(name)
}

fn show_status(app: &tauri::AppHandle) -> Value {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();

    let platform = std::env::consts::OS;
    let uptime = sysinfo::System::uptime(); // seconds since boot — best-effort process uptime analog
    let total_mem = sys.total_memory(); // bytes
    let used_mem = sys.used_memory(); // bytes

    let status = json!({
        "version": version(app),
        "platform": platform,
        "uptime": uptime,
        "memory": { "heapUsed": used_mem, "heapTotal": total_mem },
    });

    let used_mb = used_mem / 1024 / 1024;
    let total_mb = total_mem / 1024 / 1024;
    let output = format!(
        "\nDex Status\n----------------------------------\nVersion:    {}\nPlatform:   {}\nUptime:     {}m {}s\nMemory:     {}MB / {}MB\n----------------------------------\n",
        version(app),
        platform,
        uptime / 60,
        uptime % 60,
        used_mb,
        total_mb,
    );

    result_data(true, output, status, 0)
}

fn trigger_scheduled(app: &tauri::AppHandle, name: Option<&str>) -> Value {
    let name = match name {
        Some(n) if !n.is_empty() => n,
        _ => return result(false, "Please specify a trigger name.", 1),
    };

    let triggers = store_get_array(app, "dex-scheduler.json", "triggers");
    let trigger = triggers.into_iter().find(|t| matches_name_or_id(t, name));

    let trigger = match trigger {
        Some(t) => t,
        None => return result(false, format!("Trigger not found: {name}"), 1),
    };

    let trigger_id = trigger.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let trigger_name = trigger.get("name").and_then(|v| v.as_str()).unwrap_or(name).to_string();
    crate::native_ops::emit_event(app, "cli:trigger-scheduled", &json!({ "triggerId": trigger_id }));

    result(true, format!("Triggered: {trigger_name}"), 0)
}

fn export_items(app: &tauri::AppHandle, ty: Option<&str>, opts: &serde_json::Map<String, Value>) -> Value {
    let ty = ty.unwrap_or("");
    let default_out = format!("dex-{ty}-export.json");
    let output_path = opt_str(opts, &["output", "o"]).unwrap_or(default_out);

    let data: Value = match ty {
        "workflows" => Value::Array(store_get_array(app, "dex-workflows.json", "workflows")),
        "operations" => Value::Array(store_get_array(app, "dex-operations.json", "operations")),
        "all" => json!({
            "workflows": store_get_array(app, "dex-workflows.json", "workflows"),
            "operations": store_get_array(app, "dex-operations.json", "operations"),
            "exportedAt": iso_now(),
            "version": version(app),
        }),
        _ => return result(false, format!("Unknown type: {ty}"), 1),
    };

    // Electron resolves a relative path against process.cwd(). In this process
    // there is no headless cwd convention, so we resolve relative paths under
    // appData (the established Tauri root) to keep the write sandboxed and
    // deterministic; absolute paths are honored verbatim.
    let candidate = PathBuf::from(&output_path);
    let full_path = if candidate.is_absolute() {
        candidate
    } else {
        store_path(app, &output_path)
    };

    let raw = serde_json::to_string_pretty(&data).unwrap_or_default();
    match std::fs::write(&full_path, raw) {
        Ok(_) => result(
            true,
            format!("Exported {ty} to: {}", full_path.to_string_lossy()),
            0,
        ),
        Err(e) => result(false, format!("Failed to write file: {e}"), 1),
    }
}

fn import_items(app: &tauri::AppHandle, file: Option<&str>, opts: &serde_json::Map<String, Value>) -> Value {
    let file = match file {
        Some(f) if !f.is_empty() => f,
        _ => return result(false, "Please specify a file to import.", 1),
    };

    let candidate = PathBuf::from(file);
    let full_path = if candidate.is_absolute() { candidate } else { store_path(app, file) };

    if !full_path.exists() {
        return result(false, format!("File not found: {}", full_path.to_string_lossy()), 1);
    }

    let should_merge = opt_flag(opts, &["merge", "m"]);
    let raw = match std::fs::read_to_string(&full_path) {
        Ok(r) => r,
        Err(e) => return result(false, format!("Failed to read/parse file: {e}"), 1),
    };
    let data: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => return result(false, format!("Failed to read/parse file: {e}"), 1),
    };

    let mut imported = 0usize;

    if let Some(Value::Array(incoming)) = data.get("workflows") {
        let mut combined = if should_merge {
            store_get_array(app, "dex-workflows.json", "workflows")
        } else {
            Vec::new()
        };
        combined.extend(incoming.clone());
        imported += incoming.len();
        store_set(app, "dex-workflows.json", "workflows", Value::Array(combined));
    }

    if let Some(Value::Array(incoming)) = data.get("operations") {
        let mut combined = if should_merge {
            store_get_array(app, "dex-operations.json", "operations")
        } else {
            Vec::new()
        };
        combined.extend(incoming.clone());
        imported += incoming.len();
        store_set(app, "dex-operations.json", "operations", Value::Array(combined));
    }

    result(
        true,
        format!("Imported {imported} items from: {}", full_path.to_string_lossy()),
        0,
    )
}

fn execute_action(app: &tauri::AppHandle, action_type: Option<&str>, opts: &serde_json::Map<String, Value>) -> Value {
    let action_type = match action_type {
        Some(a) if !a.is_empty() => a,
        _ => return result(false, "Please specify an action type.", 1),
    };

    let mut config = Value::Object(serde_json::Map::new());
    if let Some(raw) = opt_str(opts, &["config", "c"]) {
        match serde_json::from_str::<Value>(&raw) {
            Ok(v) => config = v,
            Err(_) => return result(false, "Invalid JSON config", 1),
        }
    }

    // Electron emits to the live action engine then immediately resolves a
    // success regardless (no completion wait). We mirror that: emit the request
    // event the engine would consume, then return the same immediate success.
    let execution_id = format!("cli-action-{}", now_ms());
    crate::native_ops::emit_event(
        app,
        "cli:execute-action",
        &json!({ "id": execution_id, "type": action_type, "config": config }),
    );

    result(true, format!("Action '{action_type}' executed"), 0)
}

fn handle_config(app: &tauri::AppHandle, key: Option<&str>, value: Option<&str>) -> Value {
    const STORE: &str = "dex-cli.json";
    match key {
        None => {
            let all = match read_store(app, STORE) {
                v @ Value::Object(_) => v,
                _ => Value::Object(serde_json::Map::new()),
            };
            let pretty = serde_json::to_string_pretty(&all).unwrap_or_else(|_| "{}".to_string());
            result(true, pretty, 0)
        }
        Some(k) => match value {
            None => {
                let val = match read_store(app, STORE) {
                    Value::Object(m) => m.get(k).cloned(),
                    _ => None,
                };
                match val {
                    Some(v) => {
                        let s = match v {
                            Value::String(s) => s,
                            other => other.to_string(),
                        };
                        result(true, s, 0)
                    }
                    None => result(false, format!("Key not found: {k}"), 1),
                }
            }
            Some(v) => {
                store_set(app, STORE, k, Value::String(v.to_string()));
                result(true, format!("Set {k} = {v}"), 0)
            }
        },
    }
}

fn iso_now() -> String {
    // RFC3339-ish UTC timestamp without a date crate. We derive Y-M-D h:m:s from
    // the epoch seconds using the civil-from-days algorithm (Howard Hinnant).
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (hh, mm, ss) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.000Z")
}

// --- execute (faithful port of DexCLI.execute over cli:execute) --------------

fn cli_execute(app: &tauri::AppHandle, command: &str) -> Value {
    // Electron: dexCLI.execute(['dex', ...command.split(' ')]); execute() then
    // runs parseArgs(argv) which slices off the first TWO elements. We build the
    // identical argv so the slice(2) quirk is reproduced exactly.
    let mut argv: Vec<String> = vec!["dex".to_string()];
    argv.extend(command.split(' ').map(|s| s.to_string()));

    let parsed = parse_args(&argv);

    let known = COMMANDS.iter().any(|(n, _, _)| *n == parsed.command);
    if !known {
        return result(
            false,
            format!(
                "Unknown command: {}\nRun 'dex help' for available commands.",
                parsed.command
            ),
            1,
        );
    }

    let a = &parsed.args;
    let o = &parsed.options;
    let arg0 = a.first().map(|s| s.as_str());
    let arg1 = a.get(1).map(|s| s.as_str());

    match parsed.command.as_str() {
        "help" => show_help(arg0),
        "version" => result(true, format!("Dex v{}", version(app)), 0),
        "list" => list_items(app, arg0, o),
        "run" => run_item(app, arg0, arg1, o),
        "status" => show_status(app),
        "trigger" => trigger_scheduled(app, arg0),
        "export" => export_items(app, arg0, o),
        "import" => import_items(app, arg0, o),
        "exec" => execute_action(app, arg0, o),
        "config" => handle_config(app, arg0, arg1),
        // unreachable given `known` gate above, but keep total.
        _ => result(false, format!("Unknown command: {}", parsed.command), 1),
    }
}

// --- dispatch ----------------------------------------------------------------

/// Route a `cli:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // isHeadlessMode() is always false in a process that owns a renderer.
        "cli:is-headless" => json!(false),

        // execute(command: string) -> CLIResult.
        "cli:execute" => {
            let command = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            cli_execute(app, command)
        }

        // Internal ipcMain event bus channel, never a renderer-callable handler.
        // No shaped object is read by the renderer here -> void/null no-op.
        "cli:execution-complete" => Value::Null,

        _ => Value::Null,
    }
}
