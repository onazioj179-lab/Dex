// =============================================================================
// DEX Ledger — transactions, transfers, splits, attachments, recurring.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

use crate::*;
use base64::Engine as _;
use rusqlite::types::Value as Sql;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde_json::{json, Value};

pub(crate) const MAX_ATTACHMENT: usize = 15 * 1024 * 1024;

pub(crate) const TXN_SELECT: &str = "
SELECT t.id, t.account_id, a.name, t.date, t.payee, t.memo, t.amount, t.category_id, c.name, g.name,
       t.status, t.is_transfer, p.account_id, pa.name, t.is_split,
       (SELECT COUNT(*) FROM splits s WHERE s.txn_id = t.id),
       (SELECT COUNT(*) FROM attachments x WHERE x.txn_id = t.id),
       t.reconciliation_id, t.transfer_peer, g.kind
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN category_groups g ON g.id = c.group_id
  LEFT JOIN transactions p ON p.id = t.transfer_peer
  LEFT JOIN accounts pa ON pa.id = p.account_id";

pub(crate) fn txn_row(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, i64>(0)?,
        "accountId": r.get::<_, i64>(1)?,
        "accountName": r.get::<_, String>(2)?,
        "date": r.get::<_, String>(3)?,
        "payee": r.get::<_, String>(4)?,
        "memo": r.get::<_, String>(5)?,
        "amount": r.get::<_, i64>(6)?,
        "categoryId": r.get::<_, Option<i64>>(7)?,
        "categoryName": r.get::<_, Option<String>>(8)?,
        "groupName": r.get::<_, Option<String>>(9)?,
        "status": r.get::<_, String>(10)?,
        "isTransfer": r.get::<_, i64>(11)? == 1,
        "transferAccountId": r.get::<_, Option<i64>>(12)?,
        "transferAccountName": r.get::<_, Option<String>>(13)?,
        "isSplit": r.get::<_, i64>(14)? == 1,
        "splitCount": r.get::<_, i64>(15)?,
        "attachmentCount": r.get::<_, i64>(16)?,
        "reconciliationId": r.get::<_, Option<i64>>(17)?,
        "transferPeerId": r.get::<_, Option<i64>>(18)?,
        "categoryKind": r.get::<_, Option<String>>(19)?,
    }))
}

struct Existing {
    account_id: i64,
    amount: i64,
    status: String,
    is_transfer: bool,
    peer: Option<i64>,
    is_split: bool,
}

fn load(c: &Connection, id: i64) -> R<Existing> {
    c.query_row(
        "SELECT account_id, amount, status, is_transfer, transfer_peer, is_split FROM transactions WHERE id = ?1",
        [id],
        |r| {
            Ok(Existing {
                account_id: r.get(0)?,
                amount: r.get(1)?,
                status: r.get(2)?,
                is_transfer: r.get::<_, i64>(3)? == 1,
                peer: r.get(4)?,
                is_split: r.get::<_, i64>(5)? == 1,
            })
        },
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| format!("transaction {id} does not exist"))
}

/// A category usable on a new/edited transaction line.
fn check_category(c: &Connection, id: Option<i64>) -> R<()> {
    if let Some(id) = id {
        let (_, archived) = Ledger::category_kind(c, id)?;
        if archived {
            return Err("that category is archived".into());
        }
    }
    Ok(())
}

#[derive(Debug)]
pub(crate) struct SplitLine {
    category_id: Option<i64>,
    amount: i64,
    memo: String,
}

fn parse_splits(c: &Connection, v: &Value, total: i64) -> R<Option<Vec<SplitLine>>> {
    let Some(arr) = v.get("splits").and_then(|x| x.as_array()) else {
        return Ok(None);
    };
    if arr.is_empty() {
        return Ok(Some(Vec::new()));
    }
    if arr.len() < 2 {
        return Err("A split needs at least two lines".into());
    }
    let mut out = Vec::new();
    let mut sum: i64 = 0;
    for (i, s) in arr.iter().enumerate() {
        let amount =
            gi(s, "amount").ok_or_else(|| format!("split line {} has no amount", i + 1))?;
        if amount == 0 {
            return Err(format!("split line {} is zero", i + 1));
        }
        let cat = opt_id(s, "categoryId");
        check_category(c, cat)?;
        let memo = clean_text(&gs(s, "memo").unwrap_or_default(), 500, "Split memo")?;
        sum = sum.checked_add(amount).ok_or("split total overflow")?;
        out.push(SplitLine {
            category_id: cat,
            amount,
            memo,
        });
    }
    if sum != total {
        return Err(format!("Split lines add up to {sum} but the transaction is {total} (minor units). They must match exactly."));
    }
    Ok(Some(out))
}

fn write_splits(c: &Connection, txn: i64, lines: &[SplitLine]) -> R<()> {
    c.execute("DELETE FROM splits WHERE txn_id = ?1", [txn])
        .map_err(err)?;
    for l in lines {
        c.execute(
            "INSERT INTO splits (txn_id, category_id, amount, memo) VALUES (?1, ?2, ?3, ?4)",
            params![txn, l.category_id, l.amount, l.memo],
        )
        .map_err(err)?;
    }
    Ok(())
}

pub(crate) struct NewTxn {
    pub account_id: i64,
    pub date: String,
    pub payee: String,
    pub memo: String,
    pub amount: i64,
    pub category_id: Option<i64>,
    pub status: String,
    pub import_id: Option<String>,
}

/// Validated insert of a plain (non-transfer, non-split) transaction.
pub(crate) fn insert_plain(c: &Connection, t: &NewTxn) -> R<i64> {
    Ledger::account_active(c, t.account_id)?;
    if !dates::is_valid(&t.date) {
        return Err(format!("'{}' is not a valid date", t.date));
    }
    if t.amount == 0 {
        return Err("Amount can't be zero".into());
    }
    if t.status != "uncleared" && t.status != "cleared" {
        return Err("New transactions are uncleared or cleared".into());
    }
    check_category(c, t.category_id)?;
    let now = now_ms();
    c.execute(
        "INSERT INTO transactions (account_id, date, payee, memo, amount, category_id, status, import_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![t.account_id, t.date, t.payee, t.memo, t.amount, t.category_id, t.status, t.import_id, now],
    )
    .map_err(err)?;
    Ok(c.last_insert_rowid())
}

pub(crate) fn insert_transfer(
    c: &Connection,
    from: i64,
    to: i64,
    date: &str,
    amount: i64,
    memo: &str,
    status: &str,
) -> R<(i64, i64)> {
    if from == to {
        return Err("Choose two different accounts for a transfer".into());
    }
    if amount <= 0 {
        return Err("Transfer amount must be greater than zero".into());
    }
    Ledger::account_active(c, from)?;
    Ledger::account_active(c, to)?;
    if !dates::is_valid(date) {
        return Err(format!("'{date}' is not a valid date"));
    }
    let now = now_ms();
    c.execute(
        "INSERT INTO transactions (account_id, date, memo, amount, status, is_transfer, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
        params![from, date, memo, -amount, status, now],
    )
    .map_err(err)?;
    let a = c.last_insert_rowid();
    c.execute(
        "INSERT INTO transactions (account_id, date, memo, amount, status, is_transfer, transfer_peer, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'uncleared', 1, ?5, ?6, ?6)",
        params![to, date, memo, amount, a, now],
    )
    .map_err(err)?;
    let b = c.last_insert_rowid();
    c.execute(
        "UPDATE transactions SET transfer_peer = ?1 WHERE id = ?2",
        params![b, a],
    )
    .map_err(err)?;
    Ok((a, b))
}

impl Ledger {
    pub(crate) fn txns_list(&self, p: &Value) -> R<Value> {
        let (where_sql, binds) = txn_filters(p);
        let sort_col = match gs(p, "sort").as_deref() {
            Some("payee") => "lower(t.payee)",
            Some("amount") => "t.amount",
            Some("account") => "lower(a.name)",
            Some("category") => "lower(COALESCE(c.name, ''))",
            Some("status") => "t.status",
            _ => "t.date",
        };
        let dir = if gs(p, "dir").as_deref() == Some("asc") {
            "ASC"
        } else {
            "DESC"
        };
        let limit = gi(p, "limit").unwrap_or(500).clamp(1, 5000);
        let offset = gi(p, "offset").unwrap_or(0).max(0);
        let sql = format!("{TXN_SELECT} {where_sql} ORDER BY {sort_col} {dir}, t.id {dir} LIMIT {limit} OFFSET {offset}");
        let mut st = self.conn.prepare(&sql).map_err(err)?;
        let rows = st
            .query_map(params_from_iter(binds.iter()), txn_row)
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let agg_sql = format!(
            "SELECT COUNT(*), COALESCE(SUM(t.amount), 0) FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id {where_sql}"
        );
        let (total, sum): (i64, i64) = self
            .conn
            .query_row(&agg_sql, params_from_iter(binds.iter()), |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(err)?;
        Ok(json!({ "rows": rows, "total": total, "sum": sum }))
    }

    pub(crate) fn txn_get(&self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let mut row = self
            .conn
            .query_row(&format!("{TXN_SELECT} WHERE t.id = ?1"), [id], txn_row)
            .optional()
            .map_err(err)?
            .ok_or_else(|| format!("transaction {id} does not exist"))?;
        let mut st = self
            .conn
            .prepare("SELECT s.id, s.category_id, c.name, s.amount, s.memo FROM splits s LEFT JOIN categories c ON c.id = s.category_id WHERE s.txn_id = ?1 ORDER BY s.id")
            .map_err(err)?;
        let splits = st
            .query_map([id], |r| {
                Ok(json!({ "id": r.get::<_, i64>(0)?, "categoryId": r.get::<_, Option<i64>>(1)?, "categoryName": r.get::<_, Option<String>>(2)?, "amount": r.get::<_, i64>(3)?, "memo": r.get::<_, String>(4)? }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        row["splits"] = Value::Array(splits);
        row["attachments"] = self.attachments_list(&json!({ "txnId": id }))?;
        Ok(row)
    }

    pub(crate) fn txn_create(&mut self, p: &Value) -> R<Value> {
        let amount = req_i(p, "amount")?;
        let t = NewTxn {
            account_id: req_i(p, "accountId")?,
            date: req_s(p, "date")?,
            payee: clean_text(&gs(p, "payee").unwrap_or_default(), 200, "Payee")?,
            memo: clean_text(&gs(p, "memo").unwrap_or_default(), 2000, "Notes")?,
            amount,
            category_id: opt_id(p, "categoryId"),
            status: gs(p, "status").unwrap_or_else(|| "uncleared".into()),
            import_id: None,
        };
        let tx = self.conn.transaction().map_err(err)?;
        let splits = parse_splits(&tx, p, amount)?;
        let split_lines = splits.filter(|s| !s.is_empty());
        let t = NewTxn {
            category_id: if split_lines.is_some() {
                None
            } else {
                t.category_id
            },
            ..t
        };
        let id = insert_plain(&tx, &t)?;
        if let Some(lines) = &split_lines {
            tx.execute("UPDATE transactions SET is_split = 1 WHERE id = ?1", [id])
                .map_err(err)?;
            write_splits(&tx, id, lines)?;
        }
        audit(
            &tx,
            "create",
            "transaction",
            Some(id),
            json!({ "accountId": t.account_id, "date": t.date, "amount": t.amount, "payee": t.payee, "categoryId": t.category_id, "splitLines": split_lines.as_ref().map(|l| l.len()) }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    pub(crate) fn transfer_create(&mut self, p: &Value) -> R<Value> {
        let from = req_i(p, "fromAccountId")?;
        let to = req_i(p, "toAccountId")?;
        let amount = req_i(p, "amount")?;
        let date = req_s(p, "date")?;
        let memo = clean_text(&gs(p, "memo").unwrap_or_default(), 2000, "Notes")?;
        let status = gs(p, "status").unwrap_or_else(|| "uncleared".into());
        if status != "uncleared" && status != "cleared" {
            return Err("New transactions are uncleared or cleared".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        let (a, b) = insert_transfer(&tx, from, to, &date, amount, &memo, &status)?;
        audit(
            &tx,
            "create",
            "transfer",
            Some(a),
            json!({ "from": from, "to": to, "amount": amount, "date": date, "peer": b }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": a, "peerId": b }))
    }

    pub(crate) fn txn_update(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let confirm = gb(p, "confirmReconciled") == Some(true);
        let tx = self.conn.transaction().map_err(err)?;
        let ex = load(&tx, id)?;
        let money_fields = ["amount", "date", "accountId", "categoryId", "splits"]
            .iter()
            .any(|k| p.get(*k).is_some());
        if ex.status == "reconciled" && money_fields && !confirm {
            return Err("RECONCILED: this transaction is reconciled. Confirm to change it; the account will no longer match its last statement.".into());
        }
        let mut changed = serde_json::Map::new();
        let now = now_ms();

        if ex.is_transfer {
            let peer = ex.peer.ok_or("transfer is missing its other half")?;
            let pe = load(&tx, peer)?;
            if pe.status == "reconciled" && money_fields && !confirm {
                return Err("RECONCILED: the other side of this transfer is reconciled. Confirm to change it.".into());
            }
            if p.get("categoryId").is_some()
                || p.get("splits").is_some()
                || p.get("accountId").is_some()
            {
                return Err("Transfers have no category and can't move accounts; delete and re-create it instead".into());
            }
            if let Some(d) = gs(p, "date") {
                if !dates::is_valid(&d) {
                    return Err(format!("'{d}' is not a valid date"));
                }
                tx.execute(
                    "UPDATE transactions SET date = ?1, updated_at = ?2 WHERE id IN (?3, ?4)",
                    params![d, now, id, peer],
                )
                .map_err(err)?;
                changed.insert("date".into(), json!(d));
            }
            if let Some(a) = gi(p, "amount") {
                if a == 0 {
                    return Err("Amount can't be zero".into());
                }
                // Keep this side's direction; the other side is always the negation.
                tx.execute(
                    "UPDATE transactions SET amount = ?1, updated_at = ?2 WHERE id = ?3",
                    params![a, now, id],
                )
                .map_err(err)?;
                tx.execute(
                    "UPDATE transactions SET amount = ?1, updated_at = ?2 WHERE id = ?3",
                    params![-a, now, peer],
                )
                .map_err(err)?;
                changed.insert("amount".into(), json!({ "from": ex.amount, "to": a }));
            }
            if let Some(m) = gs(p, "memo") {
                let m = clean_text(&m, 2000, "Notes")?;
                tx.execute(
                    "UPDATE transactions SET memo = ?1, updated_at = ?2 WHERE id IN (?3, ?4)",
                    params![m, now, id, peer],
                )
                .map_err(err)?;
                changed.insert("memo".into(), json!(m));
            }
        } else {
            if let Some(acc) = gi(p, "accountId") {
                if acc != ex.account_id {
                    Ledger::account_active(&tx, acc)?;
                    tx.execute("UPDATE transactions SET account_id = ?1, reconciliation_id = NULL, status = CASE status WHEN 'reconciled' THEN 'cleared' ELSE status END WHERE id = ?2", params![acc, id]).map_err(err)?;
                    changed.insert("accountId".into(), json!(acc));
                }
            }
            if let Some(d) = gs(p, "date") {
                if !dates::is_valid(&d) {
                    return Err(format!("'{d}' is not a valid date"));
                }
                tx.execute(
                    "UPDATE transactions SET date = ?1 WHERE id = ?2",
                    params![d, id],
                )
                .map_err(err)?;
                changed.insert("date".into(), json!(d));
            }
            if let Some(py) = gs(p, "payee") {
                let py = clean_text(&py, 200, "Payee")?;
                tx.execute(
                    "UPDATE transactions SET payee = ?1 WHERE id = ?2",
                    params![py, id],
                )
                .map_err(err)?;
                changed.insert("payee".into(), json!(py));
            }
            if let Some(m) = gs(p, "memo") {
                let m = clean_text(&m, 2000, "Notes")?;
                tx.execute(
                    "UPDATE transactions SET memo = ?1 WHERE id = ?2",
                    params![m, id],
                )
                .map_err(err)?;
                changed.insert("memo".into(), json!(m));
            }
            let amount = gi(p, "amount").unwrap_or(ex.amount);
            if amount == 0 {
                return Err("Amount can't be zero".into());
            }
            if amount != ex.amount {
                tx.execute(
                    "UPDATE transactions SET amount = ?1 WHERE id = ?2",
                    params![amount, id],
                )
                .map_err(err)?;
                changed.insert("amount".into(), json!({ "from": ex.amount, "to": amount }));
            }
            match parse_splits(&tx, p, amount)? {
                Some(lines) if !lines.is_empty() => {
                    tx.execute(
                        "UPDATE transactions SET is_split = 1, category_id = NULL WHERE id = ?1",
                        [id],
                    )
                    .map_err(err)?;
                    write_splits(&tx, id, &lines)?;
                    changed.insert("splitLines".into(), json!(lines.len()));
                }
                Some(_) => {
                    // Explicit un-split: lines removed, single category (or none) applies.
                    tx.execute("DELETE FROM splits WHERE txn_id = ?1", [id])
                        .map_err(err)?;
                    let cat = opt_id(p, "categoryId");
                    check_category(&tx, cat)?;
                    tx.execute(
                        "UPDATE transactions SET is_split = 0, category_id = ?1 WHERE id = ?2",
                        params![cat, id],
                    )
                    .map_err(err)?;
                    changed.insert("splitLines".into(), json!(0));
                }
                None => {
                    if ex.is_split && amount != ex.amount {
                        return Err("This is a split transaction: update the split lines together with the new amount".into());
                    }
                    if p.get("categoryId").is_some() {
                        if ex.is_split {
                            return Err("Remove the split before choosing a single category".into());
                        }
                        let cat = opt_id(p, "categoryId");
                        check_category(&tx, cat)?;
                        tx.execute(
                            "UPDATE transactions SET category_id = ?1 WHERE id = ?2",
                            params![cat, id],
                        )
                        .map_err(err)?;
                        changed.insert("categoryId".into(), json!(cat));
                    }
                }
            }
            tx.execute(
                "UPDATE transactions SET updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(err)?;
        }
        if let Some(s) = gs(p, "status") {
            set_status_inner(&tx, &[id], &s, confirm)?;
            changed.insert("status".into(), json!(s));
        }
        audit(
            &tx,
            "update",
            "transaction",
            Some(id),
            Value::Object(changed),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    pub(crate) fn txn_delete(&mut self, p: &Value) -> R<Value> {
        let list = ids(p, "ids");
        if list.is_empty() {
            return Err("No transactions selected".into());
        }
        let confirm = gb(p, "confirmReconciled") == Some(true);
        let tx = self.conn.transaction().map_err(err)?;
        let mut deleted = 0;
        for id in &list {
            let Ok(ex) = load(&tx, *id) else { continue }; // already removed as a transfer peer
            let mut targets = vec![*id];
            if let Some(peer) = ex.peer {
                targets.push(peer);
            }
            for t in &targets {
                if let Ok(e) = load(&tx, *t) {
                    if e.status == "reconciled" && !confirm {
                        return Err("RECONCILED: one or more selected transactions are reconciled. Confirm to delete them.".into());
                    }
                }
            }
            let snapshot = tx
                .query_row(&format!("{TXN_SELECT} WHERE t.id = ?1"), [*id], txn_row)
                .map_err(err)?;
            tx.execute(
                "UPDATE transactions SET transfer_peer = NULL WHERE id IN (?1, ?2)",
                params![targets[0], targets.get(1).copied().unwrap_or(-1)],
            )
            .map_err(err)?;
            for t in &targets {
                deleted += tx
                    .execute("DELETE FROM transactions WHERE id = ?1", [*t])
                    .map_err(err)?;
            }
            audit(
                &tx,
                "delete",
                if ex.is_transfer {
                    "transfer"
                } else {
                    "transaction"
                },
                Some(*id),
                snapshot,
            )?;
        }
        tx.commit().map_err(err)?;
        Ok(json!({ "deleted": deleted }))
    }

    pub(crate) fn txn_set_status(&mut self, p: &Value) -> R<Value> {
        let list = ids(p, "ids");
        let status = req_s(p, "status")?;
        let confirm = gb(p, "confirmReconciled") == Some(true);
        let tx = self.conn.transaction().map_err(err)?;
        let n = set_status_inner(&tx, &list, &status, confirm)?;
        audit(
            &tx,
            "status",
            "transaction",
            None,
            json!({ "ids": list, "status": status }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "updated": n }))
    }

    /// Give many plain transactions one category, atomically: all or none.
    pub(crate) fn txn_categorize(&mut self, p: &Value) -> R<Value> {
        let list = ids(p, "ids");
        if list.is_empty() {
            return Err("No transactions selected".into());
        }
        let cat = opt_id(p, "categoryId");
        let confirm = gb(p, "confirmReconciled") == Some(true);
        let tx = self.conn.transaction().map_err(err)?;
        check_category(&tx, cat)?;
        let mut n = 0;
        for id in &list {
            let ex = load(&tx, *id)?;
            if ex.is_transfer || ex.is_split {
                return Err("Transfers and split transactions can't take a single category".into());
            }
            if ex.status == "reconciled" && !confirm {
                return Err("RECONCILED: one or more selected transactions are reconciled. Confirm to change them.".into());
            }
            n += tx
                .execute(
                    "UPDATE transactions SET category_id = ?1, updated_at = ?2 WHERE id = ?3",
                    params![cat, now_ms(), id],
                )
                .map_err(err)?;
        }
        audit(
            &tx,
            "categorize",
            "transaction",
            None,
            json!({ "ids": list, "categoryId": cat }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "updated": n }))
    }

    pub(crate) fn payees(&self) -> R<Value> {
        let mut st = self
            .conn
            .prepare(
                "SELECT payee, COUNT(*) n, MAX(date),
                        (SELECT t2.category_id FROM transactions t2 WHERE t2.payee = t.payee AND t2.category_id IS NOT NULL ORDER BY t2.date DESC, t2.id DESC LIMIT 1)
                   FROM transactions t WHERE payee <> '' AND is_transfer = 0 GROUP BY payee ORDER BY n DESC, MAX(date) DESC LIMIT 300",
            )
            .map_err(err)?;
        let rows = st
            .query_map([], |r| Ok(json!({ "payee": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)?, "lastDate": r.get::<_, String>(2)?, "lastCategoryId": r.get::<_, Option<i64>>(3)? })))
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Value::Array(rows))
    }

    // ----------------------------------------------------------- attachments

    /// Store a receipt inside the ledger (so backups carry it). Called by the
    /// shell after the user picks a file in a native dialog.
    pub fn attachment_add(
        &mut self,
        txn_id: i64,
        file_name: &str,
        mime: &str,
        data: &[u8],
    ) -> R<Value> {
        if data.len() > MAX_ATTACHMENT {
            return Err(format!(
                "Receipts are limited to {} MB",
                MAX_ATTACHMENT / 1024 / 1024
            ));
        }
        if data.is_empty() {
            return Err("That file is empty".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        load(&tx, txn_id)?;
        let name = clean_text(file_name, 200, "File name")?;
        tx.execute(
            "INSERT INTO attachments (txn_id, file_name, mime, size, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![txn_id, name, mime, data.len() as i64, data, now_ms()],
        )
        .map_err(err)?;
        let id = tx.last_insert_rowid();
        audit(
            &tx,
            "attach",
            "transaction",
            Some(txn_id),
            json!({ "attachmentId": id, "fileName": name, "size": data.len() }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    pub(crate) fn attachments_list(&self, p: &Value) -> R<Value> {
        let txn = req_i(p, "txnId")?;
        let mut st = self.conn.prepare("SELECT id, file_name, mime, size, created_at FROM attachments WHERE txn_id = ?1 ORDER BY id").map_err(err)?;
        let rows = st
            .query_map([txn], |r| {
                Ok(json!({ "id": r.get::<_, i64>(0)?, "fileName": r.get::<_, String>(1)?, "mime": r.get::<_, String>(2)?, "size": r.get::<_, i64>(3)?, "createdAt": r.get::<_, i64>(4)? }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Value::Array(rows))
    }

    /// Raw bytes for an attachment (the shell uses this to save a copy).
    pub fn attachment_bytes(&self, id: i64) -> R<(String, String, Vec<u8>)> {
        self.conn
            .query_row(
                "SELECT file_name, mime, data FROM attachments WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(err)?
            .ok_or_else(|| format!("attachment {id} does not exist"))
    }

    pub(crate) fn attachment_get(&self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let (name, mime, data) = self.attachment_bytes(id)?;
        Ok(
            json!({ "id": id, "fileName": name, "mime": mime, "base64": base64::engine::general_purpose::STANDARD.encode(data) }),
        )
    }

    pub(crate) fn attachment_delete(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let row: Option<(i64, String)> = tx
            .query_row(
                "SELECT txn_id, file_name FROM attachments WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?;
        let (txn, name) = row.ok_or_else(|| format!("attachment {id} does not exist"))?;
        tx.execute("DELETE FROM attachments WHERE id = ?1", [id])
            .map_err(err)?;
        audit(
            &tx,
            "detach",
            "transaction",
            Some(txn),
            json!({ "attachmentId": id, "fileName": name }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    // ------------------------------------------------------------- recurring

    pub(crate) fn recurring_list(&self) -> R<Value> {
        let mut st = self
            .conn
            .prepare(
                "SELECT r.id, r.account_id, a.name, r.transfer_account_id, ta.name, r.payee, r.memo, r.amount, r.category_id, c.name, r.frequency, r.next_date
                   FROM recurring r JOIN accounts a ON a.id = r.account_id
                   LEFT JOIN accounts ta ON ta.id = r.transfer_account_id
                   LEFT JOIN categories c ON c.id = r.category_id
                  ORDER BY r.next_date, r.id",
            )
            .map_err(err)?;
        let rows = st
            .query_map([], |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?, "accountId": r.get::<_, i64>(1)?, "accountName": r.get::<_, String>(2)?,
                    "transferAccountId": r.get::<_, Option<i64>>(3)?, "transferAccountName": r.get::<_, Option<String>>(4)?,
                    "payee": r.get::<_, String>(5)?, "memo": r.get::<_, String>(6)?, "amount": r.get::<_, i64>(7)?,
                    "categoryId": r.get::<_, Option<i64>>(8)?, "categoryName": r.get::<_, Option<String>>(9)?,
                    "frequency": r.get::<_, String>(10)?, "nextDate": r.get::<_, String>(11)?,
                }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Value::Array(rows))
    }

    fn recurring_validate(
        c: &Connection,
        p: &Value,
    ) -> R<(
        i64,
        Option<i64>,
        String,
        String,
        i64,
        Option<i64>,
        String,
        String,
    )> {
        let acc = req_i(p, "accountId")?;
        Ledger::account_active(c, acc)?;
        let to = opt_id(p, "transferAccountId");
        if let Some(t) = to {
            Ledger::account_active(c, t)?;
            if t == acc {
                return Err("Choose two different accounts for a transfer".into());
            }
        }
        let amount = req_i(p, "amount")?;
        if amount == 0 || (to.is_some() && amount < 0) {
            return Err("Enter a non-zero amount (transfers use a positive amount)".into());
        }
        let cat = if to.is_some() {
            None
        } else {
            opt_id(p, "categoryId")
        };
        check_category(c, cat)?;
        let freq = req_s(p, "frequency")?;
        if !["weekly", "biweekly", "monthly", "quarterly", "yearly"].contains(&freq.as_str()) {
            return Err(format!("unknown frequency '{freq}'"));
        }
        let next = req_s(p, "nextDate")?;
        if !dates::is_valid(&next) {
            return Err(format!("'{next}' is not a valid date"));
        }
        Ok((
            acc,
            to,
            clean_text(&gs(p, "payee").unwrap_or_default(), 200, "Payee")?,
            clean_text(&gs(p, "memo").unwrap_or_default(), 2000, "Notes")?,
            amount,
            cat,
            freq,
            next,
        ))
    }

    pub(crate) fn recurring_create(&mut self, p: &Value) -> R<Value> {
        let tx = self.conn.transaction().map_err(err)?;
        let (acc, to, payee, memo, amount, cat, freq, next) = Self::recurring_validate(&tx, p)?;
        tx.execute(
            "INSERT INTO recurring (account_id, transfer_account_id, payee, memo, amount, category_id, frequency, next_date, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![acc, to, payee, memo, amount, cat, freq, next, now_ms()],
        )
        .map_err(err)?;
        let id = tx.last_insert_rowid();
        audit(
            &tx,
            "create",
            "recurring",
            Some(id),
            json!({ "accountId": acc, "amount": amount, "frequency": freq, "nextDate": next }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    pub(crate) fn recurring_update(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let (acc, to, payee, memo, amount, cat, freq, next) = Self::recurring_validate(&tx, p)?;
        let n = tx
            .execute(
                "UPDATE recurring SET account_id=?1, transfer_account_id=?2, payee=?3, memo=?4, amount=?5, category_id=?6, frequency=?7, next_date=?8 WHERE id=?9",
                params![acc, to, payee, memo, amount, cat, freq, next, id],
            )
            .map_err(err)?;
        if n == 0 {
            return Err(format!("scheduled transaction {id} does not exist"));
        }
        audit(
            &tx,
            "update",
            "recurring",
            Some(id),
            json!({ "amount": amount, "frequency": freq, "nextDate": next }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    pub(crate) fn recurring_delete(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        tx.execute("DELETE FROM recurring WHERE id = ?1", [id])
            .map_err(err)?;
        audit(&tx, "delete", "recurring", Some(id), json!({}))?;
        tx.commit().map_err(err)?;
        Ok(json!({ "id": id }))
    }

    fn recurring_advance(c: &Connection, id: i64) -> R<(String, String)> {
        let (freq, next): (String, String) = c
            .query_row(
                "SELECT frequency, next_date FROM recurring WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?
            .ok_or_else(|| format!("scheduled transaction {id} does not exist"))?;
        let following = match freq.as_str() {
            "weekly" => dates::add_days(&next, 7),
            "biweekly" => dates::add_days(&next, 14),
            "monthly" => dates::add_months(&next, 1),
            "quarterly" => dates::add_months(&next, 3),
            _ => dates::add_months(&next, 12),
        }
        .ok_or("bad schedule date")?;
        c.execute(
            "UPDATE recurring SET next_date = ?1 WHERE id = ?2",
            params![following, id],
        )
        .map_err(err)?;
        Ok((next, following))
    }

    /// Enter the next occurrence now (explicit user action — DEX never posts
    /// scheduled transactions on its own) and advance the schedule.
    pub(crate) fn recurring_post(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let (acc, to, payee, memo, amount, cat): (i64, Option<i64>, String, String, i64, Option<i64>) = tx
            .query_row("SELECT account_id, transfer_account_id, payee, memo, amount, category_id FROM recurring WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
            })
            .optional()
            .map_err(err)?
            .ok_or_else(|| format!("scheduled transaction {id} does not exist"))?;
        let (date, following) = Self::recurring_advance(&tx, id)?;
        let date = gs(p, "date").filter(|d| dates::is_valid(d)).unwrap_or(date);
        let txn = match to {
            Some(t) => insert_transfer(&tx, acc, t, &date, amount, &memo, "uncleared")?.0,
            None => insert_plain(
                &tx,
                &NewTxn {
                    account_id: acc,
                    date: date.clone(),
                    payee,
                    memo,
                    amount,
                    category_id: cat,
                    status: "uncleared".into(),
                    import_id: None,
                },
            )?,
        };
        audit(
            &tx,
            "post",
            "recurring",
            Some(id),
            json!({ "transactionId": txn, "date": date, "nextDate": following }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "transactionId": txn, "nextDate": following }))
    }

    pub(crate) fn recurring_skip(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let (skipped, following) = Self::recurring_advance(&tx, id)?;
        audit(
            &tx,
            "skip",
            "recurring",
            Some(id),
            json!({ "skipped": skipped, "nextDate": following }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "nextDate": following }))
    }
}

pub(crate) fn set_status_inner(
    c: &Connection,
    list: &[i64],
    status: &str,
    confirm: bool,
) -> R<usize> {
    if status != "uncleared" && status != "cleared" {
        return Err("Status can be set to uncleared or cleared; reconciled is set by finishing a reconciliation".into());
    }
    let mut n = 0;
    for id in list {
        let ex = load(c, *id)?;
        if ex.status == "reconciled" && !confirm {
            return Err("RECONCILED: un-reconciling a transaction needs confirmation".into());
        }
        n += c
            .execute(
                "UPDATE transactions SET status = ?1, reconciliation_id = CASE WHEN ?1 = 'reconciled' THEN reconciliation_id ELSE NULL END, updated_at = ?2 WHERE id = ?3",
                params![status, now_ms(), id],
            )
            .map_err(err)?;
        let _ = ex.account_id;
        let _ = ex.is_split;
    }
    Ok(n)
}

/// WHERE clause + binds for the transaction list / export filters.
pub(crate) fn txn_filters(p: &Value) -> (String, Vec<Sql>) {
    let mut w: Vec<String> = Vec::new();
    let mut b: Vec<Sql> = Vec::new();
    if let Some(a) = gi(p, "accountId") {
        w.push("t.account_id = ?".into());
        b.push(Sql::Integer(a));
    }
    if let Some(c) = gi(p, "categoryId") {
        if c < 0 {
            w.push("t.is_transfer = 0 AND ((t.is_split = 0 AND t.category_id IS NULL) OR EXISTS (SELECT 1 FROM splits s WHERE s.txn_id = t.id AND s.category_id IS NULL))".into());
        } else {
            w.push("(t.category_id = ? OR EXISTS (SELECT 1 FROM splits s WHERE s.txn_id = t.id AND s.category_id = ?))".into());
            b.push(Sql::Integer(c));
            b.push(Sql::Integer(c));
        }
    }
    if let Some(f) = gs(p, "from").filter(|d| dates::is_valid(d)) {
        w.push("t.date >= ?".into());
        b.push(Sql::Text(f));
    }
    if let Some(t) = gs(p, "to").filter(|d| dates::is_valid(d)) {
        w.push("t.date <= ?".into());
        b.push(Sql::Text(t));
    }
    if let Some(s) =
        gs(p, "status").filter(|s| ["uncleared", "cleared", "reconciled"].contains(&s.as_str()))
    {
        w.push("t.status = ?".into());
        b.push(Sql::Text(s));
    }
    match gs(p, "kind").as_deref() {
        Some("income") => w.push("t.is_transfer = 0 AND t.amount > 0".into()),
        Some("expense") => w.push("t.is_transfer = 0 AND t.amount < 0".into()),
        Some("transfer") => w.push("t.is_transfer = 1".into()),
        _ => {}
    }
    if let Some(q) = gs(p, "search")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        let like = format!(
            "%{}%",
            q.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        let mut clause = "(t.payee LIKE ? ESCAPE '\\' OR t.memo LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR COALESCE(c.name,'') LIKE ? ESCAPE '\\'".to_string();
        for _ in 0..4 {
            b.push(Sql::Text(like.clone()));
        }
        if let Some(minor) = gi(p, "searchAmount") {
            clause.push_str(" OR abs(t.amount) = ?");
            b.push(Sql::Integer(minor.abs()));
        }
        clause.push(')');
        w.push(clause);
    }
    if gb(p, "hasAttachment") == Some(true) {
        w.push("EXISTS (SELECT 1 FROM attachments x WHERE x.txn_id = t.id)".into());
    }
    let sql = if w.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", w.join(" AND "))
    };
    (sql, b)
}
