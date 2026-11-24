// =============================================================================
// DEX Ledger — CSV import/export, statement reconciliation, backup/restore.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

use crate::txns::{insert_plain, set_status_inner, txn_filters, txn_row, NewTxn, TXN_SELECT};
use crate::*;
use rusqlite::{params, params_from_iter, Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;

const MAX_IMPORT_ROWS: usize = 50_000;
const AUTO_BACKUPS_KEPT: usize = 10;

// ------------------------------------------------------------------ parsing

#[derive(Clone, Copy, Default)]
struct Mapping {
    date: Option<usize>,
    payee: Option<usize>,
    amount: Option<usize>,
    debit: Option<usize>,
    credit: Option<usize>,
    memo: Option<usize>,
    category: Option<usize>,
}

impl Mapping {
    fn to_json(self) -> Value {
        json!({ "date": self.date, "payee": self.payee, "amount": self.amount, "debit": self.debit, "credit": self.credit, "memo": self.memo, "category": self.category })
    }
    fn from_json(v: &Value) -> Mapping {
        let f = |k: &str| v.get(k).and_then(|x| x.as_u64()).map(|x| x as usize);
        Mapping {
            date: f("date"),
            payee: f("payee"),
            amount: f("amount"),
            debit: f("debit"),
            credit: f("credit"),
            memo: f("memo"),
            category: f("category"),
        }
    }
}

fn detect_mapping(headers: &[String]) -> Mapping {
    let lower: Vec<String> = headers.iter().map(|h| h.trim().to_lowercase()).collect();
    let mut used: HashSet<usize> = HashSet::new();
    let mut pick = |keys: &[&str], avoid: &[&str]| -> Option<usize> {
        for (i, h) in lower.iter().enumerate() {
            if used.contains(&i) || avoid.iter().any(|a| h.contains(a)) {
                continue;
            }
            if keys.iter().any(|k| h.contains(k)) {
                used.insert(i);
                return Some(i);
            }
        }
        None
    };
    let date = pick(&["date", "datum", "fecha", "posted", "booking"], &[]);
    let debit = pick(
        &[
            "debit",
            "withdrawal",
            "paid out",
            "money out",
            "outflow",
            "spent",
        ],
        &[],
    );
    let credit = pick(
        &[
            "credit", "deposit", "paid in", "money in", "inflow", "received",
        ],
        &[],
    );
    let amount = pick(
        &["amount", "betrag", "importe", "value", "sum"],
        &["balance"],
    );
    let category = pick(&["category"], &[]);
    let payee = pick(
        &[
            "payee",
            "description",
            "merchant",
            "name",
            "details",
            "narrative",
            "beschreibung",
            "counterparty",
            "transaction",
        ],
        &[],
    );
    let memo = pick(&["memo", "note", "reference", "ref"], &[]);
    Mapping {
        date,
        payee,
        amount,
        debit,
        credit,
        memo,
        category,
    }
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

fn month_name(s: &str) -> Option<u32> {
    let l = s.to_lowercase();
    MONTHS
        .iter()
        .position(|m| l.starts_with(m))
        .map(|i| i as u32 + 1)
}

fn date_parts(s: &str) -> Option<Vec<String>> {
    let t = s.trim().trim_matches('"');
    let t = t.split('T').next().unwrap_or(t);
    let parts: Vec<String> = t
        .split(|c: char| c == '/' || c == '.' || c == '-' || c == ' ' || c == ',')
        .filter(|p| !p.is_empty())
        .map(|p| p.to_string())
        .collect();
    if parts.len() < 3 {
        return None;
    }
    // Drop a trailing time (e.g. "02/01/2026 14:05").
    Some(
        parts
            .into_iter()
            .filter(|p| !p.contains(':'))
            .take(3)
            .collect(),
    )
}

/// Convert one bank date into `YYYY-MM-DD` using the given field order.
fn parse_date_fmt(s: &str, fmt: &str) -> Option<String> {
    let p = date_parts(s)?;
    if p.len() != 3 {
        return None;
    }
    let num = |x: &str| x.parse::<i64>().ok();
    let year = |x: &str| num(x).map(|y| if x.len() <= 2 { 2000 + y } else { y });
    let (y, m, d) = if p[0].len() == 4 && num(&p[0]).is_some() {
        (
            year(&p[0])?,
            month_name(&p[1]).or_else(|| num(&p[1]).map(|x| x as u32))?,
            num(&p[2])? as u32,
        )
    } else if let Some(mn) = month_name(&p[1]) {
        (year(&p[2])?, mn, num(&p[0])? as u32) // 02 Jan 2026
    } else if let Some(mn) = month_name(&p[0]) {
        (year(&p[2])?, mn, num(&p[1])? as u32) // Jan 02 2026
    } else {
        let (a, b, c) = (num(&p[0])?, num(&p[1])?, &p[2]);
        match fmt {
            "mdy" => (year(c)?, a as u32, b as u32),
            _ => (year(c)?, b as u32, a as u32),
        }
    };
    let out = dates::fmt(y, m, d);
    if dates::is_valid(&out) {
        Some(out)
    } else {
        None
    }
}

/// Decide between day-first and month-first from the data itself.
fn detect_date_order(samples: &[String], fallback: &str) -> (String, bool) {
    let mut day_first = false;
    let mut month_first = false;
    let mut numeric = false;
    for s in samples {
        let Some(p) = date_parts(s) else { continue };
        if p.len() != 3
            || p[0].len() == 4
            || month_name(&p[0]).is_some()
            || month_name(&p[1]).is_some()
        {
            continue;
        }
        let (Ok(a), Ok(b)) = (p[0].parse::<i64>(), p[1].parse::<i64>()) else {
            continue;
        };
        numeric = true;
        if a > 12 {
            day_first = true;
        }
        if b > 12 {
            month_first = true;
        }
    }
    match (day_first, month_first) {
        (true, false) => ("dmy".into(), false),
        (false, true) => ("mdy".into(), false),
        _ => (
            if fallback == "mdy" {
                "mdy".into()
            } else {
                "dmy".into()
            },
            numeric,
        ),
    }
}

struct Line {
    line: usize,
    date: Option<String>,
    payee: String,
    memo: String,
    amount: Option<i64>,
    category: String,
    error: Option<String>,
}

struct Parsed {
    headers: Vec<String>,
    mapping: Mapping,
    date_format: String,
    date_ambiguous: bool,
    lines: Vec<Line>,
}

fn parse_statement(p: &Value, digits: u32) -> R<Parsed> {
    let content = req_s(p, "content")?;
    let rows = csv::parse(&content);
    if rows.is_empty() {
        return Err("The file has no rows".into());
    }
    if rows.len() > MAX_IMPORT_ROWS + 1 {
        return Err(format!(
            "The file has more than {MAX_IMPORT_ROWS} rows; split it into smaller files"
        ));
    }
    let first_is_date = rows[0]
        .first()
        .map(|c| parse_date_fmt(c, "dmy").is_some() || parse_date_fmt(c, "mdy").is_some())
        .unwrap_or(false);
    let has_header = gb(p, "hasHeader").unwrap_or(!first_is_date);
    let headers: Vec<String> = if has_header {
        rows[0].clone()
    } else {
        (1..=rows[0].len()).map(|i| format!("Column {i}")).collect()
    };
    let body = if has_header { &rows[1..] } else { &rows[..] };
    let mut mapping = match p.get("mapping").filter(|m| m.is_object()) {
        Some(m) => Mapping::from_json(m),
        None if has_header => detect_mapping(&headers),
        None => Mapping::default(),
    };
    if !has_header && p.get("mapping").map(|m| !m.is_object()).unwrap_or(true) {
        // Headerless: date in column 1, first amount-looking column, first text column.
        mapping.date = Some(0);
        if let Some(r) = body.first() {
            mapping.amount =
                (1..r.len()).find(|&i| money::parse_amount(&r[i], '.', digits).is_ok());
            mapping.payee = (1..r.len()).find(|&i| {
                Some(i) != mapping.amount && money::parse_amount(&r[i], '.', digits).is_err()
            });
        }
    }
    let decimal = gs(p, "decimal")
        .and_then(|d| d.chars().next())
        .filter(|c| *c == '.' || *c == ',')
        .unwrap_or('.');
    let invert = gb(p, "invert").unwrap_or(false);
    let requested = gs(p, "dateFormat").unwrap_or_else(|| "auto".into());
    let samples: Vec<String> = mapping
        .date
        .map(|di| {
            body.iter()
                .filter_map(|r| r.get(di).cloned())
                .take(500)
                .collect()
        })
        .unwrap_or_default();
    let (date_format, date_ambiguous) = if requested == "mdy" || requested == "dmy" {
        (requested, false)
    } else {
        detect_date_order(
            &samples,
            &gs(p, "dateOrder").unwrap_or_else(|| "dmy".into()),
        )
    };
    let cell = |r: &Vec<String>, i: Option<usize>| {
        i.and_then(|i| r.get(i))
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    };
    let mut lines = Vec::new();
    for (i, r) in body.iter().enumerate() {
        let line = i + 1 + has_header as usize;
        if r.iter().all(|c| c.trim().is_empty()) {
            continue;
        }
        let mut error = None;
        let date_raw = cell(r, mapping.date);
        let date = parse_date_fmt(&date_raw, &date_format);
        if date.is_none() {
            error = Some(format!("can't read the date \"{date_raw}\""));
        }
        let amount = if mapping.amount.is_some() {
            money::parse_amount(&cell(r, mapping.amount), decimal, digits)
        } else if mapping.debit.is_some() || mapping.credit.is_some() {
            let read = |idx: Option<usize>| -> Result<i64, String> {
                let v = cell(r, idx);
                if v.is_empty() {
                    Ok(0)
                } else {
                    money::parse_amount(&v, decimal, digits).map(|x| x.abs())
                }
            };
            match (read(mapping.credit), read(mapping.debit)) {
                (Ok(c), Ok(d)) => Ok(c - d),
                (Err(e), _) | (_, Err(e)) => Err(e),
            }
        } else {
            Err("choose which column holds the amount".into())
        };
        let amount = match amount {
            Ok(0) => {
                error.get_or_insert_with(|| "amount is zero".into());
                None
            }
            Ok(a) => Some(if invert { -a } else { a }),
            Err(e) => {
                error.get_or_insert(e);
                None
            }
        };
        lines.push(Line {
            line,
            date,
            payee: cell(r, mapping.payee),
            memo: cell(r, mapping.memo),
            amount,
            category: cell(r, mapping.category),
            error,
        });
    }
    Ok(Parsed {
        headers,
        mapping,
        date_format,
        date_ambiguous,
        lines,
    })
}

fn norm_payee(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Stable id for an imported row: account + date + amount + payee + the
/// occurrence number of that same combination within the file, so two genuine
/// identical coffees on one day both import, but re-importing the file doesn't.
fn import_id(account: i64, date: &str, amount: i64, payee: &str, occurrence: usize) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in format!(
        "{account}|{date}|{amount}|{}|{occurrence}",
        norm_payee(payee)
    )
    .bytes()
    {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("csv:{h:016x}")
}

/// A row is a duplicate when its import id is already stored, or when the
/// ledger already held (before this import began, i.e. id <= `before_id`) at
/// least `occurrence` transactions with the same date, amount and payee.
fn is_duplicate(
    c: &Connection,
    account: i64,
    date: &str,
    amount: i64,
    payee: &str,
    iid: &str,
    occurrence: usize,
    before_id: i64,
) -> R<bool> {
    let by_id: i64 = c
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?1 AND import_id = ?2",
            params![account, iid],
            |r| r.get(0),
        )
        .map_err(err)?;
    if by_id > 0 {
        return Ok(true);
    }
    let same: i64 = c
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?1 AND id <= ?2 AND date = ?3 AND amount = ?4 AND lower(trim(payee)) = ?5",
            params![account, before_id, date, amount, norm_payee(payee)],
            |r| r.get(0),
        )
        .map_err(err)?;
    Ok(same >= occurrence as i64)
}

fn category_lookup(c: &Connection) -> R<HashMap<String, i64>> {
    let mut st = c
        .prepare("SELECT id, name FROM categories WHERE archived = 0")
        .map_err(err)?;
    let mut m = HashMap::new();
    for row in st
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?
    {
        let (id, name) = row.map_err(err)?;
        m.entry(name.to_lowercase()).or_insert(id);
    }
    Ok(m)
}

fn utc_stamp() -> String {
    let ms = now_ms();
    let secs = ms.div_euclid(1000);
    let (y, mo, d) = dates::civil_from_days(secs.div_euclid(86400));
    let sod = secs.rem_euclid(86400);
    format!(
        "{y:04}{mo:02}{d:02}-{:02}{:02}{:02}-{:03}",
        sod / 3600,
        (sod / 60) % 60,
        sod % 60,
        ms.rem_euclid(1000)
    )
}

impl Ledger {
    // ----------------------------------------------------------- CSV import

    pub(crate) fn csv_preview(&self, p: &Value) -> R<Value> {
        let account = req_i(p, "accountId")?;
        Ledger::account_active(&self.conn, account)?;
        let parsed = parse_statement(p, digits(&self.conn))?;
        let cats = category_lookup(&self.conn)?;
        let mut seen: HashMap<String, usize> = HashMap::new();
        let mut rows = Vec::new();
        let (mut dups, mut errors) = (0, 0);
        for l in &parsed.lines {
            let (dup, cat_id) = match (&l.date, l.amount) {
                (Some(d), Some(a)) => {
                    let key = format!("{d}|{a}|{}", norm_payee(&l.payee));
                    let occ = seen.entry(key).or_insert(0);
                    *occ += 1;
                    let iid = import_id(account, d, a, &l.payee, *occ);
                    (
                        is_duplicate(&self.conn, account, d, a, &l.payee, &iid, *occ, i64::MAX)?,
                        cats.get(&l.category.to_lowercase()).copied(),
                    )
                }
                _ => (false, None),
            };
            if dup {
                dups += 1;
            }
            if l.error.is_some() {
                errors += 1;
            }
            rows.push(json!({
                "line": l.line, "date": l.date, "payee": l.payee, "memo": l.memo, "amount": l.amount,
                "categoryName": l.category, "categoryId": cat_id, "duplicate": dup, "error": l.error,
            }));
        }
        Ok(json!({
            "headers": parsed.headers,
            "mapping": parsed.mapping.to_json(),
            "dateFormat": parsed.date_format,
            "dateAmbiguous": parsed.date_ambiguous,
            "rows": rows,
            "duplicateCount": dups,
            "errorCount": errors,
        }))
    }

    pub(crate) fn csv_import(&mut self, p: &Value) -> R<Value> {
        let account = req_i(p, "accountId")?;
        Ledger::account_active(&self.conn, account)?;
        let rows = p
            .get("rows")
            .and_then(|r| r.as_array())
            .cloned()
            .unwrap_or_default();
        if rows.is_empty() {
            return Err("Nothing selected to import".into());
        }
        if rows.len() > MAX_IMPORT_ROWS {
            return Err(format!("Import at most {MAX_IMPORT_ROWS} rows at a time"));
        }
        let skip_dups = gb(p, "skipDuplicates").unwrap_or(true);
        let status = gs(p, "status")
            .filter(|s| s == "cleared")
            .unwrap_or_else(|| "uncleared".into());
        // Safety copy before a bulk change, so an import can always be undone by restore.
        let backup = self.backup_create("before-import")?;
        let tx = self.conn.transaction().map_err(err)?;
        let before_id: i64 = tx
            .query_row("SELECT COALESCE(MAX(id), 0) FROM transactions", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        let mut seen: HashMap<String, usize> = HashMap::new();
        let (mut imported, mut skipped) = (0, 0);
        for (i, r) in rows.iter().enumerate() {
            let date = req_s(r, "date").map_err(|e| format!("row {}: {e}", i + 1))?;
            let amount = req_i(r, "amount").map_err(|e| format!("row {}: {e}", i + 1))?;
            let payee = clean_text(&gs(r, "payee").unwrap_or_default(), 200, "Payee")?;
            let key = format!("{date}|{amount}|{}", norm_payee(&payee));
            let occ = seen.entry(key).or_insert(0);
            *occ += 1;
            let iid = import_id(account, &date, amount, &payee, *occ);
            if skip_dups
                && is_duplicate(&tx, account, &date, amount, &payee, &iid, *occ, before_id)?
            {
                skipped += 1;
                continue;
            }
            let exists: Option<i64> = tx
                .query_row(
                    "SELECT id FROM transactions WHERE account_id = ?1 AND import_id = ?2",
                    params![account, iid],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            let import_key = if exists.is_some() { None } else { Some(iid) };
            insert_plain(
                &tx,
                &NewTxn {
                    account_id: account,
                    date,
                    payee,
                    memo: clean_text(&gs(r, "memo").unwrap_or_default(), 2000, "Notes")?,
                    amount,
                    category_id: opt_id(r, "categoryId"),
                    status: status.clone(),
                    import_id: import_key,
                },
            )
            .map_err(|e| format!("row {}: {e}", i + 1))?;
            imported += 1;
        }
        audit(
            &tx,
            "import",
            "account",
            Some(account),
            json!({ "imported": imported, "skipped": skipped, "backup": backup["file"] }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "imported": imported, "skipped": skipped, "backup": backup["file"] }))
    }

    pub(crate) fn csv_export(&self, p: &Value) -> R<Value> {
        let d = digits(&self.conn);
        let cur = setting(&self.conn, "currency").unwrap_or_default();
        let (where_sql, binds) = txn_filters(p);
        let sql = format!("{TXN_SELECT} {where_sql} ORDER BY t.date, t.id LIMIT 200000");
        let mut st = self.conn.prepare(&sql).map_err(err)?;
        let rows = st
            .query_map(params_from_iter(binds.iter()), txn_row)
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut sst = self
            .conn
            .prepare("SELECT c.name, s.amount, s.memo FROM splits s LEFT JOIN categories c ON c.id = s.category_id WHERE s.txn_id = ?1 ORDER BY s.id")
            .map_err(err)?;
        let mut out = csv::write_row(
            &[
                "Date", "Account", "Payee", "Category", "Notes", "Amount", "Status", "Currency",
            ]
            .map(String::from),
        );
        let s = |v: &Value| v.as_str().unwrap_or("").to_string();
        let mut count = 0;
        for r in &rows {
            let payee = if r["isTransfer"] == true {
                format!(
                    "Transfer {} {}",
                    if r["amount"].as_i64().unwrap_or(0) < 0 {
                        "to"
                    } else {
                        "from"
                    },
                    s(&r["transferAccountName"])
                )
            } else {
                s(&r["payee"])
            };
            if r["isSplit"] == true {
                let id = r["id"].as_i64().unwrap_or(0);
                let parts: Vec<(Option<String>, i64, String)> = sst
                    .query_map([id], |x| Ok((x.get(0)?, x.get(1)?, x.get(2)?)))
                    .map_err(err)?
                    .collect::<Result<_, _>>()
                    .map_err(err)?;
                for (cat, amt, memo) in parts {
                    out += &csv::write_row(&[
                        s(&r["date"]),
                        s(&r["accountName"]),
                        payee.clone(),
                        cat.unwrap_or_default(),
                        if memo.is_empty() { s(&r["memo"]) } else { memo },
                        money::format_minor(amt, d),
                        s(&r["status"]),
                        cur.clone(),
                    ]);
                }
            } else {
                let cat = if r["isTransfer"] == true {
                    "Transfer".to_string()
                } else {
                    s(&r["categoryName"])
                };
                out += &csv::write_row(&[
                    s(&r["date"]),
                    s(&r["accountName"]),
                    payee,
                    cat,
                    s(&r["memo"]),
                    money::format_minor(r["amount"].as_i64().unwrap_or(0), d),
                    s(&r["status"]),
                    cur.clone(),
                ]);
            }
            count += 1;
        }
        Ok(json!({ "csv": out, "count": count, "currency": cur }))
    }

    // -------------------------------------------------------- reconciliation

    fn cleared_balance(c: &Connection, account: i64) -> R<i64> {
        c.query_row(
            "SELECT a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id AND t.status <> 'uncleared'), 0) FROM accounts a WHERE a.id = ?1",
            [account],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?
        .ok_or_else(|| format!("account {account} does not exist"))
    }

    pub(crate) fn reconcile_summary(&self, p: &Value) -> R<Value> {
        let account = req_i(p, "accountId")?;
        let cleared = Self::cleared_balance(&self.conn, account)?;
        let balance = Self::account_balance(&self.conn, account)?;
        let mut st = self.conn.prepare(&format!("{TXN_SELECT} WHERE t.account_id = ?1 AND t.status <> 'reconciled' ORDER BY t.date, t.id")).map_err(err)?;
        let open = st
            .query_map([account], txn_row)
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let last = self.reconcile_history(&json!({ "accountId": account, "limit": 1 }))?;
        Ok(
            json!({ "accountId": account, "clearedBalance": cleared, "balance": balance, "open": open, "last": last.as_array().and_then(|a| a.first().cloned()) }),
        )
    }

    /// Match statement lines to ledger transactions: same amount, date within
    /// five days, not yet reconciled, each transaction used at most once. It
    /// only proposes matches; nothing changes until the user clears them.
    pub(crate) fn reconcile_match(&self, p: &Value) -> R<Value> {
        let account = req_i(p, "accountId")?;
        let parsed = parse_statement(p, digits(&self.conn))?;
        let mut st = self.conn.prepare(&format!("{TXN_SELECT} WHERE t.account_id = ?1 AND t.status <> 'reconciled' ORDER BY t.date, t.id")).map_err(err)?;
        let open = st
            .query_map([account], txn_row)
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let mut used: HashSet<i64> = HashSet::new();
        let mut lines = Vec::new();
        let mut statement_total: i64 = 0;
        for l in &parsed.lines {
            let mut matched: Option<&Value> = None;
            if let (Some(d), Some(a)) = (&l.date, l.amount) {
                statement_total += a;
                let mut best: Option<(i64, &Value)> = None;
                for t in &open {
                    let id = t["id"].as_i64().unwrap_or(0);
                    if used.contains(&id) || t["amount"].as_i64() != Some(a) {
                        continue;
                    }
                    let Some(gap) =
                        dates::diff_days(d, t["date"].as_str().unwrap_or("")).map(|g| g.abs())
                    else {
                        continue;
                    };
                    if gap <= 5 && best.map(|(g, _)| gap < g).unwrap_or(true) {
                        best = Some((gap, t));
                    }
                }
                if let Some((_, t)) = best {
                    used.insert(t["id"].as_i64().unwrap_or(0));
                    matched = Some(t);
                }
            }
            lines.push(json!({
                "line": l.line, "date": l.date, "payee": l.payee, "memo": l.memo, "amount": l.amount, "error": l.error,
                "matchId": matched.map(|t| t["id"].clone()),
                "matchStatus": matched.map(|t| t["status"].clone()),
                "matchPayee": matched.map(|t| t["payee"].clone()),
            }));
        }
        let unmatched: Vec<Value> = open
            .into_iter()
            .filter(|t| !used.contains(&t["id"].as_i64().unwrap_or(0)))
            .collect();
        Ok(json!({
            "lines": lines, "unmatchedTransactions": unmatched, "statementTotal": statement_total,
            "dateFormat": parsed.date_format, "dateAmbiguous": parsed.date_ambiguous, "mapping": parsed.mapping.to_json(), "headers": parsed.headers,
        }))
    }

    pub(crate) fn reconcile_finish(&mut self, p: &Value) -> R<Value> {
        let account = req_i(p, "accountId")?;
        let date = req_s(p, "statementDate")?;
        if !dates::is_valid(&date) {
            return Err("Enter the statement date".into());
        }
        let statement = req_i(p, "statementBalance")?;
        let adjust = gb(p, "createAdjustment") == Some(true);
        let tx = self.conn.transaction().map_err(err)?;
        Ledger::account_active(&tx, account)?;
        let cleared = Self::cleared_balance(&tx, account)?;
        let diff = statement - cleared;
        let mut adjustment = None;
        if diff != 0 {
            if !adjust {
                return Err(format!("DIFFERENCE:{diff}"));
            }
            let id = insert_plain(
                &tx,
                &NewTxn {
                    account_id: account,
                    date: date.clone(),
                    payee: "Reconciliation adjustment".into(),
                    memo: format!("Created when reconciling to the statement of {date}"),
                    amount: diff,
                    category_id: None,
                    status: "cleared".into(),
                    import_id: None,
                },
            )?;
            adjustment = Some(id);
        }
        let count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM transactions WHERE account_id = ?1 AND status = 'cleared'",
                [account],
                |r| r.get(0),
            )
            .map_err(err)?;
        tx.execute(
            "INSERT INTO reconciliations (account_id, statement_date, statement_balance, cleared_balance, txn_count, adjustment_txn, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![account, date, statement, cleared, count, adjustment, now_ms()],
        )
        .map_err(err)?;
        let rid = tx.last_insert_rowid();
        tx.execute("UPDATE transactions SET status = 'reconciled', reconciliation_id = ?1, updated_at = ?2 WHERE account_id = ?3 AND status = 'cleared'", params![rid, now_ms(), account])
            .map_err(err)?;
        audit(
            &tx,
            "reconcile",
            "account",
            Some(account),
            json!({ "reconciliationId": rid, "statementDate": date, "statementBalance": statement, "clearedBalance": cleared, "transactions": count, "adjustment": adjustment, "adjustmentAmount": diff }),
        )?;
        tx.commit().map_err(err)?;
        Ok(
            json!({ "id": rid, "transactions": count, "adjustmentId": adjustment, "difference": diff }),
        )
    }

    pub(crate) fn reconcile_undo(&mut self, p: &Value) -> R<Value> {
        let id = req_i(p, "id")?;
        let tx = self.conn.transaction().map_err(err)?;
        let row: Option<(i64, i64)> = tx
            .query_row(
                "SELECT account_id, undone FROM reconciliations WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?;
        let (account, undone) = row.ok_or_else(|| format!("reconciliation {id} does not exist"))?;
        if undone == 1 {
            return Err("That reconciliation was already undone".into());
        }
        let later: i64 = tx.query_row("SELECT COUNT(*) FROM reconciliations WHERE account_id = ?1 AND id > ?2 AND undone = 0", params![account, id], |r| r.get(0)).map_err(err)?;
        if later > 0 {
            return Err("Undo the more recent reconciliations of this account first".into());
        }
        let n = tx.execute("UPDATE transactions SET status = 'cleared', reconciliation_id = NULL WHERE reconciliation_id = ?1", [id]).map_err(err)?;
        tx.execute("UPDATE reconciliations SET undone = 1 WHERE id = ?1", [id])
            .map_err(err)?;
        audit(
            &tx,
            "unreconcile",
            "account",
            Some(account),
            json!({ "reconciliationId": id, "transactions": n }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "transactions": n }))
    }

    pub(crate) fn reconcile_history(&self, p: &Value) -> R<Value> {
        let limit = gi(p, "limit").unwrap_or(100).clamp(1, 1000);
        let (sql, bind): (String, Vec<i64>) = match gi(p, "accountId") {
            Some(a) => (
                format!("SELECT r.id, r.account_id, a.name, r.statement_date, r.statement_balance, r.cleared_balance, r.txn_count, r.adjustment_txn, r.undone, r.created_at FROM reconciliations r JOIN accounts a ON a.id = r.account_id WHERE r.account_id = ?1 ORDER BY r.id DESC LIMIT {limit}"),
                vec![a],
            ),
            None => (
                format!("SELECT r.id, r.account_id, a.name, r.statement_date, r.statement_balance, r.cleared_balance, r.txn_count, r.adjustment_txn, r.undone, r.created_at FROM reconciliations r JOIN accounts a ON a.id = r.account_id ORDER BY r.id DESC LIMIT {limit}"),
                vec![],
            ),
        };
        let mut st = self.conn.prepare(&sql).map_err(err)?;
        let rows = st
            .query_map(params_from_iter(bind.iter()), |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?, "accountId": r.get::<_, i64>(1)?, "accountName": r.get::<_, String>(2)?,
                    "statementDate": r.get::<_, String>(3)?, "statementBalance": r.get::<_, i64>(4)?, "clearedBalance": r.get::<_, i64>(5)?,
                    "transactions": r.get::<_, i64>(6)?, "adjustmentId": r.get::<_, Option<i64>>(7)?, "undone": r.get::<_, i64>(8)? == 1, "createdAt": r.get::<_, i64>(9)?,
                }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Value::Array(rows))
    }

    /// Mark a batch of statement-matched transactions cleared (explicit action).
    pub fn clear_matched(&mut self, ids: &[i64]) -> R<usize> {
        let tx = self.conn.transaction().map_err(err)?;
        let n = set_status_inner(&tx, ids, "cleared", false)?;
        audit(
            &tx,
            "status",
            "transaction",
            None,
            json!({ "ids": ids, "status": "cleared", "via": "statement match" }),
        )?;
        tx.commit().map_err(err)?;
        Ok(n)
    }

    // ---------------------------------------------------------------- backup

    pub fn backup_create(&self, label: &str) -> R<Value> {
        std::fs::create_dir_all(&self.backup_dir).map_err(err)?;
        let label: String = label
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        let file = format!("ledger-{}-{label}.db", utc_stamp());
        let path = self.backup_dir.join(&file);
        self.conn
            .execute("VACUUM INTO ?1", [path.to_string_lossy().to_string()])
            .map_err(err)?;
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if label != "manual" {
            self.prune_auto_backups();
        }
        Ok(json!({ "file": file, "size": size, "createdAt": now_ms(), "label": label }))
    }

    fn prune_auto_backups(&self) {
        let Ok(list) = self.backup_list() else { return };
        let autos: Vec<String> = list
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|b| b["label"] != "manual")
            .filter_map(|b| b["file"].as_str().map(String::from))
            .collect();
        for f in autos.iter().skip(AUTO_BACKUPS_KEPT) {
            let _ = std::fs::remove_file(self.backup_dir.join(f));
        }
    }

    pub fn backup_list(&self) -> R<Value> {
        let mut out: Vec<Value> = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&self.backup_dir) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if !(name.starts_with("ledger-") && name.ends_with(".db")) {
                    continue;
                }
                let meta = e.metadata().ok();
                let label = name
                    .trim_end_matches(".db")
                    .splitn(5, '-')
                    .nth(4)
                    .unwrap_or("manual")
                    .to_string();
                let modified = meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                out.push(json!({ "file": name, "size": meta.map(|m| m.len()).unwrap_or(0), "createdAt": modified, "label": label }));
            }
        }
        out.sort_by(|a, b| b["file"].as_str().cmp(&a["file"].as_str()));
        Ok(Value::Array(out))
    }

    pub(crate) fn backup_restore_named(&mut self, p: &Value) -> R<Value> {
        let file = req_s(p, "file")?;
        if file.contains(['/', '\\'])
            || file.contains("..")
            || !file.starts_with("ledger-")
            || !file.ends_with(".db")
        {
            return Err("not a ledger backup name".into());
        }
        let path = self.backup_dir.join(&file);
        self.restore_from_path(&path)
    }

    /// Check that a file is a healthy DEX ledger this build can open.
    pub fn validate_backup(path: &Path) -> R<i64> {
        let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("can't open that file: {e}"))?;
        let check: String = c
            .query_row("PRAGMA quick_check", [], |r| r.get(0))
            .map_err(|_| "that file is not a SQLite database".to_string())?;
        if check != "ok" {
            return Err(format!("that backup is damaged ({check})"));
        }
        let v = schema::user_version(&c).map_err(err)?;
        if v < 1 || v > schema::CURRENT_VERSION {
            return Err(format!(
                "that file is not a ledger this DEX can open (schema {v})"
            ));
        }
        let tables: i64 = c
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('accounts','transactions','categories','allocations')", [], |r| r.get(0))
            .map_err(err)?;
        if tables != 4 {
            return Err("that file is not a DEX ledger".into());
        }
        Ok(v)
    }

    /// Replace the current ledger with a backup. The current data is backed up
    /// first ("before-restore"), so a restore is itself reversible.
    pub fn restore_from_path(&mut self, path: &Path) -> R<Value> {
        Self::validate_backup(path)?;
        let safety = self.backup_create("before-restore")?;
        self.conn
            .restore(
                rusqlite::DatabaseName::Main,
                path,
                None::<fn(rusqlite::backup::Progress)>,
            )
            .map_err(err)?;
        schema::migrate(&mut self.conn)?;
        audit(
            &self.conn,
            "restore",
            "ledger",
            None,
            json!({ "from": path.file_name().map(|f| f.to_string_lossy().to_string()), "safetyBackup": safety["file"] }),
        )?;
        Ok(json!({ "restored": true, "safetyBackup": safety["file"] }))
    }

    /// Write a standalone copy of the ledger to a user-chosen path.
    pub fn export_backup(&self, dest: &Path) -> R<Value> {
        if dest.exists() {
            std::fs::remove_file(dest)
                .map_err(|e| format!("can't replace the existing file: {e}"))?;
        }
        self.conn
            .execute("VACUUM INTO ?1", [dest.to_string_lossy().to_string()])
            .map_err(err)?;
        Ok(
            json!({ "path": dest.to_string_lossy(), "size": std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0) }),
        )
    }
}
