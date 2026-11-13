// =============================================================================
// DEX 6.0 — Notification Center (Tauri port of src/main/core/NotificationCenter.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! In-memory notification/activity store with JSON persistence, faithfully
//! mirroring the Electron `NotificationCenter`: same channel return shapes,
//! same defaults, same filtering/grouping/stats. Lives as Tauri-managed state
//! (`Mutex<NotificationStore>`); persistent notifications + config survive
//! restart under the app data dir, exactly like Electron's userData/notifications.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub current: i64,
    pub total: i64,
    pub percentage: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct NotifAction {
    pub id: String,
    pub label: String,
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub args: Option<Value>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub module: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operation: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub category: String,
    pub priority: String,
    pub title: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub timestamp: i64,
    pub read: bool,
    pub dismissed: bool,
    pub persistent: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<NotifAction>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<Progress>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<Source>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub max_notifications: usize,
    pub persistent_history_limit: usize,
    pub show_system_notifications: bool,
    pub sound_enabled: bool,
    pub auto_expire_minutes: i64,
    pub default_priority: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quiet_hours_start: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quiet_hours_end: Option<i64>,
    pub blocked_categories: Vec<String>,
    pub group_similar: bool,
}

impl Default for Config {
    fn default() -> Self {
        // Mirrors the NotificationCenter constructor defaults.
        Config {
            max_notifications: 500,
            persistent_history_limit: 100,
            show_system_notifications: false,
            sound_enabled: false,
            auto_expire_minutes: 60,
            default_priority: "normal".to_string(),
            quiet_hours_start: None,
            quiet_hours_end: None,
            blocked_categories: Vec::new(),
            group_similar: true,
        }
    }
}

pub struct NotificationStore {
    notifications: HashMap<String, Notification>,
    config: Config,
    id_counter: u64,
    data_dir: PathBuf,
}

impl NotificationStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let mut store = NotificationStore {
            notifications: HashMap::new(),
            config: Config::default(),
            id_counter: 0,
            data_dir,
        };
        store.load();
        store
    }

    // --- persistence -------------------------------------------------------
    fn persistent_path(&self) -> PathBuf {
        self.data_dir.join("persistent.json")
    }
    fn config_path(&self) -> PathBuf {
        self.data_dir.join("config.json")
    }

    fn load(&mut self) {
        if let Ok(data) = std::fs::read_to_string(self.persistent_path()) {
            if let Ok(list) = serde_json::from_str::<Vec<Notification>>(&data) {
                for n in list {
                    if let Some(num) = n.id.split('-').nth(1).and_then(|s| s.parse::<u64>().ok()) {
                        if num > self.id_counter {
                            self.id_counter = num;
                        }
                    }
                    self.notifications.insert(n.id.clone(), n);
                }
            }
        }
        if let Ok(data) = std::fs::read_to_string(self.config_path()) {
            if let Ok(v) = serde_json::from_str::<Value>(&data) {
                self.merge_config(&v);
            }
        }
    }

    fn save_persistent(&self) {
        let mut persistent: Vec<&Notification> = self
            .notifications
            .values()
            .filter(|n| n.persistent && !n.dismissed)
            .collect();
        persistent.sort_by_key(|a| a.timestamp);
        let start = persistent.len().saturating_sub(self.config.persistent_history_limit);
        let keep = &persistent[start..];
        let _ = std::fs::create_dir_all(&self.data_dir);
        if let Ok(data) = serde_json::to_string_pretty(&keep) {
            let _ = crate::write_atomic(self.persistent_path(), data);
        }
    }

    fn save_config(&self) {
        let _ = std::fs::create_dir_all(&self.data_dir);
        if let Ok(data) = serde_json::to_string_pretty(&self.config) {
            let _ = crate::write_atomic(self.config_path(), data);
        }
    }

    /// Merge a partial config object into the current config (no save).
    fn merge_config(&mut self, partial: &Value) {
        let mut cfg = serde_json::to_value(&self.config).unwrap_or_else(|_| json!({}));
        if let (Some(c), Some(p)) = (cfg.as_object_mut(), partial.as_object()) {
            for (k, v) in p {
                c.insert(k.clone(), v.clone());
            }
        }
        if let Ok(new_cfg) = serde_json::from_value::<Config>(cfg) {
            self.config = new_cfg;
        }
    }

    // --- quiet hours -------------------------------------------------------
    // NOTE: local-hour quiet-hours is not enforced under Tauri yet — std has no
    // local-timezone clock and we won't pull in chrono for this marginal gate.
    // The config still round-trips so the settings UI works; enforcement lands
    // when a time crate is added. Default config leaves it disabled (None).
    fn is_quiet_hours(&self) -> bool {
        false
    }

    fn enforce_limit(&mut self) {
        if self.notifications.len() <= self.config.max_notifications {
            return;
        }
        let mut by_age: Vec<(String, i64, bool)> = self
            .notifications
            .values()
            .map(|n| (n.id.clone(), n.timestamp, n.persistent))
            .collect();
        by_age.sort_by_key(|a| a.1); // oldest first
        let mut over = self.notifications.len().saturating_sub(self.config.max_notifications);
        for (id, _, persistent) in by_age {
            if over == 0 {
                break;
            }
            if !persistent {
                self.notifications.remove(&id);
                over -= 1;
            }
        }
    }

    // --- create ------------------------------------------------------------
    pub fn create(&mut self, data: &Value) -> Value {
        let category = data
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("general")
            .to_string();

        if self.config.blocked_categories.iter().any(|c| c == &category) {
            return json!({ "success": false, "error": format!("Category {} is blocked", category) });
        }

        let priority = data
            .get("priority")
            .and_then(|v| v.as_str())
            .unwrap_or(&self.config.default_priority)
            .to_string();

        let mut persistent = data.get("persistent").and_then(|v| v.as_bool()).unwrap_or(false);
        if self.is_quiet_hours() && priority != "urgent" {
            persistent = false;
        }

        let now = now_ms();
        self.id_counter += 1;
        let id = format!("notif-{}-{}", self.id_counter, now);
        let expires_at = if self.config.auto_expire_minutes > 0 {
            Some(now + self.config.auto_expire_minutes * 60 * 1000)
        } else {
            None
        };

        let n = Notification {
            id: id.clone(),
            kind: data.get("type").and_then(|v| v.as_str()).unwrap_or("info").to_string(),
            category,
            priority,
            title: data.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            message: data.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            detail: data.get("detail").and_then(|v| v.as_str()).map(String::from),
            icon: data.get("icon").and_then(|v| v.as_str()).map(String::from),
            timestamp: now,
            read: false,
            dismissed: false,
            persistent,
            actions: data.get("actions").and_then(|v| serde_json::from_value(v.clone()).ok()),
            progress: None,
            source: data.get("source").and_then(|v| serde_json::from_value(v.clone()).ok()),
            related_path: data.get("relatedPath").and_then(|v| v.as_str()).map(String::from),
            expires_at,
        };

        self.notifications.insert(id.clone(), n.clone());
        self.enforce_limit();
        if n.persistent {
            self.save_persistent();
        }
        serde_json::to_value(&n).unwrap_or(Value::Null)
    }

    pub fn create_progress(&mut self, title: &str, message: &str, category: &str, total: i64) -> Value {
        let data = json!({
            "type": "progress", "category": category,
            "title": title, "message": message, "priority": "low",
        });
        let created = self.create(&data);
        if let Some(id) = created.get("id").and_then(|v| v.as_str()).map(String::from) {
            if let Some(n) = self.notifications.get_mut(&id) {
                n.progress = Some(Progress { current: 0, total, percentage: 0 });
                return serde_json::to_value(&*n).unwrap_or(Value::Null);
            }
        }
        created
    }

    pub fn update_progress(&mut self, id: &str, current: i64, message: Option<String>) -> Value {
        match self.notifications.get_mut(id) {
            Some(n) if n.progress.is_some() => {
                let total = n.progress.as_ref().map(|p| p.total).unwrap_or(0);
                let pct = if total > 0 {
                    ((current as f64 / total as f64) * 100.0).round() as i64
                } else {
                    0
                };
                if let Some(p) = n.progress.as_mut() {
                    p.current = current;
                    p.percentage = pct;
                }
                if let Some(m) = message {
                    n.message = m;
                }
                if pct >= 100 {
                    n.kind = "success".to_string();
                    n.read = false;
                }
                json!({ "success": true })
            }
            _ => json!({ "success": false }),
        }
    }

    // --- query -------------------------------------------------------------
    fn list(&self, filter: &Value) -> Vec<Notification> {
        let mut results: Vec<Notification> = self
            .notifications
            .values()
            .filter(|n| !n.dismissed && Self::matches_filter(n, filter))
            .cloned()
            .collect();
        results.sort_by_key(|b| std::cmp::Reverse(b.timestamp));
        results
    }

    fn matches_filter(n: &Notification, filter: &Value) -> bool {
        if !filter.is_object() {
            return true;
        }
        let arr_excludes = |key: &str, val: &str| -> bool {
            match filter.get(key).and_then(|v| v.as_array()) {
                Some(arr) if !arr.is_empty() => !arr.iter().any(|x| x.as_str() == Some(val)),
                _ => false,
            }
        };
        if arr_excludes("types", &n.kind)
            || arr_excludes("categories", &n.category)
            || arr_excludes("priorities", &n.priority)
        {
            return false;
        }
        if let Some(r) = filter.get("read").and_then(|v| v.as_bool()) {
            if n.read != r {
                return false;
            }
        }
        if let Some(df) = filter.get("dateFrom").and_then(|v| v.as_i64()) {
            if n.timestamp < df {
                return false;
            }
        }
        if let Some(dt) = filter.get("dateTo").and_then(|v| v.as_i64()) {
            if n.timestamp > dt {
                return false;
            }
        }
        if let Some(s) = filter.get("search").and_then(|v| v.as_str()) {
            let q = s.to_lowercase();
            let hit = n.title.to_lowercase().contains(&q)
                || n.message.to_lowercase().contains(&q)
                || n.detail.as_ref().map(|d| d.to_lowercase().contains(&q)).unwrap_or(false);
            if !hit {
                return false;
            }
        }
        true
    }

    pub fn list_json(&self, filter: &Value) -> Value {
        json!(self.list(filter))
    }

    pub fn get(&self, id: &str) -> Value {
        match self.notifications.get(id) {
            Some(n) => serde_json::to_value(n).unwrap_or(Value::Null),
            None => Value::Null,
        }
    }

    pub fn get_unread(&self) -> Value {
        json!(self.list(&json!({ "read": false })))
    }

    pub fn get_unread_count(&self) -> usize {
        self.list(&json!({ "read": false })).len()
    }

    pub fn get_grouped(&self, filter: &Value) -> Value {
        if !self.config.group_similar {
            return json!([]);
        }
        let list = self.list(filter);
        let mut order: Vec<String> = Vec::new();
        let mut groups: HashMap<String, (Vec<Notification>, i64, String)> = HashMap::new();
        for n in list {
            let module = n
                .source
                .as_ref()
                .map(|s| s.module.clone())
                .unwrap_or_else(|| "unknown".to_string());
            let key = format!("{}-{}", n.category, module);
            if !groups.contains_key(&key) {
                order.push(key.clone());
                groups.insert(key.clone(), (Vec::new(), 0, n.category.clone()));
            }
            let entry = groups.get_mut(&key).unwrap();
            if n.timestamp > entry.1 {
                entry.1 = n.timestamp;
            }
            entry.0.push(n);
        }
        let mut out: Vec<Value> = order
            .iter()
            .filter_map(|k| groups.get(k).map(|g| (k, g)))
            .map(|(key, (notifs, latest, category))| {
                json!({
                    "key": key,
                    "notifications": notifs,
                    "count": notifs.len(),
                    "latestTimestamp": latest,
                    "category": category,
                })
            })
            .collect();
        out.sort_by(|a, b| {
            let ta = a.get("latestTimestamp").and_then(|v| v.as_i64()).unwrap_or(0);
            let tb = b.get("latestTimestamp").and_then(|v| v.as_i64()).unwrap_or(0);
            tb.cmp(&ta)
        });
        json!(out)
    }

    pub fn search(&self, query: &str) -> Value {
        json!(self.list(&json!({ "search": query })))
    }

    // --- actions -----------------------------------------------------------
    pub fn mark_read(&mut self, id: &str) -> Value {
        match self.notifications.get_mut(id) {
            Some(n) => {
                n.read = true;
                json!({ "success": true })
            }
            None => json!({ "success": false }),
        }
    }

    pub fn mark_all_read(&mut self) -> Value {
        let mut count = 0;
        for n in self.notifications.values_mut() {
            if !n.read {
                n.read = true;
                count += 1;
            }
        }
        json!({ "count": count })
    }

    pub fn dismiss(&mut self, id: &str) -> Value {
        let persistent = match self.notifications.get_mut(id) {
            Some(n) => {
                n.dismissed = true;
                n.persistent
            }
            None => return json!({ "success": false }),
        };
        if !persistent {
            self.notifications.remove(id);
        }
        json!({ "success": true })
    }

    pub fn dismiss_all(&mut self) -> Value {
        let mut to_remove: Vec<String> = Vec::new();
        let mut count = 0;
        for n in self.notifications.values_mut() {
            if !n.dismissed {
                n.dismissed = true;
                count += 1;
                if !n.persistent {
                    to_remove.push(n.id.clone());
                }
            }
        }
        for id in to_remove {
            self.notifications.remove(&id);
        }
        json!({ "count": count })
    }

    pub fn clear(&mut self) -> Value {
        let count = self.notifications.len();
        self.notifications.clear();
        self.save_persistent();
        json!({ "count": count })
    }

    pub fn clear_category(&mut self, category: &str) -> Value {
        let ids: Vec<String> = self
            .notifications
            .values()
            .filter(|n| n.category == category)
            .map(|n| n.id.clone())
            .collect();
        let count = ids.len();
        for id in ids {
            self.notifications.remove(&id);
        }
        json!({ "count": count })
    }

    pub fn execute_action(&mut self, notification_id: &str, action_id: &str) -> Value {
        let has_action = self
            .notifications
            .get(notification_id)
            .and_then(|n| n.actions.as_ref())
            .map(|acts| acts.iter().any(|a| a.id == action_id))
            .unwrap_or(false);
        if !has_action {
            return json!({ "success": false });
        }
        // Electron emits the action for handling elsewhere, then marks read.
        // No renderer event bus under the bridge yet, so we just mark read.
        let _ = self.mark_read(notification_id);
        json!({ "success": true })
    }

    // --- stats & config ----------------------------------------------------
    pub fn get_stats(&self) -> Value {
        let mut by_type: HashMap<&str, i64> = ["info", "success", "warning", "error", "progress"]
            .iter()
            .map(|k| (*k, 0))
            .collect();
        let mut by_category: HashMap<&str, i64> =
            ["file", "system", "action", "error", "sync", "media", "task", "general"]
                .iter()
                .map(|k| (*k, 0))
                .collect();
        let mut by_priority: HashMap<&str, i64> = ["low", "normal", "high", "urgent"]
            .iter()
            .map(|k| (*k, 0))
            .collect();
        let mut total = 0;
        let mut unread = 0;
        for n in self.notifications.values() {
            if n.dismissed {
                continue;
            }
            total += 1;
            if !n.read {
                unread += 1;
            }
            *by_type.entry(n.kind.as_str()).or_insert(0) += 1;
            *by_category.entry(n.category.as_str()).or_insert(0) += 1;
            *by_priority.entry(n.priority.as_str()).or_insert(0) += 1;
        }
        json!({
            "total": total,
            "unread": unread,
            "byType": by_type,
            "byCategory": by_category,
            "byPriority": by_priority,
        })
    }

    pub fn config_json(&self) -> Value {
        serde_json::to_value(&self.config).unwrap_or_else(|_| json!({}))
    }

    pub fn set_config(&mut self, partial: &Value) -> Value {
        self.merge_config(partial);
        self.save_config();
        json!({ "success": true })
    }
}
