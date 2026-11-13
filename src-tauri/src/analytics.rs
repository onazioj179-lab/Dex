// =============================================================================
// DEX Tauri — Analytics subsystem (port of analytics/AnalyticsManager.ts).
//
// Pure-data, JSON-backed tier. Electron used three `electron-store` files
// (dex-analytics-config / -records / -daily under userData); this mirrors that
// shape under <appData>:
//   - dex-analytics-config.json : { enabled, retentionDays, estimatedManualTime }
//   - dex-analytics-records.json: { records: [ExecutionRecord, ...] }
//   - dex-analytics-daily.json  : { data: { "YYYY-MM-DD": DailyStats } }
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// TIME divergence (documented, same precedent as rewind:getDaySummary): the
// Electron code mixed UTC date strings (toISOString) with LOCAL hour/weekday
// (getHours/getDay). To stay tz-crate-free, ALL bucketing here is UTC (hour and
// weekday derived from the same civil_from_ms used everywhere else). Date strings
// already matched (both UTC); hour/weekday histograms shift by the local offset.
// =============================================================================

use crate::paths::DexPaths;
use crate::cmd_export_bundle::{civil_from_ms, utc_date};
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const CONFIG_FILE: &str = "dex-analytics-config.json";
const RECORDS_FILE: &str = "dex-analytics-records.json";
const DAILY_FILE: &str = "dex-analytics-daily.json";
const DAY_MS: i64 = 86_400_000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// UTC weekday for an instant: 0 = Sunday .. 6 = Saturday (mirrors getUTCDay()).
fn utc_dow(ms: i64) -> usize {
    ((ms.div_euclid(DAY_MS) % 7 + 4) % 7) as usize
}

// UTC hour [0,23].
fn utc_hour(ms: i64) -> usize {
    civil_from_ms(ms).3 as usize
}

// --- file IO ----------------------------------------------------------------

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

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => crate::write_atomic(store_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- record field accessors -------------------------------------------------

fn started(r: &Value) -> i64 {
    r.get("startedAt").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn duration(r: &Value) -> f64 {
    r.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0)
}
fn is_success(r: &Value) -> bool {
    r.get("success").and_then(|v| v.as_bool()).unwrap_or(false)
}
fn rtype(r: &Value) -> String {
    r.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string()
}
fn rname(r: &Value) -> String {
    r.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

// --- config -----------------------------------------------------------------

fn get_config(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, CONFIG_FILE);
    let enabled = raw.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    let retention = raw
        .get("retentionDays")
        .and_then(|v| v.as_i64())
        .unwrap_or(90);
    let manual = raw
        .get("estimatedManualTime")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(|| json!({
            "workflow": 300, "operation": 60, "action": 30, "script": 120, "trigger": 10
        }));
    json!({ "enabled": enabled, "retentionDays": retention, "estimatedManualTime": manual })
}

fn manual_time(cfg: &Value, kind: &str) -> f64 {
    cfg.get("estimatedManualTime")
        .and_then(|m| m.get(kind))
        .and_then(|v| v.as_f64())
        .unwrap_or(60.0)
}

// --- record store -----------------------------------------------------------

fn read_records(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, RECORDS_FILE)
        .get("records")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn write_records(app: &tauri::AppHandle, records: &[Value]) -> bool {
    write_file(app, RECORDS_FILE, &json!({ "records": records }))
}

fn read_daily(app: &tauri::AppHandle) -> Map<String, Value> {
    read_file(app, DAILY_FILE)
        .get("data")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn write_daily(app: &tauri::AppHandle, data: &Map<String, Value>) -> bool {
    write_file(app, DAILY_FILE, &json!({ "data": Value::Object(data.clone()) }))
}

fn default_daily(date: &str) -> Value {
    json!({
        "date": date,
        "executions": 0,
        "successes": 0,
        "failures": 0,
        "totalDuration": 0,
        "byType": {},
        "byHour": vec![0; 24],
    })
}

// getRecords(options?) — filter by type/since/success, sort newest-first, slice.
fn get_records(app: &tauri::AppHandle, options: &Value) -> Vec<Value> {
    let mut recs = read_records(app);
    if let Some(t) = options.get("type").and_then(|v| v.as_str()) {
        recs.retain(|r| rtype(r) == t);
    }
    if let Some(since) = options.get("since").and_then(|v| v.as_i64()) {
        recs.retain(|r| started(r) >= since);
    }
    if let Some(success) = options.get("success").and_then(|v| v.as_bool()) {
        recs.retain(|r| is_success(r) == success);
    }
    recs.sort_by(|a, b| started(b).cmp(&started(a)));
    if let Some(limit) = options.get("limit").and_then(|v| v.as_u64()) {
        recs.truncate(limit as usize);
    }
    recs
}

fn update_daily(daily: &mut Map<String, Value>, record: &Value) {
    let ts = started(record);
    let date = utc_date(ts);
    let hour = utc_hour(ts);
    let entry = daily.entry(date.clone()).or_insert_with(|| default_daily(&date));
    let obj = match entry.as_object_mut() {
        Some(o) => o,
        None => return,
    };
    let bump = |o: &mut Map<String, Value>, k: &str, by: i64| {
        let v = o.get(k).and_then(|x| x.as_i64()).unwrap_or(0) + by;
        o.insert(k.to_string(), json!(v));
    };
    bump(obj, "executions", 1);
    if is_success(record) {
        bump(obj, "successes", 1);
    } else {
        bump(obj, "failures", 1);
    }
    let dur = duration(record);
    if dur != 0.0 {
        let total = obj.get("totalDuration").and_then(|v| v.as_f64()).unwrap_or(0.0) + dur;
        obj.insert("totalDuration".into(), json!(total));
    }
    let kind = rtype(record);
    if let Some(by_type) = obj.get_mut("byType").and_then(|v| v.as_object_mut()) {
        let c = by_type.get(&kind).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        by_type.insert(kind, json!(c));
    }
    if let Some(by_hour) = obj.get_mut("byHour").and_then(|v| v.as_array_mut()) {
        if hour < by_hour.len() {
            let c = by_hour[hour].as_i64().unwrap_or(0) + 1;
            by_hour[hour] = json!(c);
        }
    }
}

fn record_execution(app: &tauri::AppHandle, record: &Value) -> Value {
    let cfg = get_config(app);
    // Disabled: Electron returns { id: '', ...record } and persists nothing.
    if !cfg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true) {
        let mut out = record.as_object().cloned().unwrap_or_default();
        out.insert("id".into(), json!(""));
        return Value::Object(out);
    }
    let mut full = record.as_object().cloned().unwrap_or_default();
    let id = format!("exec-{}-{}", now_ms(), &pseudo_uuid_v4()[..4]);
    full.insert("id".into(), json!(id));
    let full = Value::Object(full);

    let mut records = read_records(app);
    records.push(full.clone());
    let retention = cfg.get("retentionDays").and_then(|v| v.as_i64()).unwrap_or(90);
    let cutoff = now_ms() - retention * DAY_MS;
    records.retain(|r| started(r) > cutoff);
    write_records(app, &records);

    let mut daily = read_daily(app);
    update_daily(&mut daily, &full);
    write_daily(app, &daily);

    full
}

fn get_daily_stats(app: &tauri::AppHandle, start: &str, end: &str) -> Value {
    let daily = read_daily(app);
    let start_ms = match parse_date_ms(start) {
        Some(v) => v,
        None => return json!([]),
    };
    let end_ms = match parse_date_ms(end) {
        Some(v) => v,
        None => return json!([]),
    };
    let mut out: Vec<Value> = Vec::new();
    let mut d = start_ms;
    while d <= end_ms {
        let date = utc_date(d);
        let stats = daily.get(&date).cloned().unwrap_or_else(|| default_daily(&date));
        out.push(stats);
        d += DAY_MS;
    }
    json!(out)
}

// "YYYY-MM-DD" -> epoch millis at UTC midnight (Howard Hinnant days_from_civil).
fn parse_date_ms(s: &str) -> Option<i64> {
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() < 3 {
        return None;
    }
    let y: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    let d: i64 = parts[2].parse().ok()?;
    let yy = if m <= 2 { y - 1 } else { y };
    let era = (if yy >= 0 { yy } else { yy - 399 }) / 400;
    let yoe = yy - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * DAY_MS)
}

fn get_summary(app: &tauri::AppHandle, days: i64) -> Value {
    let cfg = get_config(app);
    let now = now_ms();
    let period_start = now - days * DAY_MS;
    let prev_period_start = period_start - days * DAY_MS;

    let current = get_records(app, &json!({ "since": period_start }));
    let mut prev = get_records(app, &json!({ "since": prev_period_start }));
    prev.retain(|r| started(r) < period_start);

    let success_count = current.iter().filter(|r| is_success(r)).count();
    let total_duration: f64 = current.iter().map(duration).sum();

    let mut time_saved = 0.0;
    for r in &current {
        if is_success(r) {
            let mt = manual_time(&cfg, &rtype(r));
            let actual = duration(r) / 1000.0;
            time_saved += (mt - actual).max(0.0);
        }
    }

    // Group by type.
    let mut by_type = Map::new();
    let mut kinds: Vec<String> = Vec::new();
    for r in &current {
        let k = rtype(r);
        if !kinds.contains(&k) {
            kinds.push(k);
        }
    }
    for k in &kinds {
        let group: Vec<&Value> = current.iter().filter(|r| &rtype(r) == k).collect();
        let count = group.len();
        let succ = group.iter().filter(|r| is_success(r)).count();
        let dur: f64 = group.iter().map(|r| duration(r)).sum();
        by_type.insert(
            k.clone(),
            json!({
                "count": count,
                "successRate": if count > 0 { (succ as f64 / count as f64) * 100.0 } else { 0.0 },
                "avgDuration": if count > 0 { dur / count as f64 } else { 0.0 },
            }),
        );
    }

    let trend = if !prev.is_empty() {
        ((current.len() as f64 - prev.len() as f64) / prev.len() as f64) * 100.0
    } else {
        0.0
    };

    json!({
        "totalExecutions": current.len(),
        "successRate": if !current.is_empty() { (success_count as f64 / current.len() as f64) * 100.0 } else { 0.0 },
        "avgDuration": if !current.is_empty() { total_duration / current.len() as f64 } else { 0.0 },
        "timeSaved": time_saved,
        "byType": Value::Object(by_type),
        "trend": trend.round() as i64,
    })
}

fn get_weekly_digest(app: &tauri::AppHandle) -> Value {
    let now = now_ms();
    let midnight = now.div_euclid(DAY_MS) * DAY_MS;
    let week_start = midnight - (utc_dow(now) as i64) * DAY_MS;
    let week_end = week_start + 7 * DAY_MS - 1;

    let records: Vec<Value> = get_records(app, &json!({ "since": week_start }))
        .into_iter()
        .filter(|r| started(r) <= week_end)
        .collect();

    let prev_week_start = week_start - 7 * DAY_MS;
    let prev: Vec<Value> = get_records(app, &json!({ "since": prev_week_start }))
        .into_iter()
        .filter(|r| started(r) < week_start)
        .collect();

    let success_count = records.iter().filter(|r| is_success(r)).count();
    let total_duration: f64 = records.iter().map(duration).sum();

    let cfg = get_config(app);
    let mut time_saved = 0.0;
    for r in &records {
        if is_success(r) {
            time_saved += manual_time(&cfg, &rtype(r));
        }
    }

    let mut hour_counts = vec![0i64; 24];
    let mut workflow_counts: Map<String, Value> = Map::new();
    let mut operation_counts: Map<String, Value> = Map::new();
    for r in &records {
        match rtype(r).as_str() {
            "workflow" => {
                let n = rname(r);
                let c = workflow_counts.get(&n).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
                workflow_counts.insert(n, json!(c));
            }
            "operation" => {
                let n = rname(r);
                let c = operation_counts.get(&n).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
                operation_counts.insert(n, json!(c));
            }
            _ => {}
        }
        let h = utc_hour(started(r));
        if h < 24 {
            hour_counts[h] += 1;
        }
    }

    let top = |counts: &Map<String, Value>| -> Value {
        let mut v: Vec<(String, i64)> = counts
            .iter()
            .map(|(k, val)| (k.clone(), val.as_i64().unwrap_or(0)))
            .collect();
        v.sort_by(|a, b| b.1.cmp(&a.1));
        v.truncate(5);
        json!(v
            .into_iter()
            .map(|(name, count)| json!({ "name": name, "count": count }))
            .collect::<Vec<Value>>())
    };

    let peak_hour = hour_counts
        .iter()
        .enumerate()
        .max_by_key(|(_, c)| **c)
        .map(|(i, _)| i)
        .unwrap_or(0);

    let trend = if records.len() as f64 > prev.len() as f64 * 1.1 {
        "up"
    } else if (records.len() as f64) < prev.len() as f64 * 0.9 {
        "down"
    } else {
        "stable"
    };

    json!({
        "weekStart": utc_date(week_start),
        "weekEnd": utc_date(week_end),
        "totalExecutions": records.len(),
        "successRate": if !records.is_empty() { (success_count as f64 / records.len() as f64) * 100.0 } else { 0.0 },
        "avgDuration": if !records.is_empty() { total_duration / records.len() as f64 } else { 0.0 },
        "timeSaved": time_saved,
        "topWorkflows": top(&workflow_counts),
        "topOperations": top(&operation_counts),
        "peakHour": peak_hour,
        "trend": trend,
    })
}

fn get_heatmap(app: &tauri::AppHandle, days: i64) -> Value {
    let records = get_records(app, &json!({ "since": now_ms() - days * DAY_MS }));
    let mut hourly = vec![0i64; 24];
    let mut daily = vec![0i64; 7];
    let mut matrix = vec![vec![0i64; 24]; 7];
    for r in &records {
        let ts = started(r);
        let hour = utc_hour(ts);
        let day = utc_dow(ts);
        if hour < 24 && day < 7 {
            hourly[hour] += 1;
            daily[day] += 1;
            matrix[day][hour] += 1;
        }
    }
    json!({ "hourly": hourly, "daily": daily, "matrix": matrix })
}

fn get_recommendations(app: &tauri::AppHandle) -> Value {
    let mut recs: Vec<Value> = Vec::new();
    let summary = get_summary(app, 30);
    let records = get_records(app, &json!({ "limit": 1000 }));

    let success_rate = summary.get("successRate").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let total = summary.get("totalExecutions").and_then(|v| v.as_i64()).unwrap_or(0);
    let time_saved = summary.get("timeSaved").and_then(|v| v.as_f64()).unwrap_or(0.0);

    if success_rate < 90.0 && total > 10 {
        recs.push(json!({
            "id": "low-success-rate",
            "type": "reliability",
            "priority": "high",
            "title": "Low Success Rate Detected",
            "description": format!("Your automation success rate is {:.1}%. Consider reviewing failing workflows.", success_rate),
            "actionable": "Review failed executions in the logs",
        }));
    }

    // Frequently failing items (type:name), top 3 with >= 5 failures.
    let mut failure_counts: Map<String, Value> = Map::new();
    for r in &records {
        if !is_success(r) {
            let key = format!("{}:{}", rtype(r), rname(r));
            let c = failure_counts.get(&key).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
            failure_counts.insert(key, json!(c));
        }
    }
    let mut top_failures: Vec<(String, i64)> = failure_counts
        .iter()
        .map(|(k, v)| (k.clone(), v.as_i64().unwrap_or(0)))
        .collect();
    top_failures.sort_by(|a, b| b.1.cmp(&a.1));
    top_failures.truncate(3);
    for (key, count) in top_failures {
        if count >= 5 {
            let mut sp = key.splitn(2, ':');
            let kind = sp.next().unwrap_or("");
            let name = sp.next().unwrap_or("");
            recs.push(json!({
                "id": format!("frequent-failure-{}", key),
                "type": "reliability",
                "priority": "medium",
                "title": format!("Frequently Failing {}", kind),
                "description": format!("\"{}\" has failed {} times recently.", name, count),
                "actionable": format!("Review and fix {}", name),
                "data": { "type": kind, "name": name, "failureCount": count },
            }));
        }
    }

    // Slow execution warnings from summary.byType.
    if let Some(by_type) = summary.get("byType").and_then(|v| v.as_object()) {
        for (kind, stats) in by_type {
            let avg = stats.get("avgDuration").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let count = stats.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            if avg > 30000.0 && count > 5 {
                recs.push(json!({
                    "id": format!("slow-{}", kind),
                    "type": "performance",
                    "priority": "low",
                    "title": format!("Slow {} Executions", kind),
                    "description": format!("Average {} execution time is {:.1}s.", kind, avg / 1000.0),
                    "actionable": "Consider optimizing long-running automations",
                }));
            }
        }
    }

    if total < 10 && total > 0 {
        recs.push(json!({
            "id": "low-usage",
            "type": "usage",
            "priority": "low",
            "title": "Underutilized Automation",
            "description": "You have few automations running. Set up more triggers or schedules.",
            "actionable": "Visit Scheduler to add automated triggers",
        }));
    }

    if time_saved > 3600.0 {
        recs.push(json!({
            "id": "time-saved",
            "type": "usage",
            "priority": "low",
            "title": "Great Time Savings!",
            "description": format!("You saved approximately {:.1} hours this month.", time_saved / 3600.0),
        }));
    }

    json!(recs)
}

fn get_item_metrics(app: &tauri::AppHandle, kind: &str, name: &str) -> Value {
    let records: Vec<Value> = get_records(app, &json!({ "type": kind }))
        .into_iter()
        .filter(|r| rname(r) == name)
        .collect();

    if records.is_empty() {
        return json!({
            "totalRuns": 0,
            "successRate": 0,
            "avgDuration": 0,
            "minDuration": 0,
            "maxDuration": 0,
            "recentTrend": [],
        });
    }

    let durations: Vec<f64> = records
        .iter()
        .filter(|r| r.get("duration").and_then(|v| v.as_f64()).is_some())
        .map(duration)
        .collect();
    let successes = records.iter().filter(|r| is_success(r)).count();

    let now = now_ms();
    let mut recent_trend: Vec<i64> = Vec::new();
    for i in (0..=6).rev() {
        let day_start = now - (i + 1) * DAY_MS;
        let day_end = now - i * DAY_MS;
        let count = records
            .iter()
            .filter(|r| started(r) >= day_start && started(r) < day_end)
            .count() as i64;
        recent_trend.push(count);
    }

    let avg = if !durations.is_empty() {
        durations.iter().sum::<f64>() / durations.len() as f64
    } else {
        0.0
    };
    let min = durations.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = durations.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    json!({
        "totalRuns": records.len(),
        "successRate": (successes as f64 / records.len() as f64) * 100.0,
        "avgDuration": avg,
        "minDuration": if durations.is_empty() { 0.0 } else { min },
        "maxDuration": if durations.is_empty() { 0.0 } else { max },
        "lastRun": records.first().map(started),
        "recentTrend": recent_trend,
    })
}

fn export_data(app: &tauri::AppHandle) -> Value {
    json!({
        "records": get_records(app, &Value::Null),
        "dailyStats": Value::Object(read_daily(app)),
        "summary": get_summary(app, 90),
        "exportedAt": now_ms(),
    })
}

fn cleanup(app: &tauri::AppHandle) -> Value {
    let cfg = get_config(app);
    let retention = cfg.get("retentionDays").and_then(|v| v.as_i64()).unwrap_or(90);
    let cutoff = now_ms() - retention * DAY_MS;

    let records = read_records(app);
    let kept: Vec<Value> = records.iter().filter(|r| started(r) > cutoff).cloned().collect();
    let removed = records.len() - kept.len();
    write_records(app, &kept);

    let cutoff_date = utc_date(cutoff);
    let mut daily = read_daily(app);
    daily.retain(|date, _| date.as_str() >= cutoff_date.as_str());
    write_daily(app, &daily);

    json!(removed)
}

/// Route an `analytics:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "analytics:record" => record_execution(app, &a0),
        "analytics:get-records" => json!(get_records(app, &a0)),
        "analytics:get-summary" => {
            let days = a0.as_i64().unwrap_or(30);
            get_summary(app, days)
        }
        "analytics:get-daily" => {
            let start = a0.as_str().unwrap_or("");
            let end = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            get_daily_stats(app, start, end)
        }
        "analytics:get-weekly-digest" => get_weekly_digest(app),
        "analytics:get-heatmap" => {
            let days = a0.as_i64().unwrap_or(30);
            get_heatmap(app, days)
        }
        "analytics:get-recommendations" => get_recommendations(app),
        "analytics:get-item-metrics" => {
            let kind = a0.as_str().unwrap_or("");
            let name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            get_item_metrics(app, kind, name)
        }
        "analytics:export" => export_data(app),
        "analytics:cleanup" => cleanup(app),
        "analytics:get-config" => get_config(app),
        _ => Value::Null,
    }
}
