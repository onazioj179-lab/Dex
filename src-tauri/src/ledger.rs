// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{self, Write},
    path::Path,
};
use tauri_plugin_dialog::DialogExt;

const MAX_AMOUNT: i64 = 9_000_000_000_000;
const PAGE_SIZE: i64 = 100;
const BATCH_LIMIT: usize = 5_000;
const FILTER: &str = "currency=?1 AND date BETWEEN ?2 AND ?3
    AND (instr(lower(description), lower(?4)) > 0 OR instr(lower(category), lower(?4)) > 0)";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    date: String,
    kind: String,
    currency: String,
    amount_minor: i64,
    category: String,
    description: String,
}

#[derive(Serialize)]
struct LedgerRow {
    id: i64,
    revision: i64,
    #[serde(flatten)]
    entry: Entry,
}

#[derive(Deserialize)]
struct Query {
    currency: String,
    #[serde(default)]
    month: String,
    #[serde(default)]
    search: String,
    #[serde(default)]
    offset: u32,
}

pub(crate) fn ensure_schema(conn: &Connection) {
    if let Err(error) = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS ledger_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            revision INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
            currency TEXT NOT NULL,
            amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 9000000000000),
            category TEXT NOT NULL,
            description TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ledger_entries_currency_date ON ledger_entries(currency, date DESC, id DESC);",
    ) {
        eprintln!("[Ledger] Could not initialize storage: {error}");
    }
}

fn currency_supported(currency: &str) -> bool {
    matches!(currency, "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY")
}

fn valid_date(date: &str) -> bool {
    let raw = date.as_bytes();
    if raw.len() != 10
        || raw[4] != b'-'
        || raw[7] != b'-'
        || raw
            .iter()
            .enumerate()
            .any(|(i, byte)| i != 4 && i != 7 && !byte.is_ascii_digit())
    {
        return false;
    }
    let year = date[0..4].parse::<u16>().unwrap_or_default();
    let month = date[5..7].parse::<u8>().unwrap_or_default();
    let day = date[8..10].parse::<u8>().unwrap_or_default();
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let last = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => return false,
    };
    year != 0 && day >= 1 && day <= last
}

fn parse_entry(value: &Value) -> Result<Entry, String> {
    let mut entry: Entry =
        serde_json::from_value(value.clone()).map_err(|_| "Invalid transaction data.")?;
    if !valid_date(&entry.date) {
        return Err("Enter a valid date.".into());
    }
    if !currency_supported(&entry.currency) || !matches!(entry.kind.as_str(), "income" | "expense")
    {
        return Err("Select a supported currency and transaction type.".into());
    }
    if !(1..=MAX_AMOUNT).contains(&entry.amount_minor) {
        return Err("Enter an amount greater than zero within the supported range.".into());
    }
    entry.category = entry.category.trim().to_owned();
    entry.description = entry.description.trim().to_owned();
    if entry.category.is_empty() {
        entry.category = "Uncategorized".into();
    }
    if entry.category.chars().count() > 60
        || entry.description.chars().count() > 300
        || entry
            .category
            .chars()
            .chain(entry.description.chars())
            .any(|c| c == '\0')
    {
        return Err("Category and description must fit within 60 and 300 characters.".into());
    }
    Ok(entry)
}

fn read_row(row: &Row<'_>) -> rusqlite::Result<LedgerRow> {
    Ok(LedgerRow {
        id: row.get(0)?,
        revision: row.get(1)?,
        entry: Entry {
            date: row.get(2)?,
            kind: row.get(3)?,
            currency: row.get(4)?,
            amount_minor: row.get(5)?,
            category: row.get(6)?,
            description: row.get(7)?,
        },
    })
}

fn storage_error(error: rusqlite::Error) -> String {
    eprintln!("[Ledger] Database operation failed: {error}");
    "Could not access Ledger storage.".into()
}

fn query(conn: &Connection, raw: &Value, export: bool) -> Result<Value, String> {
    let query: Query =
        serde_json::from_value(raw.clone()).map_err(|_| "Invalid Ledger filters.")?;
    if !currency_supported(&query.currency) || query.search.chars().count() > 120 {
        return Err("Invalid Ledger filters.".into());
    }
    let (start, end) = if query.month.is_empty() {
        ("0001-01-01".to_owned(), "9999-12-31".to_owned())
    } else {
        let start = format!("{}-01", query.month);
        if !valid_date(&start) {
            return Err("Select a valid month.".into());
        }
        (start, format!("{}-31", query.month))
    };
    let search = query.search.trim();
    let values = params![query.currency, start, end, search];
    let totals = format!(
        "SELECT COUNT(*),
        CAST(COALESCE(SUM(CASE WHEN kind='income' THEN amount_minor ELSE 0 END),0) AS TEXT),
        CAST(COALESCE(SUM(CASE WHEN kind='expense' THEN amount_minor ELSE 0 END),0) AS TEXT)
        FROM ledger_entries WHERE {FILTER}"
    );
    let (count, income, expenses): (i64, String, String) = conn
        .query_row(&totals, values, |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(storage_error)?;
    if export && count > BATCH_LIMIT as i64 {
        return Err("Filter to 5,000 transactions or fewer to export this view.".into());
    }
    let mut rows = conn
        .prepare(&format!(
            "SELECT id,revision,date,kind,currency,amount_minor,category,description
        FROM ledger_entries WHERE {FILTER} ORDER BY date DESC,id DESC LIMIT ?5 OFFSET ?6"
        ))
        .map_err(storage_error)?;
    let offset = if export {
        0
    } else {
        i64::from(query.offset).min(count.saturating_sub(1).max(0) / PAGE_SIZE * PAGE_SIZE)
    };
    let limit = if export {
        BATCH_LIMIT as i64
    } else {
        PAGE_SIZE
    };
    let entries = rows
        .query_map(
            params![query.currency, start, end, search, limit, offset],
            read_row,
        )
        .map_err(storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_error)?;
    let mut categories = conn
        .prepare(&format!(
            "SELECT category, CAST(SUM(amount_minor) AS TEXT)
        FROM ledger_entries WHERE {FILTER} AND kind='expense'
        GROUP BY category ORDER BY SUM(amount_minor) DESC, category LIMIT 8"
        ))
        .map_err(storage_error)?;
    let category_totals = categories
        .query_map(values, |row| {
            Ok(json!({
                "name": row.get::<_, String>(0)?, "amountMinor": row.get::<_, String>(1)?
            }))
        })
        .map_err(storage_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(storage_error)?;
    Ok(
        json!({"success": true, "entries": entries, "count": count, "offset": offset,
        "pageSize": PAGE_SIZE, "incomeMinor": income, "expenseMinor": expenses, "categories": category_totals}),
    )
}

fn add(conn: &Connection, entry: &Entry) -> rusqlite::Result<()> {
    conn.execute("INSERT INTO ledger_entries(date,kind,currency,amount_minor,category,description) VALUES (?1,?2,?3,?4,?5,?6)",
        params![entry.date, entry.kind, entry.currency, entry.amount_minor, entry.category, entry.description])?;
    Ok(())
}

fn save(conn: &Connection, args: &Value) -> Result<Value, String> {
    let entry = parse_entry(&args[0])?;
    if args[1].is_null() && args[2].is_null() {
        add(conn, &entry).map_err(storage_error)?;
        return Ok(json!({"success": true, "id": conn.last_insert_rowid(), "revision": 1}));
    }
    let id = args[1].as_i64().ok_or("Missing transaction identifier.")?;
    let revision = args[2].as_i64().ok_or("Missing transaction revision.")?;
    let changed = conn.execute(
        "UPDATE ledger_entries SET date=?1,kind=?2,currency=?3,amount_minor=?4,category=?5,description=?6,revision=revision+1
        WHERE id=?7 AND revision=?8",
        params![entry.date, entry.kind, entry.currency, entry.amount_minor, entry.category, entry.description, id, revision],
    ).map_err(storage_error)?;
    if changed == 0 {
        return Err("This transaction changed. Refresh Ledger and try again.".into());
    }
    Ok(json!({"success": true, "id": id, "revision": revision + 1}))
}

fn delete(conn: &Connection, args: &Value) -> Result<Value, String> {
    let id = args[0].as_i64().ok_or("Missing transaction identifier.")?;
    let revision = args[1].as_i64().ok_or("Missing transaction revision.")?;
    if conn
        .execute(
            "DELETE FROM ledger_entries WHERE id=?1 AND revision=?2",
            params![id, revision],
        )
        .map_err(storage_error)?
        == 0
    {
        return Err("This transaction changed. Refresh Ledger and try again.".into());
    }
    Ok(json!({"success": true}))
}

fn import(conn: &Connection, input: &Value) -> Result<Value, String> {
    let rows = input.as_array().ok_or("No transactions were provided.")?;
    if rows.is_empty() || rows.len() > BATCH_LIMIT {
        return Err("Import between 1 and 5,000 transactions at a time.".into());
    }
    let entries = rows
        .iter()
        .enumerate()
        .map(|(i, row)| parse_entry(row).map_err(|error| format!("Transaction {}: {error}", i + 1)))
        .collect::<Result<Vec<_>, _>>()?;
    let tx = conn.unchecked_transaction().map_err(storage_error)?;
    let mut inserted = 0;
    {
        let mut check = tx.prepare_cached("SELECT EXISTS(SELECT 1 FROM ledger_entries
            WHERE currency=?1 AND date=?2 AND kind=?3 AND amount_minor=?4 AND category=?5 AND description=?6)")
            .map_err(storage_error)?;
        for entry in &entries {
            let exists: bool = check
                .query_row(
                    params![
                        entry.currency,
                        entry.date,
                        entry.kind,
                        entry.amount_minor,
                        entry.category,
                        entry.description
                    ],
                    |row| row.get(0),
                )
                .map_err(storage_error)?;
            if !exists {
                add(&tx, entry).map_err(storage_error)?;
                inserted += 1;
            }
        }
    }
    tx.commit().map_err(storage_error)?;
    Ok(json!({"success": true, "inserted": inserted, "duplicates": entries.len() - inserted}))
}

pub(crate) fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let result = match channel {
        "ledger:list" => query(conn, &args[0], false),
        "ledger:export" => query(conn, &args[0], true),
        "ledger:save" => save(conn, args),
        "ledger:delete" => delete(conn, args),
        "ledger:import" => import(conn, &args[0]),
        _ => Err("Unknown Ledger operation.".into()),
    };
    result.unwrap_or_else(|error| json!({"success": false, "error": error}))
}

pub(crate) fn save_csv(app: &tauri::AppHandle, text: &str) -> Value {
    let saved = (|| -> io::Result<Value> {
        if text.is_empty() || text.len() > 8 * 1024 * 1024 {
            return Err(io::Error::other(
                "The CSV export is empty or exceeds 8 MiB.",
            ));
        }
        let Some(path) = app
            .dialog()
            .file()
            .set_file_name("Ledger.csv")
            .add_filter("CSV file", &["csv"])
            .blocking_save_file()
            .and_then(crate::native_ops::fp_to_string)
        else {
            return Ok(json!({"success": true, "canceled": true}));
        };
        let destination = Path::new(&path);
        let folder = destination
            .parent()
            .ok_or_else(|| io::Error::other("Choose an export folder."))?;
        let mut file = tempfile::NamedTempFile::new_in(folder)?;
        file.write_all(text.as_bytes())?;
        file.as_file().sync_all()?;
        file.persist(destination).map_err(|error| error.error)?;
        Ok(json!({"success": true}))
    })();
    saved.unwrap_or_else(|error| json!({"success": false, "error": error.to_string()}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(currency: &str, kind: &str, amount: i64, description: &str) -> Value {
        json!({"date": "2024-02-29", "currency": currency, "kind": kind,
            "amountMinor": amount, "category": "Supplies", "description": description})
    }

    #[test]
    fn keeps_exact_totals_by_currency_and_applies_filtered_totals_before_pagination() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn);
        for i in 0..110 {
            save(
                &conn,
                &json!([entry("USD", "expense", 11, &format!("Box {i}"))]),
            )
            .unwrap();
        }
        save(&conn, &json!([entry("USD", "income", 305, "Box refund")])).unwrap();
        save(&conn, &json!([entry("EUR", "income", 900, "Box refund")])).unwrap();
        let result = query(
            &conn,
            &json!({"currency": "USD", "month": "2024-02", "search": "box", "offset": 100}),
            false,
        )
        .unwrap();
        assert_eq!(result["entries"].as_array().unwrap().len(), 11);
        assert_eq!(result["count"], 111);
        assert_eq!(result["expenseMinor"], "1210");
        assert_eq!(result["incomeMinor"], "305");
        assert_eq!(result["categories"][0]["amountMinor"], "1210");
    }

    #[test]
    fn validates_a_batch_before_writing_and_skips_repeated_imports() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn);
        let row = entry("JPY", "income", 18, "Allowance");
        let mut invalid = row.clone();
        invalid["date"] = json!("2023-02-29");
        assert!(import(&conn, &json!([row, invalid])).is_err());
        let empty = query(&conn, &json!({"currency": "JPY"}), false).unwrap();
        assert_eq!(empty["count"], 0);
        let result = import(&conn, &json!([row, row])).unwrap();
        assert_eq!(result["inserted"], 1);
        assert_eq!(result["duplicates"], 1);
        assert_eq!(import(&conn, &json!([row])).unwrap()["duplicates"], 1);
    }

    #[test]
    fn rejects_stale_edits_and_deletes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn);
        let row = entry("USD", "income", 100, "Sale");
        let first = save(&conn, &json!([row])).unwrap();
        let id = first["id"].as_i64().unwrap();
        assert_eq!(save(&conn, &json!([row, id, 1])).unwrap()["revision"], 2);
        assert!(save(&conn, &json!([row, id, 1])).is_err());
        assert!(delete(&conn, &json!([id, 1])).is_err());
        assert!(delete(&conn, &json!([id, 2])).is_ok());
    }
}
