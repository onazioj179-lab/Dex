// =============================================================================
// DEX Ledger — overview and reports. Every figure is a SQL aggregate over the
// stored rows; nothing is estimated or sampled.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Definitions (used consistently by Overview, Reports and CSV):
//! - Income   = money in income categories.
//! - Expenses = money out of expense categories, net of refunds to them.
//! - Uncategorised = non-transfer money with no category (reported apart).
//! - Net      = income − expenses + uncategorised.
//! - Cash flow inflow/outflow are sign-based over non-transfer transactions.
//! Transfers never count as income, expenses, inflow or outflow.

use crate::txns::{txn_row, TXN_SELECT};
use crate::*;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn range(p: &Value) -> R<(String, String)> {
    let from = req_s(p, "from")?;
    let to = req_s(p, "to")?;
    if !dates::is_valid(&from) || !dates::is_valid(&to) {
        return Err("Choose a valid date range".into());
    }
    if from > to {
        return Err("The start date is after the end date".into());
    }
    Ok((from, to))
}

/// Every `YYYY-MM` from the month of `from` to the month of `to`, inclusive.
fn months_between(from: &str, to: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut m = from[0..7].to_string();
    let end = &to[0..7];
    while m.as_str() <= end && out.len() < 600 {
        out.push(m.clone());
        m = match dates::shift_month(&m, 1) {
            Some(n) => n,
            None => break,
        };
    }
    out
}

pub(crate) fn income_expense_totals(c: &Connection, from: &str, to: &str) -> R<(i64, i64, i64)> {
    c.query_row(
        "SELECT COALESCE(SUM(CASE WHEN g.kind = 'income' THEN l.amount END), 0),
                COALESCE(-SUM(CASE WHEN g.kind = 'expense' THEN l.amount END), 0),
                COALESCE(SUM(CASE WHEN l.category_id IS NULL THEN l.amount END), 0)
           FROM cat_lines l
           LEFT JOIN categories c ON c.id = l.category_id
           LEFT JOIN category_groups g ON g.id = c.group_id
          WHERE l.date BETWEEN ?1 AND ?2",
        params![from, to],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(err)
}

fn total_balance_at(c: &Connection, date: &str) -> R<i64> {
    c.query_row(
        "SELECT COALESCE((SELECT SUM(opening_balance) FROM accounts WHERE opening_date <= ?1), 0)
              + COALESCE((SELECT SUM(amount) FROM transactions WHERE date <= ?1), 0)",
        [date],
        |r| r.get(0),
    )
    .map_err(err)
}

impl Ledger {
    pub(crate) fn overview(&self, p: &Value) -> R<Value> {
        let (from, to) = range(p)?;
        let today = gs(p, "today")
            .filter(|d| dates::is_valid(d))
            .unwrap_or_else(dates::today_utc);
        let c = &self.conn;
        let (income, expense, uncategorized) = income_expense_totals(c, &from, &to)?;
        let total: i64 = c
            .query_row(
                "SELECT COALESCE(SUM(a.opening_balance), 0) + COALESCE((SELECT SUM(amount) FROM transactions), 0) FROM accounts a",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        let mut st = c
            .prepare(
                "SELECT a.kind, SUM(a.opening_balance + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id), 0))
                   FROM accounts a WHERE a.archived = 0 GROUP BY a.kind",
            )
            .map_err(err)?;
        let mut by_kind = serde_json::Map::new();
        for row in st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(err)?
        {
            let (k, v) = row.map_err(err)?;
            by_kind.insert(k, json!(v));
        }
        let mut st = c
            .prepare(&format!(
                "{TXN_SELECT} ORDER BY t.date DESC, t.id DESC LIMIT 8"
            ))
            .map_err(err)?;
        let recent = st
            .query_map([], txn_row)
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let horizon = dates::add_days(&today, 30).unwrap_or(today.clone());
        let upcoming: Vec<Value> = self
            .recurring_list()?
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|r| {
                r["nextDate"]
                    .as_str()
                    .map(|d| d <= horizon.as_str())
                    .unwrap_or(false)
            })
            .collect();
        let uncat_count: i64 = c
            .query_row(
                "SELECT COUNT(DISTINCT txn_id) FROM cat_lines WHERE category_id IS NULL",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        let uncleared: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM transactions WHERE status = 'uncleared'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        Ok(json!({
            "from": from, "to": to,
            "totalBalance": total,
            "balanceByKind": by_kind,
            "income": income,
            "expenses": expense,
            "uncategorized": uncategorized,
            "net": income - expense + uncategorized,
            "recent": recent,
            "upcoming": upcoming,
            "uncategorizedCount": uncat_count,
            "unclearedCount": uncleared,
        }))
    }

    pub(crate) fn report_income_expense(&self, p: &Value) -> R<Value> {
        let (from, to) = range(p)?;
        let mut st = self
            .conn
            .prepare(
                "SELECT substr(l.date, 1, 7) m,
                        COALESCE(SUM(CASE WHEN g.kind = 'income' THEN l.amount END), 0),
                        COALESCE(-SUM(CASE WHEN g.kind = 'expense' THEN l.amount END), 0),
                        COALESCE(SUM(CASE WHEN l.category_id IS NULL THEN l.amount END), 0)
                   FROM cat_lines l LEFT JOIN categories c ON c.id = l.category_id LEFT JOIN category_groups g ON g.id = c.group_id
                  WHERE l.date BETWEEN ?1 AND ?2 GROUP BY m",
            )
            .map_err(err)?;
        let mut by: BTreeMap<String, (i64, i64, i64)> = BTreeMap::new();
        for row in st
            .query_map(params![from, to], |r| {
                Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .map_err(err)?
        {
            let (m, i, e, u) = row.map_err(err)?;
            by.insert(m, (i, e, u));
        }
        let rows: Vec<Value> = months_between(&from, &to)
            .into_iter()
            .map(|m| {
                let (i, e, u) = by.get(&m).copied().unwrap_or((0, 0, 0));
                json!({ "month": m, "income": i, "expenses": e, "uncategorized": u, "net": i - e + u })
            })
            .collect();
        let (ti, te, tu) = income_expense_totals(&self.conn, &from, &to)?;
        Ok(
            json!({ "from": from, "to": to, "rows": rows, "totals": { "income": ti, "expenses": te, "uncategorized": tu, "net": ti - te + tu } }),
        )
    }

    pub(crate) fn report_cash_flow(&self, p: &Value) -> R<Value> {
        let (from, to) = range(p)?;
        let mut st = self
            .conn
            .prepare(
                "SELECT substr(date, 1, 7) m,
                        COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0),
                        COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END), 0)
                   FROM transactions WHERE is_transfer = 0 AND date BETWEEN ?1 AND ?2 GROUP BY m",
            )
            .map_err(err)?;
        let mut by: BTreeMap<String, (i64, i64)> = BTreeMap::new();
        for row in st
            .query_map(params![from, to], |r| {
                Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(err)?
        {
            let (m, i, o) = row.map_err(err)?;
            by.insert(m, (i, o));
        }
        let mut rows = Vec::new();
        for m in months_between(&from, &to) {
            let (i, o) = by.get(&m).copied().unwrap_or((0, 0));
            let end = dates::month_end(&m).ok_or("bad month")?;
            let end = if end.as_str() > to.as_str() {
                to.clone()
            } else {
                end
            };
            rows.push(json!({ "month": m, "inflow": i, "outflow": o, "net": i - o, "endingBalance": total_balance_at(&self.conn, &end)? }));
        }
        let start = dates::add_days(&from, -1).ok_or("bad date")?;
        Ok(
            json!({ "from": from, "to": to, "openingBalance": total_balance_at(&self.conn, &start)?, "closingBalance": total_balance_at(&self.conn, &to)?, "rows": rows }),
        )
    }

    pub(crate) fn report_spending(&self, p: &Value) -> R<Value> {
        let (from, to) = range(p)?;
        let mut st = self
            .conn
            .prepare(
                "SELECT c.id, c.name, g.name, -SUM(l.amount), COUNT(DISTINCT l.txn_id)
                   FROM cat_lines l JOIN categories c ON c.id = l.category_id JOIN category_groups g ON g.id = c.group_id
                  WHERE g.kind = 'expense' AND l.date BETWEEN ?1 AND ?2
                  GROUP BY c.id HAVING SUM(l.amount) <> 0 ORDER BY -SUM(l.amount) DESC",
            )
            .map_err(err)?;
        let rows = st
            .query_map(params![from, to], |r| {
                Ok(json!({ "categoryId": r.get::<_, i64>(0)?, "category": r.get::<_, String>(1)?, "group": r.get::<_, String>(2)?, "spent": r.get::<_, i64>(3)?, "transactions": r.get::<_, i64>(4)? }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let (uncat_out, uncat_n): (i64, i64) = self
            .conn
            .query_row(
                "SELECT COALESCE(-SUM(amount), 0), COUNT(DISTINCT txn_id) FROM cat_lines WHERE category_id IS NULL AND amount < 0 AND date BETWEEN ?1 AND ?2",
                params![from, to],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(err)?;
        let total: i64 = rows.iter().map(|r| r["spent"].as_i64().unwrap_or(0)).sum();
        Ok(
            json!({ "from": from, "to": to, "rows": rows, "total": total, "uncategorizedSpent": uncat_out, "uncategorizedCount": uncat_n }),
        )
    }

    pub(crate) fn report_balances(&self, p: &Value) -> R<Value> {
        let as_of = gs(p, "asOf")
            .filter(|d| dates::is_valid(d))
            .unwrap_or_else(dates::today_utc);
        let mut st = self
            .conn
            .prepare(
                "SELECT a.id, a.name, a.kind, a.archived,
                        CASE WHEN a.opening_date <= ?1 THEN a.opening_balance ELSE 0 END
                        + COALESCE((SELECT SUM(amount) FROM transactions t WHERE t.account_id = a.id AND t.date <= ?1), 0)
                   FROM accounts a ORDER BY a.archived, a.sort, a.id",
            )
            .map_err(err)?;
        let rows = st
            .query_map([&as_of], |r| {
                Ok(json!({ "accountId": r.get::<_, i64>(0)?, "name": r.get::<_, String>(1)?, "kind": r.get::<_, String>(2)?, "archived": r.get::<_, i64>(3)? == 1, "balance": r.get::<_, i64>(4)? }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let total: i64 = rows
            .iter()
            .map(|r| r["balance"].as_i64().unwrap_or(0))
            .sum();
        Ok(json!({ "asOf": as_of, "rows": rows, "total": total }))
    }

    pub(crate) fn report_budget_vs_actual(&self, p: &Value) -> R<Value> {
        let (from, to) = range(p)?;
        let fm = &from[0..7];
        let tm = &to[0..7];
        let mut st = self
            .conn
            .prepare(
                "SELECT c.id, c.name, g.name,
                        COALESCE((SELECT SUM(amount) FROM allocations a WHERE a.category_id = c.id AND a.month BETWEEN ?1 AND ?2), 0),
                        COALESCE((SELECT -SUM(amount) FROM cat_lines l WHERE l.category_id = c.id AND substr(l.date, 1, 7) BETWEEN ?1 AND ?2), 0)
                   FROM categories c JOIN category_groups g ON g.id = c.group_id
                  WHERE g.kind = 'expense'
                  ORDER BY g.sort, g.id, c.sort, c.id",
            )
            .map_err(err)?;
        let rows: Vec<Value> = st
            .query_map(params![fm, tm], |r| {
                let b: i64 = r.get(3)?;
                let a: i64 = r.get(4)?;
                Ok(json!({ "categoryId": r.get::<_, i64>(0)?, "category": r.get::<_, String>(1)?, "group": r.get::<_, String>(2)?, "assigned": b, "spent": a, "difference": b - a }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?
            .into_iter()
            .filter(|r| r["assigned"].as_i64() != Some(0) || r["spent"].as_i64() != Some(0))
            .collect();
        let tb: i64 = rows
            .iter()
            .map(|r| r["assigned"].as_i64().unwrap_or(0))
            .sum();
        let ta: i64 = rows.iter().map(|r| r["spent"].as_i64().unwrap_or(0)).sum();
        Ok(
            json!({ "fromMonth": fm, "toMonth": tm, "rows": rows, "totals": { "assigned": tb, "spent": ta, "difference": tb - ta } }),
        )
    }

    /// CSV text for any report, in plain decimals of the book currency.
    pub(crate) fn report_csv(&self, p: &Value) -> R<Value> {
        let kind = req_s(p, "report")?;
        let d = digits(&self.conn);
        let m = |v: &Value| money::format_minor(v.as_i64().unwrap_or(0), d);
        let s = |v: &Value| v.as_str().unwrap_or("").to_string();
        let mut out = String::new();
        let data = match kind.as_str() {
            "incomeExpense" => {
                let r = self.report_income_expense(p)?;
                out += &csv::write_row(&[
                    "Month".into(),
                    "Income".into(),
                    "Expenses".into(),
                    "Uncategorised".into(),
                    "Net".into(),
                ]);
                for row in r["rows"].as_array().cloned().unwrap_or_default() {
                    out += &csv::write_row(&[
                        s(&row["month"]),
                        m(&row["income"]),
                        m(&row["expenses"]),
                        m(&row["uncategorized"]),
                        m(&row["net"]),
                    ]);
                }
                r
            }
            "cashFlow" => {
                let r = self.report_cash_flow(p)?;
                out += &csv::write_row(&[
                    "Month".into(),
                    "Inflow".into(),
                    "Outflow".into(),
                    "Net".into(),
                    "Ending balance".into(),
                ]);
                for row in r["rows"].as_array().cloned().unwrap_or_default() {
                    out += &csv::write_row(&[
                        s(&row["month"]),
                        m(&row["inflow"]),
                        m(&row["outflow"]),
                        m(&row["net"]),
                        m(&row["endingBalance"]),
                    ]);
                }
                r
            }
            "spending" => {
                let r = self.report_spending(p)?;
                out += &csv::write_row(&[
                    "Group".into(),
                    "Category".into(),
                    "Spent".into(),
                    "Transactions".into(),
                ]);
                for row in r["rows"].as_array().cloned().unwrap_or_default() {
                    out += &csv::write_row(&[
                        s(&row["group"]),
                        s(&row["category"]),
                        m(&row["spent"]),
                        row["transactions"].to_string(),
                    ]);
                }
                r
            }
            "balances" => {
                let r = self.report_balances(p)?;
                out += &csv::write_row(&["Account".into(), "Type".into(), "Balance".into()]);
                for row in r["rows"].as_array().cloned().unwrap_or_default() {
                    out += &csv::write_row(&[s(&row["name"]), s(&row["kind"]), m(&row["balance"])]);
                }
                r
            }
            "budgetVsActual" => {
                let r = self.report_budget_vs_actual(p)?;
                out += &csv::write_row(&[
                    "Group".into(),
                    "Category".into(),
                    "Assigned".into(),
                    "Spent".into(),
                    "Difference".into(),
                ]);
                for row in r["rows"].as_array().cloned().unwrap_or_default() {
                    out += &csv::write_row(&[
                        s(&row["group"]),
                        s(&row["category"]),
                        m(&row["assigned"]),
                        m(&row["spent"]),
                        m(&row["difference"]),
                    ]);
                }
                r
            }
            "transactions" => return self.csv_export(p),
            other => return Err(format!("unknown report '{other}'")),
        };
        let _ = data;
        Ok(json!({ "csv": out, "currency": setting(&self.conn, "currency") }))
    }
}
