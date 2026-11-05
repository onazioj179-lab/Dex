// =============================================================================
// DEX Ledger — local-first personal finance store (shared dex.db)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Relational tables for accounts, categories, transactions, splits and monthly
//! budgets. Money is stored as INTEGER minor units (cents) — never floating
//! point. The renderer edits a working copy and persists it with
//! `ledger:save`, which validates the whole document and replaces the tables
//! inside ONE SQLite transaction: either every row lands or none does, so a
//! crash mid-save can't leave half a ledger.
//!
//! Channels:
//!   - ledger:load  ()     -> { ok, doc }   (doc has empty arrays on first run)
//!   - ledger:save  (doc)  -> { ok } | { ok:false, error }
//!   - ledger:stats ()     -> { ok, accounts, transactions }

use rusqlite::{params, Connection};
use serde_json::{json, Value};

pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS ledger_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ledger_accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            opening_minor INTEGER NOT NULL DEFAULT 0,
            opening_date TEXT NOT NULL,
            closed INTEGER NOT NULL DEFAULT 0,
            sort INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ledger_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            group_name TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0,
            sort INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ledger_transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            account_id TEXT NOT NULL REFERENCES ledger_accounts(id) ON DELETE CASCADE,
            payee TEXT NOT NULL DEFAULT '',
            memo TEXT NOT NULL DEFAULT '',
            transfer_id TEXT,
            transfer_account_id TEXT,
            status INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_txn_account ON ledger_transactions(account_id, date);
        CREATE TABLE IF NOT EXISTS ledger_splits (
            txn_id TEXT NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
            idx INTEGER NOT NULL,
            category_id TEXT,
            amount_minor INTEGER NOT NULL,
            memo TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (txn_id, idx)
        );
        CREATE TABLE IF NOT EXISTS ledger_budgets (
            month TEXT NOT NULL,
            category_id TEXT NOT NULL,
            amount_minor INTEGER NOT NULL,
            PRIMARY KEY (month, category_id)
        );",
    );
}

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}
fn opt_s(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(String::from)
}
/// Integer-only money. A float (e.g. 12.5) or out-of-range value is rejected,
/// so a renderer bug can't silently round someone's balance.
fn minor(v: &Value, k: &str) -> Result<i64, String> {
    match v.get(k) {
        Some(Value::Number(n)) if n.is_i64() => {
            let x = n.as_i64().unwrap();
            if x.abs() > 9_000_000_000_000_000 / 1000 { Err(format!("{k} out of range")) } else { Ok(x) }
        }
        Some(_) => Err(format!("{k} must be an integer number of minor units")),
        None => Ok(0),
    }
}
fn is_month(m: &str) -> bool {
    m.len() == 7 && m.as_bytes()[4] == b'-' && m[..4].chars().all(|c| c.is_ascii_digit()) && m[5..].chars().all(|c| c.is_ascii_digit())
}
fn is_date(d: &str) -> bool {
    d.len() == 10 && is_month(&d[..7]) && d.as_bytes()[7] == b'-' && d[8..].chars().all(|c| c.is_ascii_digit())
}
fn arr<'a>(doc: &'a Value, k: &str) -> &'a [Value] {
    doc.get(k).and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[])
}

pub fn load(conn: &Connection) -> Result<Value, String> {
    let e = |x: rusqlite::Error| x.to_string();
    let mut meta = serde_json::Map::new();
    {
        let mut st = conn.prepare("SELECT key, value FROM ledger_meta").map_err(e)?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(e)?;
        for r in rows { let (k, v) = r.map_err(e)?; meta.insert(k, Value::String(v)); }
    }
    let mut accounts = Vec::new();
    {
        let mut st = conn.prepare("SELECT id, name, type, opening_minor, opening_date, closed FROM ledger_accounts ORDER BY sort, rowid").map_err(e)?;
        let rows = st.query_map([], |r| Ok(json!({
            "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "type": r.get::<_, String>(2)?,
            "openingMinor": r.get::<_, i64>(3)?, "openingDate": r.get::<_, String>(4)?, "closed": r.get::<_, i64>(5)? != 0,
        }))).map_err(e)?;
        for r in rows { accounts.push(r.map_err(e)?); }
    }
    let mut categories = Vec::new();
    {
        let mut st = conn.prepare("SELECT id, name, group_name, kind, archived FROM ledger_categories ORDER BY sort, rowid").map_err(e)?;
        let rows = st.query_map([], |r| Ok(json!({
            "id": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "group": r.get::<_, String>(2)?,
            "kind": r.get::<_, String>(3)?, "archived": r.get::<_, i64>(4)? != 0,
        }))).map_err(e)?;
        for r in rows { categories.push(r.map_err(e)?); }
    }
    let mut splits: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
    {
        let mut st = conn.prepare("SELECT txn_id, category_id, amount_minor, memo FROM ledger_splits ORDER BY txn_id, idx").map_err(e)?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, json!({
            "categoryId": r.get::<_, Option<String>>(1)?, "amountMinor": r.get::<_, i64>(2)?, "memo": r.get::<_, String>(3)?,
        })))).map_err(e)?;
        for r in rows { let (t, v) = r.map_err(e)?; splits.entry(t).or_default().push(v); }
    }
    let mut transactions = Vec::new();
    {
        let mut st = conn.prepare("SELECT id, date, account_id, payee, memo, transfer_id, transfer_account_id, status, created_at FROM ledger_transactions ORDER BY date, created_at, rowid").map_err(e)?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, json!({
            "date": r.get::<_, String>(1)?, "accountId": r.get::<_, String>(2)?, "payee": r.get::<_, String>(3)?,
            "memo": r.get::<_, String>(4)?, "transferId": r.get::<_, Option<String>>(5)?,
            "transferAccountId": r.get::<_, Option<String>>(6)?, "status": r.get::<_, i64>(7)?, "createdAt": r.get::<_, i64>(8)?,
        })))).map_err(e)?;
        for r in rows {
            let (id, mut v) = r.map_err(e)?;
            v["id"] = Value::String(id.clone());
            v["splits"] = Value::Array(splits.remove(&id).unwrap_or_default());
            transactions.push(v);
        }
    }
    let mut budgets = Vec::new();
    {
        let mut st = conn.prepare("SELECT month, category_id, amount_minor FROM ledger_budgets ORDER BY month, category_id").map_err(e)?;
        let rows = st.query_map([], |r| Ok(json!({
            "month": r.get::<_, String>(0)?, "categoryId": r.get::<_, String>(1)?, "amountMinor": r.get::<_, i64>(2)?,
        }))).map_err(e)?;
        for r in rows { budgets.push(r.map_err(e)?); }
    }
    Ok(json!({
        "version": 1,
        "currency": meta.get("currency").cloned().unwrap_or(Value::String("USD".into())),
        "accounts": accounts, "categories": categories, "transactions": transactions, "budgets": budgets,
    }))
}

/// Validate and replace the whole ledger atomically.
pub fn save(conn: &Connection, doc: &Value) -> Result<(), String> {
    let currency = doc.get("currency").and_then(|x| x.as_str()).unwrap_or("USD");
    if currency.len() != 3 || !currency.chars().all(|c| c.is_ascii_uppercase()) {
        return Err("currency must be a 3-letter ISO code".into());
    }
    let accounts = arr(doc, "accounts");
    let mut account_ids = std::collections::HashSet::new();
    for a in accounts {
        let id = s(a, "id");
        if id.is_empty() || s(a, "name").trim().is_empty() { return Err("every account needs an id and a name".into()); }
        if !account_ids.insert(id) { return Err("duplicate account id".into()); }
        if !is_date(&s(a, "openingDate")) { return Err(format!("account {}: opening date must be YYYY-MM-DD", s(a, "name"))); }
        minor(a, "openingMinor")?;
    }
    let mut category_ids = std::collections::HashSet::new();
    for c in arr(doc, "categories") {
        let kind = s(c, "kind");
        if s(c, "id").is_empty() || s(c, "name").trim().is_empty() { return Err("every category needs an id and a name".into()); }
        if kind != "income" && kind != "expense" { return Err(format!("category {}: kind must be income or expense", s(c, "name"))); }
        if !category_ids.insert(s(c, "id")) { return Err("duplicate category id".into()); }
    }
    let mut txn_ids = std::collections::HashSet::new();
    for t in arr(doc, "transactions") {
        let id = s(t, "id");
        if id.is_empty() || !txn_ids.insert(id.clone()) { return Err("transaction ids must be present and unique".into()); }
        if !is_date(&s(t, "date")) { return Err(format!("transaction {id}: date must be YYYY-MM-DD")); }
        if !account_ids.contains(&s(t, "accountId")) { return Err(format!("transaction {id}: unknown account")); }
        let is_transfer = opt_s(t, "transferId").is_some();
        let splits = arr(t, "splits");
        if splits.is_empty() { return Err(format!("transaction {id}: needs at least one amount")); }
        for sp in splits {
            minor(sp, "amountMinor")?;
            match opt_s(sp, "categoryId") {
                Some(c) if is_transfer => return Err(format!("transaction {id}: a transfer cannot have a category ({c})")),
                Some(c) if !category_ids.contains(&c) => return Err(format!("transaction {id}: unknown category")),
                _ => {}
            }
        }
        if is_transfer && !account_ids.contains(&s(t, "transferAccountId")) {
            return Err(format!("transaction {id}: transfer to an unknown account"));
        }
    }
    for b in arr(doc, "budgets") {
        if !is_month(&s(b, "month")) { return Err("budget month must be YYYY-MM".into()); }
        if !category_ids.contains(&s(b, "categoryId")) { return Err("budget for an unknown category".into()); }
        minor(b, "amountMinor")?;
    }

    let e = |x: rusqlite::Error| x.to_string();
    let tx = conn.unchecked_transaction().map_err(e)?;
    tx.execute_batch("DELETE FROM ledger_splits; DELETE FROM ledger_transactions; DELETE FROM ledger_budgets; DELETE FROM ledger_categories; DELETE FROM ledger_accounts;").map_err(e)?;
    tx.execute("INSERT OR REPLACE INTO ledger_meta(key, value) VALUES ('currency', ?1)", params![currency]).map_err(e)?;
    for (i, a) in accounts.iter().enumerate() {
        tx.execute(
            "INSERT INTO ledger_accounts(id, name, type, opening_minor, opening_date, closed, sort) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![s(a, "id"), s(a, "name"), s(a, "type"), minor(a, "openingMinor")?, s(a, "openingDate"),
                a.get("closed").and_then(|x| x.as_bool()).unwrap_or(false) as i64, i as i64],
        ).map_err(e)?;
    }
    for (i, c) in arr(doc, "categories").iter().enumerate() {
        tx.execute(
            "INSERT INTO ledger_categories(id, name, group_name, kind, archived, sort) VALUES (?1,?2,?3,?4,?5,?6)",
            params![s(c, "id"), s(c, "name"), s(c, "group"), s(c, "kind"), c.get("archived").and_then(|x| x.as_bool()).unwrap_or(false) as i64, i as i64],
        ).map_err(e)?;
    }
    for t in arr(doc, "transactions") {
        let id = s(t, "id");
        tx.execute(
            "INSERT INTO ledger_transactions(id, date, account_id, payee, memo, transfer_id, transfer_account_id, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![id, s(t, "date"), s(t, "accountId"), s(t, "payee"), s(t, "memo"), opt_s(t, "transferId"), opt_s(t, "transferAccountId"),
                t.get("status").and_then(|x| x.as_i64()).unwrap_or(0).clamp(0, 2), t.get("createdAt").and_then(|x| x.as_i64()).unwrap_or(0)],
        ).map_err(e)?;
        for (i, sp) in arr(t, "splits").iter().enumerate() {
            tx.execute(
                "INSERT INTO ledger_splits(txn_id, idx, category_id, amount_minor, memo) VALUES (?1,?2,?3,?4,?5)",
                params![id, i as i64, opt_s(sp, "categoryId"), minor(sp, "amountMinor")?, s(sp, "memo")],
            ).map_err(e)?;
        }
    }
    for b in arr(doc, "budgets") {
        tx.execute(
            "INSERT INTO ledger_budgets(month, category_id, amount_minor) VALUES (?1,?2,?3)",
            params![s(b, "month"), s(b, "categoryId"), minor(b, "amountMinor")?],
        ).map_err(e)?;
    }
    tx.commit().map_err(e)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "ledger:load" => match load(conn) {
            Ok(doc) => json!({ "ok": true, "doc": doc }),
            Err(err) => json!({ "ok": false, "error": err }),
        },
        "ledger:save" => match args.get(0) {
            Some(doc) => match save(conn, doc) {
                Ok(()) => json!({ "ok": true }),
                Err(err) => json!({ "ok": false, "error": err }),
            },
            None => json!({ "ok": false, "error": "missing ledger document" }),
        },
        "ledger:stats" => {
            let n = |sql: &str| conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0);
            json!({ "ok": true, "accounts": n("SELECT COUNT(*) FROM ledger_accounts"), "transactions": n("SELECT COUNT(*) FROM ledger_transactions") })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        ensure_schema(&c);
        c
    }

    fn sample() -> Value {
        json!({
            "version": 1, "currency": "EUR",
            "accounts": [
                { "id": "a1", "name": "Checking", "type": "checking", "openingMinor": 100000, "openingDate": "2026-01-01" },
                { "id": "a2", "name": "Savings", "type": "savings", "openingMinor": 0, "openingDate": "2026-01-01", "closed": false }
            ],
            "categories": [ { "id": "c1", "name": "Groceries", "group": "Everyday", "kind": "expense" } ],
            "transactions": [
                { "id": "t1", "date": "2026-01-05", "accountId": "a1", "payee": "Market", "memo": "", "status": 1, "createdAt": 1,
                  "splits": [ { "categoryId": "c1", "amountMinor": -4250, "memo": "" }, { "categoryId": "c1", "amountMinor": -199, "memo": "bag" } ] },
                { "id": "t2", "date": "2026-01-06", "accountId": "a1", "transferId": "x1", "transferAccountId": "a2", "status": 0, "createdAt": 2,
                  "splits": [ { "categoryId": null, "amountMinor": -20000 } ] },
                { "id": "t3", "date": "2026-01-06", "accountId": "a2", "transferId": "x1", "transferAccountId": "a1", "status": 0, "createdAt": 2,
                  "splits": [ { "amountMinor": 20000 } ] }
            ],
            "budgets": [ { "month": "2026-01", "categoryId": "c1", "amountMinor": 30000 } ]
        })
    }

    #[test]
    fn round_trips_a_ledger() {
        let c = conn();
        save(&c, &sample()).unwrap();
        let doc = load(&c).unwrap();
        assert_eq!(doc["currency"], "EUR");
        assert_eq!(doc["accounts"].as_array().unwrap().len(), 2);
        let t1 = &doc["transactions"][0];
        assert_eq!(t1["id"], "t1");
        assert_eq!(t1["splits"][1]["amountMinor"], -199);
        assert_eq!(t1["splits"][1]["memo"], "bag");
        assert_eq!(doc["transactions"][1]["transferAccountId"], "a2");
        assert_eq!(doc["budgets"][0]["amountMinor"], 30000);
    }

    #[test]
    fn empty_database_loads_as_empty_ledger() {
        let doc = load(&conn()).unwrap();
        assert_eq!(doc["accounts"].as_array().unwrap().len(), 0);
        assert_eq!(doc["currency"], "USD");
    }

    #[test]
    fn rejects_floats_and_keeps_previous_data() {
        let c = conn();
        save(&c, &sample()).unwrap();
        let mut bad = sample();
        bad["transactions"][0]["splits"][0]["amountMinor"] = json!(-42.5);
        assert!(save(&c, &bad).unwrap_err().contains("integer"));
        // Validation runs before the transaction: nothing was touched.
        assert_eq!(load(&c).unwrap()["transactions"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn rejects_categorised_transfers_and_unknown_refs() {
        let c = conn();
        let mut bad = sample();
        bad["transactions"][1]["splits"][0]["categoryId"] = json!("c1");
        assert!(save(&c, &bad).unwrap_err().contains("transfer cannot have a category"));
        let mut bad = sample();
        bad["transactions"][0]["accountId"] = json!("nope");
        assert!(save(&c, &bad).unwrap_err().contains("unknown account"));
        let mut bad = sample();
        bad["transactions"][0]["date"] = json!("05/01/2026");
        assert!(save(&c, &bad).is_err());
    }

    #[test]
    fn save_replaces_rows() {
        let c = conn();
        save(&c, &sample()).unwrap();
        let mut smaller = sample();
        smaller["transactions"] = json!([]);
        save(&c, &smaller).unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM ledger_splits", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }
}
