// =============================================================================
// DEX Ledger — one-time import of the earlier document-style ledger.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! An earlier DEX build kept the ledger as one JSON-shaped document (accounts,
//! categories with a group name, transactions with split lines, transfer legs
//! linked by `transferId`, monthly budgets). This maps it into the relational
//! ledger in ONE transaction, only into an empty ledger, and only when the
//! user asks. Nothing in the source is modified.
//!
//! Mapping:
//! - account type checking/savings/cash/credit kept; investment/loan → other
//!   (the original type is kept in the account notes); closed → archived.
//! - categories grouped by (group name, kind); a blank group becomes
//!   "Imported" / "Income".
//! - one split line → a plain transaction; several → a split transaction; a
//!   pair of legs sharing a transferId → a linked transfer.
//! - status 0/1/2 → uncleared/cleared/reconciled.
//! - budgets → assignments for expense categories.
//! Rows that can't be represented (zero amounts, a transfer with a missing
//! leg, unknown accounts) are skipped and counted, never invented.

use crate::*;
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;

fn s(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}
fn int(v: &Value, k: &str) -> Option<i64> {
    v.get(k).and_then(|x| x.as_i64())
}
fn list<'a>(v: &'a Value, k: &str) -> Vec<&'a Value> {
    v.get(k)
        .and_then(|x| x.as_array())
        .map(|a| a.iter().collect())
        .unwrap_or_default()
}

impl Ledger {
    pub fn import_legacy(&mut self, doc: &Value) -> R<Value> {
        let has_data: i64 = self
            .conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM accounts) + (SELECT COUNT(*) FROM transactions)",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if has_data > 0 {
            return Err(
                "This ledger already has accounts or transactions. Import only into a new ledger."
                    .into(),
            );
        }
        let currency = s(doc, "currency").trim().to_uppercase();
        let currency = if money::is_valid_code(&currency) {
            currency
        } else {
            "USD".into()
        };
        let now = now_ms();
        let tx = self.conn.transaction().map_err(err)?;
        match setting(&tx, "currency") {
            Some(c) if c != currency => {
                // Set up already (empty) with another currency: only safe when exponents match.
                if money::minor_digits(&c) != money::minor_digits(&currency) {
                    return Err(format!("The earlier ledger uses {currency}; this one is set to {c}. Start a new ledger to import it."));
                }
                set_setting(&tx, "currency", &currency)?;
            }
            Some(_) => {}
            None => set_setting(&tx, "currency", &currency)?,
        }
        // Drop the empty default categories the setup screen may have created.
        tx.execute("DELETE FROM allocations", []).map_err(err)?;
        tx.execute("DELETE FROM categories", []).map_err(err)?;
        tx.execute("DELETE FROM category_groups", []).map_err(err)?;

        let mut skipped: Vec<String> = Vec::new();
        let mut acc_ids: HashMap<String, i64> = HashMap::new();
        for (i, a) in list(doc, "accounts").into_iter().enumerate() {
            let kind_in = s(a, "type");
            let (kind, note) = match kind_in.as_str() {
                "checking" | "savings" | "cash" | "credit" => (kind_in.clone(), String::new()),
                other => ("other".to_string(), format!("Imported as type: {other}")),
            };
            let date = Some(s(a, "openingDate"))
                .filter(|d| dates::is_valid(d))
                .unwrap_or_else(dates::today_utc);
            let name = s(a, "name");
            tx.execute(
                "INSERT INTO accounts (name, kind, opening_balance, opening_date, archived, notes, sort, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![if name.trim().is_empty() { "Account".to_string() } else { name }, kind, int(a, "openingMinor").unwrap_or(0), date,
                    a.get("closed").and_then(|x| x.as_bool()).unwrap_or(false) as i64, note, i as i64, now],
            )
            .map_err(err)?;
            acc_ids.insert(s(a, "id"), tx.last_insert_rowid());
        }

        let mut group_ids: HashMap<(String, String), i64> = HashMap::new();
        let mut cat_ids: HashMap<String, (i64, String)> = HashMap::new();
        for (i, c) in list(doc, "categories").into_iter().enumerate() {
            let kind = if s(c, "kind") == "income" {
                "income"
            } else {
                "expense"
            }
            .to_string();
            let gname = Some(s(c, "group"))
                .filter(|g| !g.trim().is_empty())
                .unwrap_or_else(|| {
                    if kind == "income" {
                        "Income".into()
                    } else {
                        "Imported".into()
                    }
                });
            let key = (gname.clone(), kind.clone());
            let gid = match group_ids.get(&key) {
                Some(g) => *g,
                None => {
                    tx.execute(
                        "INSERT INTO category_groups (name, kind, sort) VALUES (?1, ?2, ?3)",
                        params![gname, kind, group_ids.len() as i64],
                    )
                    .map_err(err)?;
                    let g = tx.last_insert_rowid();
                    group_ids.insert(key, g);
                    g
                }
            };
            let base = Some(s(c, "name"))
                .filter(|n| !n.trim().is_empty())
                .unwrap_or_else(|| "Category".into());
            // Names are unique within a group; suffix a number on a clash.
            let mut name = base.clone();
            let mut n = 2;
            while tx
                .query_row(
                    "SELECT 1 FROM categories WHERE group_id = ?1 AND name = ?2",
                    params![gid, name],
                    |_| Ok(()),
                )
                .is_ok()
            {
                name = format!("{base} ({n})");
                n += 1;
            }
            tx.execute(
                "INSERT INTO categories (group_id, name, archived, sort) VALUES (?1, ?2, ?3, ?4)",
                params![
                    gid,
                    name,
                    c.get("archived").and_then(|x| x.as_bool()).unwrap_or(false) as i64,
                    i as i64
                ],
            )
            .map_err(err)?;
            cat_ids.insert(s(c, "id"), (tx.last_insert_rowid(), kind));
        }
        if group_ids.values().count() == 0 || !group_ids.keys().any(|(_, k)| k == "income") {
            tx.execute(
                "INSERT INTO category_groups (name, kind, sort) VALUES ('Income', 'income', 99)",
                [],
            )
            .map_err(err)?;
            let gid = tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO categories (group_id, name) VALUES (?1, 'Income')",
                [gid],
            )
            .map_err(err)?;
        }

        let status = |t: &Value| match int(t, "status").unwrap_or(0) {
            2 => "reconciled",
            1 => "cleared",
            _ => "uncleared",
        };
        let lines = |t: &Value| -> Vec<(Option<i64>, i64, String)> {
            list(t, "splits")
                .into_iter()
                .map(|l| {
                    (
                        l.get("categoryId")
                            .and_then(|x| x.as_str())
                            .and_then(|c| cat_ids.get(c))
                            .map(|c| c.0),
                        int(l, "amountMinor").unwrap_or(0),
                        s(l, "memo"),
                    )
                })
                .collect()
        };

        let mut imported = 0usize;
        let mut transfers: HashMap<String, Vec<&Value>> = HashMap::new();
        for t in list(doc, "transactions") {
            if let Some(tid) = t
                .get("transferId")
                .and_then(|x| x.as_str())
                .filter(|x| !x.is_empty())
            {
                transfers.entry(tid.to_string()).or_default().push(t);
                continue;
            }
            let Some(&acc) = acc_ids.get(&s(t, "accountId")) else {
                skipped.push(format!("{}: unknown account", s(t, "id")));
                continue;
            };
            let date = s(t, "date");
            if !dates::is_valid(&date) {
                skipped.push(format!("{}: bad date", s(t, "id")));
                continue;
            }
            let ls = lines(t);
            let total: i64 = ls.iter().map(|l| l.1).sum();
            if total == 0 || ls.iter().any(|l| l.1 == 0) && ls.len() > 1 {
                skipped.push(format!("{}: zero amount", s(t, "id")));
                continue;
            }
            let split = ls.len() > 1;
            let created = int(t, "createdAt").filter(|c| *c > 0).unwrap_or(now);
            tx.execute(
                "INSERT INTO transactions (account_id, date, payee, memo, amount, category_id, status, is_split, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                params![acc, date, s(t, "payee"), s(t, "memo"), total, if split { None } else { ls.first().and_then(|l| l.0) }, status(t), split as i64, created],
            )
            .map_err(err)?;
            let id = tx.last_insert_rowid();
            if split {
                for (cat, amount, memo) in &ls {
                    tx.execute("INSERT INTO splits (txn_id, category_id, amount, memo) VALUES (?1,?2,?3,?4)", params![id, cat, amount, memo]).map_err(err)?;
                }
            }
            imported += 1;
        }
        for (tid, legs) in transfers {
            let ok = legs.len() == 2
                && legs.iter().all(|l| {
                    acc_ids.contains_key(&s(l, "accountId")) && dates::is_valid(&s(l, "date"))
                });
            let amounts: Vec<i64> = legs
                .iter()
                .map(|l| lines(l).iter().map(|x| x.1).sum())
                .collect();
            if !ok || amounts.len() != 2 || amounts[0] == 0 || amounts[0] != -amounts[1] {
                skipped.push(format!("transfer {tid}: legs don't match"));
                continue;
            }
            let mut ids = Vec::new();
            for (leg, amount) in legs.iter().zip(amounts.iter()) {
                tx.execute(
                    "INSERT INTO transactions (account_id, date, payee, memo, amount, status, is_transfer, created_at, updated_at) VALUES (?1,?2,'',?3,?4,?5,1,?6,?6)",
                    params![acc_ids[&s(leg, "accountId")], s(leg, "date"), s(leg, "memo"), amount, status(leg), now],
                )
                .map_err(err)?;
                ids.push(tx.last_insert_rowid());
            }
            tx.execute(
                "UPDATE transactions SET transfer_peer = ?1 WHERE id = ?2",
                params![ids[1], ids[0]],
            )
            .map_err(err)?;
            tx.execute(
                "UPDATE transactions SET transfer_peer = ?1 WHERE id = ?2",
                params![ids[0], ids[1]],
            )
            .map_err(err)?;
            imported += 2;
        }

        let mut budgets = 0usize;
        for b in list(doc, "budgets") {
            let month = s(b, "month");
            let Some((cat, kind)) = b
                .get("categoryId")
                .and_then(|x| x.as_str())
                .and_then(|c| cat_ids.get(c))
            else {
                continue;
            };
            let amount = int(b, "amountMinor").unwrap_or(0);
            if kind != "expense" || amount == 0 || !dates::is_valid_month(&month) {
                continue;
            }
            tx.execute(
                "INSERT INTO allocations (category_id, month, amount) VALUES (?1,?2,?3) ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount",
                params![cat, month, amount],
            )
            .map_err(err)?;
            budgets += 1;
        }
        let summary = json!({
            "accounts": acc_ids.len(), "categories": cat_ids.len(), "transactions": imported,
            "budgets": budgets, "skipped": skipped.len(), "skippedDetail": skipped.iter().take(20).collect::<Vec<_>>(), "currency": currency,
        });
        audit(&tx, "import-legacy", "ledger", None, summary.clone())?;
        tx.commit().map_err(err)?;
        Ok(summary)
    }
}
