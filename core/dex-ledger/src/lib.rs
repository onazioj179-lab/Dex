// =============================================================================
// DEX Ledger — local-first personal finance engine.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! The whole financial model lives here, behind one SQLite file (`ledger.db`)
//! that only the DEX shell process opens. The renderer talks to it through
//! `ledger:*` channels (see [`Ledger::dispatch`]); nothing here touches the
//! network.
//!
//! Rules this engine enforces (and the tests pin down):
//! - Money is an `i64` count of the book currency's minor unit. No floats.
//! - Every write runs in one SQLite transaction together with its audit-log
//!   row, so a failure leaves nothing half-written.
//! - Transfers are two linked rows (one per account) whose amounts cancel. They
//!   are never income or expenses and never touch a budget category.
//! - Split transactions: the split lines must add up exactly to the parent.
//! - Reconciled transactions are locked: changing or deleting one needs an
//!   explicit `confirmReconciled` from the user.
//! - Budget: each category's Available = every amount assigned to it up to the
//!   month + every amount spent from it up to the month. Available (positive or
//!   overspent) rolls into the next month unchanged. "To assign" = opening
//!   balances + income received up to the month − everything assigned up to
//!   the month.

pub mod csv;
pub mod dates;
pub mod money;
pub mod schema;

mod budget;
mod io;
mod legacy;
mod reports;
mod txns;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub(crate) type R<T> = Result<T, String>;

pub(crate) fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub(crate) static NULL: Value = Value::Null;

/// The payload object: renderer calls send `[payload]`.
pub(crate) fn payload(args: &Value) -> &Value {
    match args {
        Value::Array(a) => a.first().unwrap_or(&NULL),
        other => other,
    }
}

pub(crate) fn gi(v: &Value, k: &str) -> Option<i64> {
    v.get(k).and_then(|x| x.as_i64())
}
pub(crate) fn gs(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_str()).map(|s| s.to_string())
}
pub(crate) fn gb(v: &Value, k: &str) -> Option<bool> {
    v.get(k).and_then(|x| x.as_bool())
}
pub(crate) fn req_i(v: &Value, k: &str) -> R<i64> {
    gi(v, k).ok_or_else(|| format!("missing number '{k}'"))
}
pub(crate) fn req_s(v: &Value, k: &str) -> R<String> {
    gs(v, k).ok_or_else(|| format!("missing text '{k}'"))
}
/// Optional id: a JSON null or absent key both mean None.
pub(crate) fn opt_id(v: &Value, k: &str) -> Option<i64> {
    gi(v, k)
}
pub(crate) fn ids(v: &Value, k: &str) -> Vec<i64> {
    v.get(k).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_i64()).collect()).unwrap_or_default()
}

pub(crate) fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub(crate) fn clean_text(s: &str, max: usize, what: &str) -> R<String> {
    let t = s.trim();
    if t.chars().count() > max {
        return Err(format!("{what} is longer than {max} characters"));
    }
    Ok(t.to_string())
}

pub(crate) fn audit(c: &Connection, action: &str, entity: &str, id: Option<i64>, detail: Value) -> R<()> {
    c.execute(
        "INSERT INTO audit_log (ts, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![now_ms(), action, entity, id, detail.to_string()],
    )
    .map_err(err)?;
    Ok(())
}

pub(crate) fn setting(c: &Connection, key: &str) -> Option<String> {
    c.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional().ok().flatten()
}

pub(crate) fn set_setting(c: &Connection, key: &str, value: &str) -> R<()> {
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}

pub(crate) fn digits(c: &Connection) -> u32 {
    setting(c, "currency").map(|cur| money::minor_digits(&cur)).unwrap_or(2)
}

pub(crate) const ACCOUNT_KINDS: &[&str] = &["cash", "checking", "savings", "credit", "other"];

/// Default category structure offered at setup. These are empty envelopes, not
/// financial data: no amounts, no transactions.
const DEFAULT_GROUPS: &[(&str, &str, &[&str])] = &[
    ("Everyday", "expense", &["Groceries", "Eating out", "Transport", "Household"]),
    ("Bills", "expense", &["Rent or mortgage", "Utilities", "Phone & internet", "Insurance", "Subscriptions"]),
    ("Savings", "expense", &["Emergency fund", "Holidays", "Large purchases"]),
    ("Personal", "expense", &["Health", "Clothing", "Gifts", "Personal spending"]),
    ("Income", "income", &["Salary", "Other income"]),
];

pub struct Ledger {
    pub(crate) conn: Connection,
    pub(crate) backup_dir: PathBuf,
    /// Idempotency: the last successful writes that carried an
    /// `idempotencyKey`, as (channel + key, response). A repeat of the same key
    /// on the same channel (double click, double Enter, a retry after a lost
    /// reply) returns the first response instead of writing again.
    recent_writes: std::collections::VecDeque<(String, Value)>,
}

/// How many keyed writes are remembered (per open ledger, not persisted).
const IDEMPOTENCY_MEMORY: usize = 64;

impl Ledger {
    /// Open (or create) the ledger file. A file that fails SQLite's integrity
    /// check is NOT modified or replaced: the error tells the user to restore
    /// from a backup, which the shell offers.
    pub fn open(path: &Path, backup_dir: &Path) -> R<Ledger> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        let conn = Connection::open(path).map_err(err)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;",
        )
        .map_err(err)?;
        let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(err)?;
        if check != "ok" {
            return Err(format!("CORRUPT: the ledger database failed its integrity check ({check})"));
        }
        Self::from_conn(conn, backup_dir)
    }

    pub fn open_in_memory(backup_dir: &Path) -> R<Ledger> {
        let conn = Connection::open_in_memory().map_err(err)?;
        Self::from_conn(conn, backup_dir)
    }

    fn from_conn(mut conn: Connection, backup_dir: &Path) -> R<Ledger> {
        schema::migrate(&mut conn)?;
        Ok(Ledger { conn, backup_dir: backup_dir.to_path_buf(), recent_writes: std::collections::VecDeque::new() })
    }

    /// Route one `ledger:*` channel. Always returns `{ ok, data | error }`.
    pub fn dispatch(&mut self, channel: &str, args: &Value) -> Value {
        let key = payload(args)
            .get("idempotencyKey")
            .and_then(|v| v.as_str())
            .filter(|k| !k.is_empty() && k.len() <= 128)
            .map(|k| format!("{channel}#{k}"));
        if let Some(k) = &key {
            if let Some((_, prev)) = self.recent_writes.iter().find(|(kk, _)| kk == k) {
                return prev.clone();
            }
        }
        let out = self.dispatch_inner(channel, args);
        // Only successes are remembered: a failed write may be retried with the same key.
        if let Some(k) = key {
            if out["ok"] == true {
                self.recent_writes.push_back((k, out.clone()));
                while self.recent_writes.len() > IDEMPOTENCY_MEMORY {
                    self.recent_writes.pop_front();
                }
            }
        }
        out
    }

    fn dispatch_inner(&mut self, channel: &str, args: &Value) -> Value {
        let p = payload(args);
        let res = match channel {
            "ledger:status" => self.status(),
            "ledger:setup" => self.setup(p),
            "ledger:settings:currency" => self.change_currency(p),

            "ledger:accounts:list" => self.accounts_list(),
            "ledger:accounts:create" => self.account_create(p),
            "ledger:accounts:update" => self.account_update(p),
            "ledger:accounts:archive" => self.account_archive(p),
            "ledger:accounts:delete" => self.account_delete(p),
            "ledger:accounts:reorder" => self.account_reorder(p),

            "ledger:categories:list" => self.categories_list(),
            "ledger:groups:create" => self.group_create(p),
            "ledger:groups:update" => self.group_update(p),
            "ledger:groups:delete" => self.group_delete(p),
            "ledger:groups:reorder" => self.group_reorder(p),
            "ledger:categories:create" => self.category_create(p),
            "ledger:categories:update" => self.category_update(p),
            "ledger:categories:delete" => self.category_delete(p),
            "ledger:categories:reorder" => self.category_reorder(p),

            "ledger:txns:list" => self.txns_list(p),
            "ledger:txns:get" => self.txn_get(p),
            "ledger:txns:create" => self.txn_create(p),
            "ledger:txns:transfer" => self.transfer_create(p),
            "ledger:txns:update" => self.txn_update(p),
            "ledger:txns:delete" => self.txn_delete(p),
            "ledger:txns:setStatus" => self.txn_set_status(p),
            "ledger:txns:categorize" => self.txn_categorize(p),
            "ledger:payees" => self.payees(),

            "ledger:attachments:list" => self.attachments_list(p),
            "ledger:attachments:get" => self.attachment_get(p),
            "ledger:attachments:delete" => self.attachment_delete(p),

            "ledger:budget:month" => self.budget_month(p),
            "ledger:budget:set" => self.budget_set(p),
            "ledger:budget:move" => self.budget_move(p),
            "ledger:budget:copyPrevious" => self.budget_copy_previous(p),

            "ledger:recurring:list" => self.recurring_list(),
            "ledger:recurring:create" => self.recurring_create(p),
            "ledger:recurring:update" => self.recurring_update(p),
            "ledger:recurring:delete" => self.recurring_delete(p),
            "ledger:recurring:post" => self.recurring_post(p),
            "ledger:recurring:skip" => self.recurring_skip(p),

            "ledger:overview" => self.overview(p),
            "ledger:reports:incomeExpense" => self.report_income_expense(p),
            "ledger:reports:cashFlow" => self.report_cash_flow(p),
            "ledger:reports:spending" => self.report_spending(p),
            "ledger:reports:balances" => self.report_balances(p),
            "ledger:reports:budgetVsActual" => self.report_budget_vs_actual(p),
            "ledger:reports:csv" => self.report_csv(p),

            "ledger:csv:preview" => self.csv_preview(p),
            "ledger:csv:import" => self.csv_import(p),
            "ledger:csv:export" => self.csv_export(p),

            "ledger:reconcile:summary" => self.reconcile_summary(p),
            "ledger:reconcile:match" => self.reconcile_match(p),
            "ledger:reconcile:finish" => self.reconcile_finish(p),
            "ledger:reconcile:undo" => self.reconcile_undo(p),
            "ledger:reconcile:history" => self.reconcile_history(p),

            "ledger:backup:create" => self.backup_create("manual").map(|v| v),
            "ledger:backup:list" => self.backup_list(),
            "ledger:backup:restore" => self.backup_restore_named(p),
            "ledger:audit:list" => self.audit_list(p),
            "ledger:integrity" => self.integrity(),
            _ => Err(format!("unknown ledger channel {channel}")),
        };
        match res {
            Ok(data) => json!({ "ok": true, "data": data }),
            Err(e) => json!({ "ok": false, "error": e }),
        }
    }

    // ---------------------------------------------------------------- setup

    fn status(&self) -> R<Value> {
        let currency = setting(&self.conn, "currency");
        let accounts: i64 = self.conn.query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0)).map_err(err)?;
        let txns: i64 = self.conn.query_row("SELECT COUNT(*) FROM transactions", [], |r| r.get(0)).map_err(err)?;
        Ok(json!({
            "ready": currency.is_some(),
            "currency": currency,
            "digits": digits(&self.conn),
            "schemaVersion": schema::user_version(&self.conn).map_err(err)?,
            "accountCount": accounts,
            "transactionCount": txns,
        }))
    }

    fn setup(&mut self, p: &Value) -> R<Value> {
        let cur = req_s(p, "currency")?.trim().to_uppercase();
        if !money::is_valid_code(&cur) {
            return Err(format!("'{cur}' is not an ISO 4217 currency code"));
        }
        if setting(&self.conn, "currency").is_some() {
            return Err("The ledger is already set up. Change the currency in Ledger settings.".into());
        }
        let seed = gb(p, "seedCategories").unwrap_or(true);
        let tx = self.conn.transaction().map_err(err)?;
        set_setting(&tx, "currency", &cur)?;
        let existing: i64 = tx.query_row("SELECT COUNT(*) FROM category_groups", [], |r| r.get(0)).map_err(err)?;
        if seed && existing == 0 {
            for (gi_, (gname, kind, cats)) in DEFAULT_GROUPS.iter().enumerate() {
                tx.execute("INSERT INTO category_groups (name, kind, sort) VALUES (?1, ?2, ?3)", params![gname, kind, gi_ as i64])
                    .map_err(err)?;
                let gid = tx.last_insert_rowid();
                for (ci, cname) in cats.iter().enumerate() {
                    tx.execute("INSERT INTO categories (group_id, name, sort) VALUES (?1, ?2, ?3)", params![gid, cname, ci as i64])
                        .map_err(err)?;
                }
            }
        } else if existing == 0 {
            // Income always needs a home so received money can be assigned.
            tx.execute("INSERT INTO category_groups (name, kind, sort) VALUES ('Income', 'income', 99)", []).map_err(err)?;
            let gid = tx.last_insert_rowid();
            tx.execute("INSERT INTO categories (group_id, name) VALUES (?1, 'Income')", [gid]).map_err(err)?;
        }
        audit(&tx, "setup", "settings", None, json!({ "currency": cur, "seedCategories": seed }))?;
        tx.commit().map_err(err)?;
        self.status()
    }

    /// Changing the currency only relabels amounts, so it is refused when it
    /// would change their meaning (different minor-unit exponent with data).
    fn change_currency(&mut self, p: &Value) -> R<Value> {
        let cur = req_s(p, "currency")?.trim().to_uppercase();
        if !money::is_valid_code(&cur) {
            return Err(format!("'{cur}' is not an ISO 4217 currency code"));
        }
        let old = setting(&self.conn, "currency").ok_or("Set up the ledger first")?;
        let has_amounts: i64 = self
            .conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM transactions) + (SELECT COUNT(*) FROM allocations) + (SELECT COUNT(*) FROM accounts WHERE opening_balance <> 0)",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if has_amounts > 0 && money::minor_digits(&old) != money::minor_digits(&cur) {
            return Err(format!(
                "{old} and {cur} use a different number of decimal places, so existing amounts would change value. DEX does not convert currencies; start a new ledger for {cur}."
            ));
        }
        let tx = self.conn.transaction().map_err(err)?;
        set_setting(&tx, "currency", &cur)?;
        audit(&tx, "update", "settings", None, json!({ "currency": { "from": old, "to": cur } }))?;
        tx.commit().map_err(err)?;
        self.status()
    }

    // ------------------------------------------------------------- accounts

    pub(crate) fn account_active(c: &Connection, id: i64) -> R<String> {
        let row: Option<(String, i64)> = c
            .query_row("SELECT name, archived FROM accounts WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(err)?;
        match row {
            None => Err(format!("account {id} does not exist")),
            Some((_, 1)) => Err("that account is archived; unarchive it first".into()),
            Some((name, _)) => Ok(name),
        }
    }

    pub(crate) fn account_balance(c: &Connection, id: i64) -> R<i64> {
        c.query_row(
            "SELECT a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id), 0) FROM accounts a WHERE a.id = ?1",
            [id],
            |r| r.get(0),
        )
        .map_err(err)
    }

    fn accounts_list(&self) -> R<Value> {
        let mut st = self
            .conn
            .prepare(
                "SELECT a.id, a.name, a.kind, a.opening_balance, a.opening_date, a.archived, a.notes, a.sort,
                        a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id), 0),
                        a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id AND t.status <> 'uncleared'), 0),
                        (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id),
                        (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id AND t.status = 'uncleared'),
                        (SELECT MAX(statement_date) FROM reconciliations r WHERE r.account_id = a.id AND r.undone = 0)
                   FROM accounts a ORDER BY a.archived, a.sort, a.id",
            )
            .map_err(err)?;
        let rows = st
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "kind": r.get::<_, String>(2)?,
                    "openingBalance": r.get::<_, i64>(3)?,
                    "openingDate": r.get::<_, String>(4)?,
                    "archived": r.get::<_, i64>(5)? == 1,
                    "notes": r.get::<_, String>(6)?,
                    "sort": r.get::<_, i64>(7)?,
                    "balance": r.get::<_, i64>(8)?,
                    "clearedBalance": r.get::<_, i64>(9)?,
                    "transactionCount": r.get::<_, i64>(10)?,
                    "unclearedCount": r.get::<_, i64>(11)?,
                    "lastReconciled": r.get::<_, Option<String>>(12)?,
                }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Value::Array(rows))
    }

    fn account_create(&mut self, p: &Value) -> R<Value> {
        if setting(&self.conn, "currency").is_none() {
            return Err("Choose the ledger currency first".into());
        }
        let name = clean_text(&req_s(p, "name")?, 80, "Account name")?;
        if name.is_empty() {
            return Err("Account name is required".into());
        }
        let kind = req_s(p, "kind")?;
        if !ACCOUNT_KINDS.contains(&kind.as_str()) {
            return Err(format!("unknown account type '{kind}'"));
        }
        let opening = gi(p, "openingBalance").unwrap_or(0);
        let date = gs(p, "openingDate").unwrap_or_else(dates::today_utc);
        if !dates::is_valid(&date) {
            return Err(format!("'{date}' is not a valid date"));
        }
        let notes = clean_text(&gs(p, "notes").unwrap_or_default(), 2000, "Notes")?;
        let tx = self.conn.transaction().map_err(err)?;
        let sort: i64 = tx.query_row("SELECT COALESCE(MAX(sort), -1) + 1 FROM accounts", [], |r| r.get(0)).map_err(err)?;
        tx.execute(
            "INSERT INTO accounts (name, kind, opening_balance, opening_date, notes, sort, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![name, kind, opening, date, notes, sort, now_ms()],
        )
        .map_err(err)?;
        let id = tx.last_insert_rowid();
        audit(&tx, "create", "account", Some(id), json!({ "name": name, "kind": kind, "openingBalance": opening, "openingDate": date }))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn account_update(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let exists: Option<i64> = tx.query_row("SELECT id FROM accounts WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(err)?;
        if exists.is_none() {
            return Err(format!("account {id} does not exist"));
        }
        let mut changed = serde_json::Map::new();
        if let Some(name) = gs(p, "name") {
            let name = clean_text(&name, 80, "Account name")?;
            if name.is_empty() {
                return Err("Account name is required".into());
            }
            tx.execute("UPDATE accounts SET name = ?1 WHERE id = ?2", params![name, id]).map_err(err)?;
            changed.insert("name".into(), json!(name));
        }
        if let Some(kind) = gs(p, "kind") {
            if !ACCOUNT_KINDS.contains(&kind.as_str()) {
                return Err(format!("unknown account type '{kind}'"));
            }
            tx.execute("UPDATE accounts SET kind = ?1 WHERE id = ?2", params![kind, id]).map_err(err)?;
            changed.insert("kind".into(), json!(kind));
        }
        if let Some(notes) = gs(p, "notes") {
            let notes = clean_text(&notes, 2000, "Notes")?;
            tx.execute("UPDATE accounts SET notes = ?1 WHERE id = ?2", params![notes, id]).map_err(err)?;
            changed.insert("notes".into(), json!(notes));
        }
        if let Some(ob) = gi(p, "openingBalance") {
            let recon: i64 = tx
                .query_row("SELECT COUNT(*) FROM reconciliations WHERE account_id = ?1 AND undone = 0", [id], |r| r.get(0))
                .map_err(err)?;
            if recon > 0 && gb(p, "confirmReconciled") != Some(true) {
                return Err("RECONCILED: this account has been reconciled; changing its opening balance changes reconciled balances".into());
            }
            tx.execute("UPDATE accounts SET opening_balance = ?1 WHERE id = ?2", params![ob, id]).map_err(err)?;
            changed.insert("openingBalance".into(), json!(ob));
        }
        if let Some(d) = gs(p, "openingDate") {
            if !dates::is_valid(&d) {
                return Err(format!("'{d}' is not a valid date"));
            }
            tx.execute("UPDATE accounts SET opening_date = ?1 WHERE id = ?2", params![d, id]).map_err(err)?;
            changed.insert("openingDate".into(), json!(d));
        }
        audit(&tx, "update", "account", Some(id), Value::Object(changed))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn account_archive(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let archived = gb(p, "archived").unwrap_or(true);
        let tx = self.conn.transaction().map_err(err)?;
        if archived {
            let bal = Self::account_balance(&tx, id)?;
            if bal != 0 {
                return Err("Only an account with a zero balance can be archived. Transfer or record the remaining balance first.".into());
            }
            tx.execute("DELETE FROM recurring WHERE account_id = ?1 OR transfer_account_id = ?1", [id]).map_err(err)?;
        }
        let n = tx.execute("UPDATE accounts SET archived = ?1 WHERE id = ?2", params![archived as i64, id]).map_err(err)?;
        if n == 0 {
            return Err(format!("account {id} does not exist"));
        }
        audit(&tx, if archived { "archive" } else { "unarchive" }, "account", Some(id), json!({}))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id, "archived": archived }))
    }

    fn account_delete(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let used: i64 = tx
            .query_row(
                "SELECT (SELECT COUNT(*) FROM transactions WHERE account_id = ?1) + (SELECT COUNT(*) FROM reconciliations WHERE account_id = ?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if used > 0 {
            return Err("This account has history. Archive it instead of deleting it.".into());
        }
        let name: Option<String> = tx.query_row("SELECT name FROM accounts WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(err)?;
        let name = name.ok_or_else(|| format!("account {id} does not exist"))?;
        tx.execute("DELETE FROM recurring WHERE account_id = ?1 OR transfer_account_id = ?1", [id]).map_err(err)?;
        tx.execute("DELETE FROM accounts WHERE id = ?1", [id]).map_err(err)?;
        audit(&tx, "delete", "account", Some(id), json!({ "name": name }))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn account_reorder(&mut self, p: &Value) -> R<Value> {
        let order = ids(p, "ids");
        let tx = self.conn.transaction().map_err(err)?;
        for (i, id) in order.iter().enumerate() {
            tx.execute("UPDATE accounts SET sort = ?1 WHERE id = ?2", params![i as i64, id]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(json!({}))
    }

    // ----------------------------------------------------------- categories

    pub(crate) fn category_kind(c: &Connection, id: i64) -> R<(String, bool)> {
        c.query_row(
            "SELECT g.kind, c.archived FROM categories c JOIN category_groups g ON g.id = c.group_id WHERE c.id = ?1",
            [id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? == 1)),
        )
        .optional()
        .map_err(err)?
        .ok_or_else(|| format!("category {id} does not exist"))
    }

    fn categories_list(&self) -> R<Value> {
        let mut gst = self
            .conn
            .prepare("SELECT id, name, kind, sort, collapsed FROM category_groups ORDER BY kind = 'income', sort, id")
            .map_err(err)?;
        let groups: Vec<(i64, String, String, i64, bool)> = gst
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get::<_, i64>(4)? == 1)))
            .map_err(err)?
            .collect::<Result<_, _>>()
            .map_err(err)?;
        let mut cst = self
            .conn
            .prepare(
                "SELECT c.id, c.name, c.archived, c.sort,
                        (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) + (SELECT COUNT(*) FROM splits s WHERE s.category_id = c.id)
                   FROM categories c WHERE c.group_id = ?1 ORDER BY c.sort, c.id",
            )
            .map_err(err)?;
        let mut out = Vec::new();
        for (id, name, kind, sort, collapsed) in groups {
            let cats = cst
                .query_map([id], |r| {
                    Ok(json!({
                        "id": r.get::<_, i64>(0)?,
                        "name": r.get::<_, String>(1)?,
                        "archived": r.get::<_, i64>(2)? == 1,
                        "sort": r.get::<_, i64>(3)?,
                        "useCount": r.get::<_, i64>(4)?,
                        "groupId": id,
                        "kind": kind,
                    }))
                })
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            out.push(json!({ "id": id, "name": name, "kind": kind, "sort": sort, "collapsed": collapsed, "categories": cats }));
        }
        Ok(Value::Array(out))
    }

    fn group_create(&mut self, p: &Value) -> R<Value> {
        let name = clean_text(&req_s(p, "name")?, 60, "Group name")?;
        if name.is_empty() {
            return Err("Group name is required".into());
        }
        let kind = gs(p, "kind").unwrap_or_else(|| "expense".into());
        if kind != "expense" && kind != "income" {
            return Err("group kind must be expense or income".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        let sort: i64 = tx.query_row("SELECT COALESCE(MAX(sort), -1) + 1 FROM category_groups", [], |r| r.get(0)).map_err(err)?;
        tx.execute("INSERT INTO category_groups (name, kind, sort) VALUES (?1, ?2, ?3)", params![name, kind, sort]).map_err(err)?;
        let id = tx.last_insert_rowid();
        audit(&tx, "create", "group", Some(id), json!({ "name": name, "kind": kind }))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn group_update(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        if let Some(name) = gs(p, "name") {
            let name = clean_text(&name, 60, "Group name")?;
            if name.is_empty() {
                return Err("Group name is required".into());
            }
            tx.execute("UPDATE category_groups SET name = ?1 WHERE id = ?2", params![name, id]).map_err(err)?;
            audit(&tx, "rename", "group", Some(id), json!({ "name": name }))?;
        }
        if let Some(c) = gb(p, "collapsed") {
            // View state only; not audited.
            tx.execute("UPDATE category_groups SET collapsed = ?1 WHERE id = ?2", params![c as i64, id]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn group_delete(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let n: i64 = tx.query_row("SELECT COUNT(*) FROM categories WHERE group_id = ?1", [id], |r| r.get(0)).map_err(err)?;
        if n > 0 {
            return Err("Move or delete the categories in this group first".into());
        }
        tx.execute("DELETE FROM category_groups WHERE id = ?1", [id]).map_err(err)?;
        audit(&tx, "delete", "group", Some(id), json!({}))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn group_reorder(&mut self, p: &Value) -> R<Value> {
        let order = ids(p, "ids");
        let tx = self.conn.transaction().map_err(err)?;
        for (i, id) in order.iter().enumerate() {
            tx.execute("UPDATE category_groups SET sort = ?1 WHERE id = ?2", params![i as i64, id]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(json!({}))
    }

    fn category_create(&mut self, p: &Value) -> R<Value> {
        let gid = req_i(p, "groupId")?;
        let name = clean_text(&req_s(p, "name")?, 60, "Category name")?;
        if name.is_empty() {
            return Err("Category name is required".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        let sort: i64 = tx
            .query_row("SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE group_id = ?1", [gid], |r| r.get(0))
            .map_err(err)?;
        tx.execute("INSERT INTO categories (group_id, name, sort) VALUES (?1, ?2, ?3)", params![gid, name, sort]).map_err(|e| {
            let s = e.to_string();
            if s.contains("UNIQUE") {
                format!("A category named '{name}' already exists in this group")
            } else if s.contains("FOREIGN KEY") {
                format!("group {gid} does not exist")
            } else {
                s
            }
        })?;
        let id = tx.last_insert_rowid();
        audit(&tx, "create", "category", Some(id), json!({ "name": name, "groupId": gid }))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn category_update(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let (kind, _) = Self::category_kind(&tx, id)?;
        let mut changed = serde_json::Map::new();
        if let Some(name) = gs(p, "name") {
            let name = clean_text(&name, 60, "Category name")?;
            if name.is_empty() {
                return Err("Category name is required".into());
            }
            tx.execute("UPDATE categories SET name = ?1 WHERE id = ?2", params![name, id]).map_err(|e| {
                if e.to_string().contains("UNIQUE") { format!("A category named '{name}' already exists in this group") } else { e.to_string() }
            })?;
            changed.insert("name".into(), json!(name));
        }
        if let Some(gid) = gi(p, "groupId") {
            let gkind: Option<String> = tx.query_row("SELECT kind FROM category_groups WHERE id = ?1", [gid], |r| r.get(0)).optional().map_err(err)?;
            let gkind = gkind.ok_or_else(|| format!("group {gid} does not exist"))?;
            if gkind != kind {
                return Err("A category can't move between income and expense groups".into());
            }
            let sort: i64 = tx
                .query_row("SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE group_id = ?1", [gid], |r| r.get(0))
                .map_err(err)?;
            tx.execute("UPDATE categories SET group_id = ?1, sort = ?2 WHERE id = ?3", params![gid, sort, id]).map_err(|e| {
                if e.to_string().contains("UNIQUE") { "That group already has a category with this name".to_string() } else { e.to_string() }
            })?;
            changed.insert("groupId".into(), json!(gid));
        }
        if let Some(a) = gb(p, "archived") {
            tx.execute("UPDATE categories SET archived = ?1 WHERE id = ?2", params![a as i64, id]).map_err(err)?;
            changed.insert("archived".into(), json!(a));
        }
        audit(&tx, "update", "category", Some(id), Value::Object(changed))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn category_delete(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        Self::category_kind(&tx, id)?;
        let used: i64 = tx
            .query_row(
                "SELECT (SELECT COUNT(*) FROM transactions WHERE category_id = ?1)
                      + (SELECT COUNT(*) FROM splits WHERE category_id = ?1)
                      + (SELECT COUNT(*) FROM allocations WHERE category_id = ?1 AND amount <> 0)",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if used > 0 {
            return Err("This category has transactions or budgeted amounts. Archive it to hide it instead.".into());
        }
        tx.execute("UPDATE recurring SET category_id = NULL WHERE category_id = ?1", [id]).map_err(err)?;
        tx.execute("DELETE FROM categories WHERE id = ?1", [id]).map_err(err)?;
        audit(&tx, "delete", "category", Some(id), json!({}))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn category_reorder(&mut self, p: &Value) -> R<Value> {
        let order = ids(p, "ids");
        let tx = self.conn.transaction().map_err(err)?;
        for (i, id) in order.iter().enumerate() {
            tx.execute("UPDATE categories SET sort = ?1 WHERE id = ?2", params![i as i64, id]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(json!({}))
    }

    fn audit_list(&self, p: &Value) -> R<Value> {
        let limit = gi(p, "limit").unwrap_or(200).clamp(1, 2000);
        let offset = gi(p, "offset").unwrap_or(0).max(0);
        let mut st = self
            .conn
            .prepare("SELECT id, ts, action, entity, entity_id, detail FROM audit_log ORDER BY id DESC LIMIT ?1 OFFSET ?2")
            .map_err(err)?;
        let rows = st
            .query_map(params![limit, offset], |r| {
                let detail: String = r.get(5)?;
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "ts": r.get::<_, i64>(1)?,
                    "action": r.get::<_, String>(2)?,
                    "entity": r.get::<_, String>(3)?,
                    "entityId": r.get::<_, Option<i64>>(4)?,
                    "detail": serde_json::from_str::<Value>(&detail).unwrap_or(Value::Null),
                }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Value::Array(rows))
    }

    /// SQLite integrity + the ledger's own invariants. Read-only: reports
    /// problems, never repairs them silently.
    fn integrity(&self) -> R<Value> {
        let quick: String = self.conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(err)?;
        let fk: i64 = self.conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).map_err(err)?;
        let mut issues: Vec<Value> = Vec::new();
        let mut st = self
            .conn
            .prepare(
                "SELECT t.id, t.amount, COALESCE((SELECT SUM(amount) FROM splits s WHERE s.txn_id = t.id), 0)
                   FROM transactions t WHERE t.is_split = 1
                  AND t.amount <> COALESCE((SELECT SUM(amount) FROM splits s WHERE s.txn_id = t.id), 0)",
            )
            .map_err(err)?;
        for row in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))).map_err(err)? {
            let (id, a, s) = row.map_err(err)?;
            issues.push(json!({ "kind": "split-mismatch", "transactionId": id, "amount": a, "splitTotal": s }));
        }
        let mut st = self
            .conn
            .prepare(
                "SELECT t.id FROM transactions t LEFT JOIN transactions p ON p.id = t.transfer_peer
                  WHERE t.is_transfer = 1 AND (p.id IS NULL OR p.transfer_peer <> t.id OR p.amount <> -t.amount)",
            )
            .map_err(err)?;
        for row in st.query_map([], |r| r.get::<_, i64>(0)).map_err(err)? {
            issues.push(json!({ "kind": "transfer-mismatch", "transactionId": row.map_err(err)? }));
        }
        Ok(json!({ "sqlite": quick, "foreignKeyViolations": fk, "issues": issues, "ok": quick == "ok" && fk == 0 && issues.is_empty() }))
    }
}

#[cfg(test)]
mod tests;
