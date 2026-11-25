// =============================================================================
// DEX Platform — Xack: UKI's trusted native action broker (`xack:*`)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! UKI plans; Xack decides and records; apps and native services act.
//!
//! Every UKI action (a core tool such as `trash_file`, an app action such as
//! `tasks.addTask`, or a native capability such as `terminal.run`) is a typed
//! capability in Xack's catalog with an action class and a confirmation policy:
//!
//! - class: `read` < `modify` < `execute` < `external` < `privileged`;
//!   privileged is always refused for UKI;
//! - confirm: `never` (runs), `ask` (asks unless the user granted it for this
//!   session), `always` (asks every time unless the user granted this exact call;
//!   a scheduled pre-approval is NOT accepted for it).
//!
//! Flow: `xack:request` -> decision (allow / ask / refuse) and a request id ->
//! `xack:decide` (the approval surface, never the model) -> a single-use ticket
//! bound to the exact canonical arguments -> `xack:begin` (or, for native
//! capabilities, the executor itself consumes it) -> `xack:finish`.
//!
//! The terminal broker refuses to run without a ticket consumed here, so an
//! approval for `npm test` in one folder can never run anything else anywhere
//! else. Approvals never come from retrieved documents, web pages or model
//! output: those only ever reach `xack:request`.
//!
//! The history (what was asked, decided and run, by whom, with what result) is
//! kept natively in `xack-history.jsonl` (bounded), so it survives restarts and
//! is not something a page script can rewrite in localStorage.

use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, VecDeque};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::paths::DexPaths;
use crate::util::LockSafe;

/// An approval must be used within this long after it was requested.
const TICKET_TTL_MS: u64 = 10 * 60 * 1000;
const MAX_REQUESTS: usize = 200;
const MAX_GRANTS: usize = 64;
const MAX_HISTORY_MEM: usize = 1000;
const MAX_HISTORY_FILE: usize = 2000;
const MAX_ARGS_BYTES: usize = 16 * 1024;
const MAX_CATALOG: usize = 600;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Class { Read = 0, Modify = 1, Execute = 2, External = 3, Privileged = 4 }

impl Class {
    pub fn as_str(self) -> &'static str {
        match self { Class::Read => "read", Class::Modify => "modify", Class::Execute => "execute", Class::External => "external", Class::Privileged => "privileged" }
    }
    pub fn parse(s: &str) -> Option<Class> {
        Some(match s { "read" => Class::Read, "modify" => Class::Modify, "execute" => Class::Execute, "external" => Class::External, "privileged" => Class::Privileged, _ => return None })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Confirm { Never, Ask, Always }

impl Confirm {
    fn as_str(self) -> &'static str { match self { Confirm::Never => "never", Confirm::Ask => "ask", Confirm::Always => "always" } }
    fn parse(s: &str) -> Option<Confirm> { Some(match s { "never" => Confirm::Never, "ask" => Confirm::Ask, "always" => Confirm::Always, _ => return None }) }
}

#[derive(Clone, Debug)]
pub struct Capability {
    pub id: String,
    pub app: String,
    pub description: String,
    pub class: Class,
    pub confirm: Confirm,
    pub timeout_sec: u64,
    pub cancellable: bool,
    pub input_schema: Value,
    /// Built into Xack (true) or registered by a running DEX app (false).
    pub native: bool,
}

impl Capability {
    fn to_json(&self) -> Value {
        json!({ "id": self.id, "app": self.app, "description": self.description, "class": self.class.as_str(),
                "confirm": self.confirm.as_str(), "timeoutSec": self.timeout_sec, "cancellable": self.cancellable,
                "inputSchema": self.input_schema, "native": self.native })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status { Pending, Approved, Denied, Used }

impl Status { fn as_str(self) -> &'static str { match self { Status::Pending => "pending", Status::Approved => "approved", Status::Denied => "denied", Status::Used => "used" } } }

#[derive(Clone, Debug)]
pub struct Request {
    pub id: String,
    pub action: String,
    pub app: String,
    pub class: Class,
    pub confirm: Confirm,
    /// Canonical JSON of the arguments; a ticket only runs these exact arguments.
    pub args: String,
    /// Grant scope (for the terminal: the working folder).
    pub scope: String,
    pub summary: String,
    pub created_ms: u64,
    pub status: Status,
    /// "policy" | "grant" | "user" | "schedule"
    pub by: &'static str,
}

#[derive(Clone, Debug)]
pub struct Grant {
    pub id: String,
    pub action: String,
    pub scope: String,
    pub max_class: Class,
    /// Some(args) = this exact call only; None = anything up to `max_class` in `scope`.
    pub exact_args: Option<String>,
    pub label: String,
    pub created_ms: u64,
    pub uses: u32,
}

impl Grant {
    fn to_json(&self) -> Value {
        json!({ "id": self.id, "action": self.action, "scope": self.scope, "maxClass": self.max_class.as_str(),
                "exact": self.exact_args.is_some(), "label": self.label, "createdAt": self.created_ms, "uses": self.uses })
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Decision { Allow, Ask, Refuse(String) }

/// How an approval should be remembered for the rest of this session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Remember { Once, Exact, ScopeRead }

/// The pure broker state. No IO: the Tauri glue below persists history.
#[derive(Default)]
pub struct Broker {
    pub catalog: BTreeMap<String, Capability>,
    pub requests: VecDeque<Request>,
    pub grants: Vec<Grant>,
    seq: u64,
}

/// Canonical JSON: object keys sorted at every level, so `{a,b}` == `{b,a}`.
pub fn canonical(v: &Value) -> String {
    fn sort(v: &Value) -> Value {
        match v {
            Value::Object(m) => {
                let sorted: BTreeMap<&String, Value> = m.iter().map(|(k, v)| (k, sort(v))).collect();
                let mut out = Map::new();
                for (k, v) in sorted { out.insert(k.clone(), v); }
                Value::Object(out)
            }
            Value::Array(a) => Value::Array(a.iter().map(sort).collect()),
            other => other.clone(),
        }
    }
    serde_json::to_string(&sort(v)).unwrap_or_default()
}

fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':'))
}

fn clip(s: &str, n: usize) -> String { s.chars().take(n).collect() }

fn core(id: &str, description: &str, class: Class, confirm: Confirm) -> Capability {
    Capability { id: id.into(), app: "uki".into(), description: description.into(), class, confirm, timeout_sec: 60, cancellable: false, input_schema: json!({}), native: true }
}

/// UKI's built-in capabilities. Classes and confirmation live HERE, not in the
/// renderer: a request can raise a class but never lower it.
pub fn builtin_catalog() -> Vec<Capability> {
    use Class::*;
    use Confirm::*;
    let mut v = vec![
        core("uki.web_search", "Search the web (DuckDuckGo / Wikipedia)", External, Never),
        core("uki.open_app", "Open a DEX app", Read, Never),
        core("uki.close_app", "Close a DEX app", Modify, Never),
        core("uki.notify", "Show a notification", Read, Never),
        core("uki.get_context", "Read the active apps' shared context", Read, Never),
        core("uki.list_apps", "List DEX apps", Read, Never),
        core("uki.find_files", "Search indexed files", Read, Never),
        core("uki.find_context", "Retrieve indexed context from authorized folders (Umari)", Read, Never),
        core("uki.list_projects", "List detected projects in authorized folders (Umari)", Read, Never),
        core("uki.read_file", "Read a file in an allowed folder", Read, Never),
        core("uki.write_file", "Save text as a new file", Modify, Ask),
        core("uki.create_folder", "Create a folder", Modify, Ask),
        core("uki.rename_file", "Rename a file", Modify, Ask),
        core("uki.move_file", "Move a file", Modify, Ask),
        core("uki.trash_file", "Move a file to the Recycle Bin", Modify, Always),
        core("uki.schedule_task", "Schedule a task that runs later", Modify, Ask),
        core("uki.list_scheduled_tasks", "List scheduled tasks", Read, Never),
        core("uki.cancel_scheduled_task", "Delete a scheduled task", Modify, Ask),
        core("uki.command_status", "Read a UKI command's status and output", Read, Never),
        core("uki.cancel_command", "Stop a running UKI command", Modify, Ask),
        core("uki.run_command", "Prepare a terminal command (runs through terminal.run)", Execute, Always),
    ];
    v.push(Capability {
        id: "terminal.run".into(), app: "terminal".into(),
        description: "Run a command in Windows PowerShell, non-elevated, in a chosen folder".into(),
        class: Execute, confirm: Always, timeout_sec: 3600, cancellable: true,
        input_schema: json!({ "type": "object", "required": ["command", "cwd"], "properties": { "command": { "type": "string", "maxLength": 4000 }, "cwd": { "type": "string" } } }),
        native: true,
    });
    v
}

impl Broker {
    pub fn new() -> Self {
        let mut b = Broker::default();
        for c in builtin_catalog() { b.catalog.insert(c.id.clone(), c); }
        b
    }

    fn next_id(&mut self, prefix: &str, now: u64) -> String { self.seq += 1; format!("{prefix}_{now:x}_{}", self.seq) }

    /// Register app actions from a running DEX app. Built-in capabilities
    /// cannot be replaced, and an app cannot register a privileged action.
    pub fn register(&mut self, items: &[Value]) -> usize {
        let mut n = 0;
        for it in items {
            let s = |k: &str| it.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let id = s("id");
            if !valid_id(&id) || self.catalog.get(&id).map(|c| c.native).unwrap_or(false) { continue; }
            if !self.catalog.contains_key(&id) && self.catalog.len() >= MAX_CATALOG { continue; }
            let class = match Class::parse(&s("class")) { Some(Class::Privileged) | None => continue, Some(c) => c };
            let default_confirm = match class { Class::Read => Confirm::Never, Class::Modify | Class::Execute => Confirm::Ask, _ => Confirm::Always };
            let confirm = Confirm::parse(&s("confirm")).unwrap_or(default_confirm);
            // Floors: anything that changes data asks; anything external always asks.
            let confirm = match class {
                Class::Read => confirm,
                Class::Modify | Class::Execute => if confirm == Confirm::Never { Confirm::Ask } else { confirm },
                _ => Confirm::Always,
            };
            let app = clip(&s("app"), 60);
            if app.is_empty() { continue; }
            self.catalog.insert(id.clone(), Capability {
                id, app, description: clip(&s("description"), 200), class, confirm,
                timeout_sec: it.get("timeoutSec").and_then(|v| v.as_u64()).unwrap_or(60).clamp(1, 3600),
                cancellable: false, input_schema: it.get("inputSchema").cloned().unwrap_or(json!({})), native: false,
            });
            n += 1;
        }
        n
    }

    fn grant_for(&self, action: &str, scope: &str, class: Class, args: &str) -> Option<usize> {
        self.grants.iter().position(|g| g.action == action && g.scope == scope && class <= g.max_class
            && g.exact_args.as_deref().map(|a| a == args).unwrap_or(true))
    }

    /// Decide a request. `class_hint` can only raise the catalog class (the
    /// terminal passes the class of the specific command).
    pub fn request(&mut self, now: u64, action: &str, class_hint: Option<Class>, args: &Value, scope: &str, summary: &str) -> (Decision, Option<Request>) {
        let Some(cap) = self.catalog.get(action).cloned() else {
            return (Decision::Refuse(format!("\"{action}\" is not a capability UKI has")), None);
        };
        let args_s = canonical(args);
        if args_s.len() > MAX_ARGS_BYTES { return (Decision::Refuse("the arguments are too large".into()), None); }
        // The terminal's class comes from Xack's own classifier of the actual
        // command, never from the caller. Elsewhere a hint can only raise it.
        let class = if action == "terminal.run" {
            let cmd = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
            match crate::uki_terminal::classify(cmd) {
                crate::uki_terminal::Risk::Read => Class::Read,
                crate::uki_terminal::Risk::Modify => Class::Modify,
                crate::uki_terminal::Risk::Execute => Class::Execute,
                crate::uki_terminal::Risk::External => Class::External,
                crate::uki_terminal::Risk::Privileged => Class::Privileged,
            }
        } else {
            class_hint.map(|h| h.max(cap.class)).unwrap_or(cap.class)
        };
        // A grant's scope must describe what actually runs: for the terminal
        // it is the command's own folder, whatever scope the caller named.
        let scope = if action == "terminal.run" {
            args.get("cwd").and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
        } else {
            scope.to_string()
        };
        let mut req = Request {
            id: self.next_id("xr", now), action: action.into(), app: cap.app.clone(), class, confirm: cap.confirm,
            args: args_s, scope: clip(&scope, 400), summary: clip(summary.trim(), 300), created_ms: now, status: Status::Pending, by: "policy",
        };
        let decision = if class == Class::Privileged {
            req.status = Status::Denied;
            Decision::Refuse("UKI does not run actions that need administrator rights or change system settings".into())
        } else if let Some(i) = self.grant_for(action, &req.scope, class, &req.args) {
            self.grants[i].uses += 1;
            req.status = Status::Approved;
            req.by = "grant";
            Decision::Allow
        } else if cap.confirm == Confirm::Never {
            req.status = Status::Approved;
            Decision::Allow
        } else {
            Decision::Ask
        };
        self.requests.push_back(req.clone());
        while self.requests.len() > MAX_REQUESTS { self.requests.pop_front(); }
        (decision, Some(req))
    }

    /// The user's (or a schedule's) answer to a pending request.
    pub fn decide(&mut self, now: u64, id: &str, approve: bool, remember: Remember, via_schedule: bool) -> Result<Request, String> {
        let req = self.requests.iter_mut().find(|r| r.id == id).ok_or("no such request")?;
        if req.status != Status::Pending { return Err(format!("the request is already {}", req.status.as_str())); }
        if now.saturating_sub(req.created_ms) > TICKET_TTL_MS { req.status = Status::Denied; return Err("the request expired; ask again".into()); }
        if via_schedule && req.confirm == Confirm::Always {
            req.status = Status::Denied;
            return Err("this action asks every time; a scheduled approval does not cover it".into());
        }
        if !approve { req.status = Status::Denied; req.by = "user"; return Ok(req.clone()); }
        req.status = Status::Approved;
        req.by = if via_schedule { "schedule" } else { "user" };
        let req = req.clone();
        let grant = match remember {
            Remember::Once => None,
            Remember::Exact => Some((Some(req.args.clone()), req.class, format!("{} (this exact request)", req.summary))),
            Remember::ScopeRead => {
                if req.class != Class::Read { return Err("only read-only requests can be allowed for a whole scope".into()); }
                Some((None, Class::Read, format!("read-only {} in {}", req.action, req.scope)))
            }
        };
        if let Some((exact, max_class, label)) = grant {
            if self.grant_for(&req.action, &req.scope, req.class, &req.args).is_none() {
                let gid = self.next_id("xg", now);
                self.grants.push(Grant { id: gid, action: req.action.clone(), scope: req.scope.clone(), max_class, exact_args: exact, label: clip(&label, 200), created_ms: now, uses: 0 });
                if self.grants.len() > MAX_GRANTS { self.grants.remove(0); }
            }
        }
        Ok(req)
    }

    /// Use an approved request exactly once, for exactly the approved arguments.
    pub fn consume(&mut self, now: u64, id: &str, action: &str, args: &Value) -> Result<Request, String> {
        let args_s = canonical(args);
        let req = self.requests.iter_mut().find(|r| r.id == id).ok_or("no approval for this action")?;
        if req.action != action { return Err("the approval is for a different action".into()); }
        if req.args != args_s { return Err("the approval is for different arguments".into()); }
        match req.status {
            Status::Approved => {}
            Status::Used => return Err("the approval was already used".into()),
            Status::Pending => return Err("the action has not been approved".into()),
            Status::Denied => return Err("the action was declined".into()),
        }
        if now.saturating_sub(req.created_ms) > TICKET_TTL_MS { return Err("the approval expired".into()); }
        req.status = Status::Used;
        Ok(req.clone())
    }

    pub fn revoke(&mut self, id: Option<&str>) -> usize {
        let before = self.grants.len();
        match id { Some(id) => self.grants.retain(|g| g.id != id), None => self.grants.clear() }
        before - self.grants.len()
    }
}

// =============================================================================
// Tauri glue: one broker per process, history persisted as bounded JSONL.
// =============================================================================

fn broker() -> &'static Mutex<Broker> {
    static B: OnceLock<Mutex<Broker>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(Broker::new()))
}

struct History { items: VecDeque<Value>, loaded: bool, file_lines: usize }

fn history() -> &'static Mutex<History> {
    static H: OnceLock<Mutex<History>> = OnceLock::new();
    H.get_or_init(|| Mutex::new(History { items: VecDeque::new(), loaded: false, file_lines: 0 }))
}

/// Running executions (exec id -> request), so the history can show what is in flight.
fn running() -> &'static Mutex<BTreeMap<String, Value>> {
    static R: OnceLock<Mutex<BTreeMap<String, Value>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(BTreeMap::new()))
}

pub fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

fn history_file(app: &tauri::AppHandle) -> Option<PathBuf> { app.dex_data_dir().ok().map(|d| d.join("xack-history.jsonl")) }

fn load_history(app: &tauri::AppHandle, h: &mut History) {
    if h.loaded { return; }
    h.loaded = true;
    let Some(p) = history_file(app) else { return };
    let Ok(text) = std::fs::read_to_string(p) else { return };
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    h.file_lines = lines.len();
    for l in lines.iter().rev().take(MAX_HISTORY_MEM).rev() {
        if let Ok(v) = serde_json::from_str::<Value>(l) { h.items.push_back(v); }
    }
}

/// Append one history record (memory ring + JSONL file, compacted when long).
pub fn record(app: &tauri::AppHandle, entry: Value) {
    let mut h = history().lock_safe();
    load_history(app, &mut h);
    h.items.push_back(entry.clone());
    while h.items.len() > MAX_HISTORY_MEM { h.items.pop_front(); }
    let Some(p) = history_file(app) else { return };
    if h.file_lines + 1 > MAX_HISTORY_FILE {
        let body: String = h.items.iter().map(|v| format!("{}\n", v)).collect();
        if std::fs::write(&p, body).is_ok() { h.file_lines = h.items.len(); }
    } else if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&p) {
        if writeln!(f, "{}", entry).is_ok() { h.file_lines += 1; }
    }
    drop(h);
    crate::native_ops::emit_event(app, "xack:history", &entry);
}

fn req_record(kind: &str, r: &Request, outcome: &str, detail: &str) -> Value {
    json!({ "ts": now_ms(), "kind": kind, "requestId": r.id, "action": r.action, "app": r.app, "class": r.class.as_str(),
            "outcome": outcome, "by": r.by, "summary": r.summary, "scope": r.scope, "detail": clip(detail, 300) })
}

/// Called by native executors (the terminal broker): request + consume in one
/// step on the executor's side. Returns the consumed request.
pub fn consume_for(app: &tauri::AppHandle, request_id: &str, action: &str, args: &Value, exec_id: &str) -> Result<Request, String> {
    let r = broker().lock_safe().consume(now_ms(), request_id, action, args);
    match &r {
        Ok(req) => {
            let mut rec = req_record("exec", req, "started", "");
            rec["execId"] = json!(exec_id);
            running().lock_safe().insert(exec_id.to_string(), rec.clone());
            record(app, rec);
        }
        Err(e) => {
            record(app, json!({ "ts": now_ms(), "kind": "exec", "requestId": request_id, "action": action, "outcome": "refused", "detail": e }));
        }
    }
    r
}

/// Rename a running execution once the executor knows its real task id.
pub fn rekey(old: &str, new: &str) {
    let mut r = running().lock_safe();
    if let Some(mut rec) = r.remove(old) {
        rec["execId"] = json!(new);
        r.insert(new.to_string(), rec);
    }
}

/// Close a running execution (native executors and `xack:finish`).
pub fn finish(app: &tauri::AppHandle, exec_id: &str, outcome: &str, detail: &str) -> bool {
    let Some(mut rec) = running().lock_safe().remove(exec_id) else { return false };
    let started = rec.get("ts").and_then(|v| v.as_u64()).unwrap_or(0);
    let now = now_ms();
    rec["ts"] = json!(now);
    rec["outcome"] = json!(match outcome { "ran" | "completed" => "completed", "failed" | "timed-out" | "cancelled" | "interrupted" => outcome, _ => "failed" });
    rec["detail"] = json!(clip(detail, 300));
    rec["durationMs"] = json!(now.saturating_sub(started));
    record(app, rec);
    true
}

fn arg0(args: &Value) -> Value { args.get(0).cloned().unwrap_or(Value::Null) }

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a = arg0(args);
    let s = |k: &str| a.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "xack:capabilities" => {
            let b = broker().lock_safe();
            json!({ "ok": true, "capabilities": b.catalog.values().map(|c| c.to_json()).collect::<Vec<_>>() })
        }
        "xack:register" => {
            let items = a.get("actions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let n = broker().lock_safe().register(&items);
            json!({ "ok": true, "registered": n })
        }
        "xack:request" => {
            let action = s("action");
            let class_hint = Class::parse(&s("class"));
            let call_args = a.get("args").cloned().unwrap_or(json!({}));
            let (decision, req) = broker().lock_safe().request(now_ms(), &action, class_hint, &call_args, &s("scope"), &s("summary"));
            let (word, reason) = match &decision { Decision::Allow => ("allow", String::new()), Decision::Ask => ("ask", String::new()), Decision::Refuse(r) => ("refuse", r.clone()) };
            if let Some(r) = &req {
                if word != "ask" { record(app, req_record("request", r, if word == "allow" { "approved" } else { "refused" }, &reason)); }
            } else {
                record(app, json!({ "ts": now_ms(), "kind": "request", "action": action, "outcome": "refused", "by": "policy", "detail": reason }));
            }
            json!({ "ok": true, "decision": word, "reason": reason, "requestId": req.as_ref().map(|r| r.id.clone()),
                    "class": req.as_ref().map(|r| r.class.as_str()), "by": req.as_ref().map(|r| r.by),
                    "confirm": req.as_ref().map(|r| r.confirm.as_str()) })
        }
        "xack:decide" => {
            let remember = match s("remember").as_str() { "exact" => Remember::Exact, "scope-read" => Remember::ScopeRead, _ => Remember::Once };
            let approve = a.get("approve").and_then(|v| v.as_bool()).unwrap_or(false);
            let via_schedule = s("via") == "schedule";
            let res = broker().lock_safe().decide(now_ms(), &s("requestId"), approve, remember, via_schedule);
            match res {
                Ok(r) => {
                    let outcome = if r.status == Status::Approved { "approved" } else { "declined" };
                    let detail = match remember { Remember::Exact if approve => "remembered for this session (exact request)", Remember::ScopeRead if approve => "remembered for this session (read-only, this scope)", _ => "" };
                    record(app, req_record("decision", &r, outcome, detail));
                    json!({ "ok": true, "status": r.status.as_str(), "by": r.by })
                }
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        "xack:begin" => {
            let exec_id = format!("xe_{:x}", now_ms());
            let exec_id = format!("{exec_id}_{}", s("requestId").rsplit('_').next().unwrap_or("0"));
            match consume_for(app, &s("requestId"), &s("action"), &a.get("args").cloned().unwrap_or(json!({})), &exec_id) {
                Ok(_) => json!({ "ok": true, "execId": exec_id }),
                Err(e) => json!({ "ok": false, "error": e }),
            }
        }
        "xack:finish" => json!({ "ok": finish(app, &s("execId"), &s("outcome"), &s("detail")) }),
        "xack:running" => json!({ "ok": true, "running": running().lock_safe().values().cloned().collect::<Vec<_>>() }),
        "xack:history" => {
            let limit = a.get("limit").and_then(|v| v.as_u64()).unwrap_or(200).clamp(1, MAX_HISTORY_MEM as u64) as usize;
            let mut h = history().lock_safe();
            load_history(app, &mut h);
            let items: Vec<Value> = h.items.iter().rev().take(limit).cloned().collect();
            json!({ "ok": true, "items": items, "total": h.items.len() })
        }
        "xack:clearHistory" => {
            let mut h = history().lock_safe();
            h.items.clear();
            h.loaded = true;
            h.file_lines = 0;
            if let Some(p) = history_file(app) { let _ = std::fs::remove_file(p); }
            json!({ "ok": true })
        }
        "xack:grants" => {
            let b = broker().lock_safe();
            json!({ "ok": true, "grants": b.grants.iter().map(|g| g.to_json()).collect::<Vec<_>>() })
        }
        "xack:revoke" => {
            let id = s("id");
            let n = broker().lock_safe().revoke(if id.is_empty() { None } else { Some(id.as_str()) });
            record(app, json!({ "ts": now_ms(), "kind": "grant", "outcome": "revoked", "detail": format!("{n} session permission(s) removed") }));
            json!({ "ok": true, "revoked": n })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn term(cmd: &str, cwd: &str) -> Value { json!({ "command": cmd, "cwd": cwd }) }

    #[test]
    fn canonical_sorts_keys_at_every_level() {
        let a = json!({ "b": 1, "a": { "y": [ { "d": 1, "c": 2 } ], "x": 2 } });
        let b = json!({ "a": { "x": 2, "y": [ { "c": 2, "d": 1 } ] }, "b": 1 });
        assert_eq!(canonical(&a), canonical(&b));
        assert_ne!(canonical(&json!({ "a": 1 })), canonical(&json!({ "a": 2 })));
    }

    #[test]
    fn unknown_and_privileged_are_refused() {
        let mut b = Broker::new();
        assert!(matches!(b.request(1, "made.up", None, &json!({}), "", "").0, Decision::Refuse(_)));
        let (d, r) = b.request(1, "terminal.run", Some(Class::Privileged), &term("bcdedit", "C:\\p"), "C:\\p", "");
        assert!(matches!(d, Decision::Refuse(_)));
        assert_eq!(r.unwrap().status, Status::Denied);
    }

    #[test]
    fn terminal_class_comes_from_the_command_not_the_caller() {
        let mut b = Broker::new();
        let (_, r) = b.request(1, "terminal.run", Some(Class::Read), &term("Remove-Item -Recurse x", "C:/p"), "C:/p", "");
        assert_eq!(r.unwrap().class, Class::Modify);
        let (d, _) = b.request(1, "terminal.run", Some(Class::Read), &term("Start-Process x -Verb RunAs", "C:/p"), "C:/p", "");
        assert!(matches!(d, Decision::Refuse(_)));
    }

    #[test]
    fn a_class_hint_can_raise_but_never_lower_the_catalog_class() {
        let mut b = Broker::new();
        // trash_file is modify/always; a "read" hint must not make it free.
        let (d, r) = b.request(1, "uki.trash_file", Some(Class::Read), &json!({ "path": "C:\\a.txt" }), "", "");
        assert_eq!(d, Decision::Ask);
        assert_eq!(r.unwrap().class, Class::Modify);
        let (_, r) = b.request(1, "terminal.run", Some(Class::External), &term("curl x", "C:\\p"), "C:\\p", "");
        assert_eq!(r.unwrap().class, Class::External);
    }

    #[test]
    fn read_tools_run_without_asking_and_terminal_always_asks() {
        let mut b = Broker::new();
        assert_eq!(b.request(1, "uki.read_file", None, &json!({ "path": "C:\\a" }), "", "").0, Decision::Allow);
        assert_eq!(b.request(1, "terminal.run", Some(Class::Read), &term("git status", "C:\\p"), "C:\\p", "").0, Decision::Ask);
    }

    #[test]
    fn ticket_is_single_use_and_bound_to_the_exact_arguments() {
        let mut b = Broker::new();
        let (_, r) = b.request(10, "terminal.run", Some(Class::Execute), &term("npm test", "C:\\p"), "C:\\p", "npm test");
        let id = r.unwrap().id;
        // Not approved yet.
        assert!(b.consume(11, &id, "terminal.run", &term("npm test", "C:\\p")).is_err());
        b.decide(12, &id, true, Remember::Once, false).unwrap();
        // Different command, folder or action: refused.
        assert!(b.consume(13, &id, "terminal.run", &term("npm test; del x", "C:\\p")).is_err());
        assert!(b.consume(13, &id, "terminal.run", &term("npm test", "C:\\q")).is_err());
        assert!(b.consume(13, &id, "uki.trash_file", &term("npm test", "C:\\p")).is_err());
        // Exact: once.
        assert!(b.consume(14, &id, "terminal.run", &json!({ "cwd": "C:\\p", "command": "npm test" })).is_ok());
        assert!(b.consume(15, &id, "terminal.run", &term("npm test", "C:\\p")).is_err());
    }

    #[test]
    fn declined_and_expired_requests_never_run() {
        let mut b = Broker::new();
        let (_, r) = b.request(0, "uki.move_file", None, &json!({ "from": "a", "to": "b" }), "", "");
        let id = r.unwrap().id;
        b.decide(1, &id, false, Remember::Once, false).unwrap();
        assert!(b.consume(2, &id, "uki.move_file", &json!({ "from": "a", "to": "b" })).is_err());

        let (_, r) = b.request(0, "uki.move_file", None, &json!({ "from": "a", "to": "b" }), "", "");
        let id = r.unwrap().id;
        assert!(b.decide(TICKET_TTL_MS + 1, &id, true, Remember::Once, false).is_err());
        let (_, r) = b.request(0, "uki.move_file", None, &json!({ "from": "a", "to": "c" }), "", "");
        let id = r.unwrap().id;
        b.decide(1, &id, true, Remember::Once, false).unwrap();
        assert!(b.consume(TICKET_TTL_MS + 5, &id, "uki.move_file", &json!({ "from": "a", "to": "c" })).is_err());
    }

    #[test]
    fn exact_grant_covers_only_that_command_in_that_folder() {
        let mut b = Broker::new();
        let (_, r) = b.request(0, "terminal.run", Some(Class::Execute), &term("npm test", "C:\\p"), "C:\\p", "");
        b.decide(1, &r.unwrap().id, true, Remember::Exact, false).unwrap();
        assert_eq!(b.grants.len(), 1);
        assert_eq!(b.request(2, "terminal.run", Some(Class::Execute), &term("npm test", "C:\\p"), "C:\\p", "").0, Decision::Allow);
        assert_eq!(b.request(2, "terminal.run", Some(Class::Execute), &term("npm run build", "C:\\p"), "C:\\p", "").0, Decision::Ask);
        assert_eq!(b.request(2, "terminal.run", Some(Class::Execute), &term("npm test", "C:\\other"), "C:\\other", "").0, Decision::Ask);
        assert_eq!(b.grants[0].uses, 1);
    }

    #[test]
    fn scope_grants_are_read_only() {
        let mut b = Broker::new();
        let (_, r) = b.request(0, "terminal.run", Some(Class::Execute), &term("npm test", "C:\\p"), "C:\\p", "");
        assert!(b.decide(1, &r.unwrap().id, true, Remember::ScopeRead, false).is_err());
        let (_, r) = b.request(0, "terminal.run", Some(Class::Read), &term("git status", "C:\\p"), "C:\\p", "");
        b.decide(1, &r.unwrap().id, true, Remember::ScopeRead, false).unwrap();
        assert_eq!(b.request(2, "terminal.run", Some(Class::Read), &term("git log", "C:\\p"), "C:\\p", "").0, Decision::Allow);
        assert_eq!(b.request(2, "terminal.run", Some(Class::Modify), &term("git commit -m x", "C:\\p"), "C:\\p", "").0, Decision::Ask);
        // A caller naming the granted folder as scope while running elsewhere is not covered.
        assert_eq!(b.request(2, "terminal.run", Some(Class::Read), &term("git log", "C:\\elsewhere"), "C:\\p", "").0, Decision::Ask);
        assert_eq!(b.revoke(None), 1);
        assert_eq!(b.request(3, "terminal.run", Some(Class::Read), &term("git log", "C:\\p"), "C:\\p", "").0, Decision::Ask);
    }

    #[test]
    fn schedules_cannot_pre_approve_always_ask_actions() {
        let mut b = Broker::new();
        let (_, r) = b.request(0, "uki.schedule_task", None, &json!({ "x": 1 }), "", "");
        assert_eq!(b.decide(1, &r.unwrap().id, true, Remember::Once, true).unwrap().by, "schedule");
        let (_, r) = b.request(0, "uki.trash_file", None, &json!({ "path": "a" }), "", "");
        assert!(b.decide(1, &r.unwrap().id, true, Remember::Once, true).is_err());
    }

    #[test]
    fn apps_register_actions_but_cannot_replace_builtins_or_go_privileged() {
        let mut b = Broker::new();
        let n = b.register(&[
            json!({ "id": "tasks.addTask", "app": "tasks", "class": "modify", "confirm": "never" }),
            json!({ "id": "tasks.list", "app": "tasks", "class": "read" }),
            json!({ "id": "browser.readPage", "app": "browser", "class": "external", "confirm": "never" }),
            json!({ "id": "terminal.run", "app": "evil", "class": "read", "confirm": "never" }),
            json!({ "id": "x.root", "app": "x", "class": "privileged" }),
            json!({ "id": "bad id!", "app": "x", "class": "read" }),
        ]);
        assert_eq!(n, 3);
        assert_eq!(b.catalog["tasks.addTask"].confirm, Confirm::Ask); // modify never runs silently
        assert_eq!(b.catalog["browser.readPage"].confirm, Confirm::Always);
        assert_eq!(b.catalog["terminal.run"].app, "terminal");
        assert!(!b.catalog.contains_key("x.root"));
        assert_eq!(b.request(0, "tasks.list", None, &json!({}), "", "").0, Decision::Allow);
        assert_eq!(b.request(0, "tasks.addTask", None, &json!({ "title": "x" }), "", "").0, Decision::Ask);
    }
}
