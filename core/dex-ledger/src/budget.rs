// =============================================================================
// DEX Ledger — envelope budget.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Terms (shown verbatim in the UI):
//! - **Assigned**: money given to a category for the month.
//! - **Activity**: what was spent from (negative) or refunded to (positive)
//!   the category during the month. Transfers are never activity.
//! - **Available**: everything assigned to the category up to and including
//!   the month, plus all its activity up to and including the month. It rolls
//!   forward unchanged — leftover money stays, overspending stays negative
//!   until covered.
//! - **To assign**: opening balances of all accounts + money received in
//!   income categories up to the month − everything assigned up to the month.

use crate::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::collections::HashMap;

fn month_arg(p: &Value) -> R<String> {
    let m = req_s(p, "month")?;
    if !dates::is_valid_month(&m) {
        return Err(format!("'{m}' is not a valid month (YYYY-MM)"));
    }
    Ok(m)
}

fn sum_map(c: &Connection, sql: &str, month: &str) -> R<HashMap<i64, i64>> {
    let mut st = c.prepare(sql).map_err(err)?;
    let rows = st
        .query_map([month], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
        .map_err(err)?;
    let mut m = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(err)?;
        m.insert(k, v);
    }
    Ok(m)
}

pub(crate) fn to_assign(c: &Connection, month: &str) -> R<i64> {
    c.query_row(
        "SELECT
            COALESCE((SELECT SUM(opening_balance) FROM accounts WHERE substr(opening_date, 1, 7) <= ?1), 0)
          + COALESCE((SELECT SUM(l.amount) FROM cat_lines l JOIN categories c ON c.id = l.category_id JOIN category_groups g ON g.id = c.group_id
                       WHERE g.kind = 'income' AND substr(l.date, 1, 7) <= ?1), 0)
          - COALESCE((SELECT SUM(amount) FROM allocations WHERE month <= ?1), 0)",
        [month],
        |r| r.get(0),
    )
    .map_err(err)
}

/// Available for one category at the end of `month`.
pub(crate) fn available(c: &Connection, cat: i64, month: &str) -> R<i64> {
    c.query_row(
        "SELECT COALESCE((SELECT SUM(amount) FROM allocations WHERE category_id = ?1 AND month <= ?2), 0)
              + COALESCE((SELECT SUM(amount) FROM cat_lines WHERE category_id = ?1 AND substr(date, 1, 7) <= ?2), 0)",
        params![cat, month],
        |r| r.get(0),
    )
    .map_err(err)
}

fn expense_category(c: &Connection, id: i64) -> R<()> {
    let (kind, _) = Ledger::category_kind(c, id)?;
    if kind != "expense" {
        return Err("Income categories receive money; they aren't assigned a budget".into());
    }
    Ok(())
}

fn put_allocation(c: &Connection, cat: i64, month: &str, amount: i64) -> R<()> {
    if amount == 0 {
        c.execute(
            "DELETE FROM allocations WHERE category_id = ?1 AND month = ?2",
            params![cat, month],
        )
        .map_err(err)?;
    } else {
        c.execute(
            "INSERT INTO allocations (category_id, month, amount) VALUES (?1, ?2, ?3)
             ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount",
            params![cat, month, amount],
        )
        .map_err(err)?;
    }
    Ok(())
}

fn get_allocation(c: &Connection, cat: i64, month: &str) -> R<i64> {
    Ok(c.query_row(
        "SELECT amount FROM allocations WHERE category_id = ?1 AND month = ?2",
        params![cat, month],
        |r| r.get(0),
    )
    .optional()
    .map_err(err)?
    .unwrap_or(0))
}

impl Ledger {
    pub(crate) fn budget_month(&self, p: &Value) -> R<Value> {
        let month = month_arg(p)?;
        let prev = dates::shift_month(&month, -1).ok_or("bad month")?;
        let c = &self.conn;
        let assigned = sum_map(
            c,
            "SELECT category_id, amount FROM allocations WHERE month = ?1",
            &month,
        )?;
        let assigned_prev = sum_map(
            c,
            "SELECT category_id, amount FROM allocations WHERE month = ?1",
            &prev,
        )?;
        let activity = sum_map(c, "SELECT category_id, SUM(amount) FROM cat_lines WHERE category_id IS NOT NULL AND substr(date,1,7) = ?1 GROUP BY category_id", &month)?;
        let activity_prev = sum_map(c, "SELECT category_id, SUM(amount) FROM cat_lines WHERE category_id IS NOT NULL AND substr(date,1,7) = ?1 GROUP BY category_id", &prev)?;
        let alloc_to = sum_map(c, "SELECT category_id, SUM(amount) FROM allocations WHERE month <= ?1 GROUP BY category_id", &month)?;
        let act_to = sum_map(c, "SELECT category_id, SUM(amount) FROM cat_lines WHERE category_id IS NOT NULL AND substr(date,1,7) <= ?1 GROUP BY category_id", &month)?;

        let mut gst = c.prepare("SELECT id, name, collapsed FROM category_groups WHERE kind = 'expense' ORDER BY sort, id").map_err(err)?;
        let groups: Vec<(i64, String, bool)> = gst
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? == 1)))
            .map_err(err)?
            .collect::<Result<_, _>>()
            .map_err(err)?;
        let mut cst = c
            .prepare(
                "SELECT id, name, archived FROM categories WHERE group_id = ?1 ORDER BY sort, id",
            )
            .map_err(err)?;

        let (mut t_assigned, mut t_activity, mut t_available, mut overspent) =
            (0i64, 0i64, 0i64, 0i64);
        let mut out_groups = Vec::new();
        for (gid, gname, collapsed) in groups {
            let cats: Vec<(i64, String, bool)> = cst
                .query_map([gid], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? == 1))
                })
                .map_err(err)?
                .collect::<Result<_, _>>()
                .map_err(err)?;
            let (mut g_assigned, mut g_activity, mut g_available) = (0i64, 0i64, 0i64);
            let mut rows = Vec::new();
            for (cid, cname, archived) in cats {
                let a = *assigned.get(&cid).unwrap_or(&0);
                let act = *activity.get(&cid).unwrap_or(&0);
                let avail = alloc_to.get(&cid).unwrap_or(&0) + act_to.get(&cid).unwrap_or(&0);
                // Archived categories stay visible while they still hold money or moved this month.
                if archived && a == 0 && act == 0 && avail == 0 {
                    continue;
                }
                if avail < 0 {
                    overspent += 1;
                }
                g_assigned += a;
                g_activity += act;
                g_available += avail;
                rows.push(json!({
                    "id": cid, "name": cname, "archived": archived,
                    "assigned": a, "activity": act, "available": avail,
                    "prevAssigned": assigned_prev.get(&cid).copied().unwrap_or(0),
                    "prevActivity": activity_prev.get(&cid).copied().unwrap_or(0),
                }));
            }
            t_assigned += g_assigned;
            t_activity += g_activity;
            t_available += g_available;
            out_groups.push(json!({ "id": gid, "name": gname, "collapsed": collapsed, "assigned": g_assigned, "activity": g_activity, "available": g_available, "categories": rows }));
        }

        let income: i64 = c
            .query_row(
                "SELECT COALESCE(SUM(l.amount), 0) FROM cat_lines l JOIN categories c ON c.id = l.category_id JOIN category_groups g ON g.id = c.group_id
                  WHERE g.kind = 'income' AND substr(l.date, 1, 7) = ?1",
                [&month],
                |r| r.get(0),
            )
            .map_err(err)?;
        let (uncat_n, uncat_sum): (i64, i64) = c
            .query_row("SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM cat_lines WHERE category_id IS NULL AND substr(date, 1, 7) = ?1", [&month], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?;
        Ok(json!({
            "month": month,
            "previousMonth": prev,
            "toAssign": to_assign(c, &month)?,
            "income": income,
            "assigned": t_assigned,
            "activity": t_activity,
            "available": t_available,
            "overspentCount": overspent,
            "uncategorizedCount": uncat_n,
            "uncategorizedAmount": uncat_sum,
            "groups": out_groups,
        }))
    }

    pub(crate) fn budget_set(&mut self, p: &Value) -> R<Value> {
        let month = month_arg(p)?;
        let cat = req_i(p, "categoryId")?;
        let amount = req_i(p, "amount")?;
        let tx = self.conn.transaction().map_err(err)?;
        expense_category(&tx, cat)?;
        let before = get_allocation(&tx, cat, &month)?;
        put_allocation(&tx, cat, &month, amount)?;
        audit(
            &tx,
            "assign",
            "category",
            Some(cat),
            json!({ "month": month, "from": before, "to": amount }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "categoryId": cat, "month": month, "assigned": amount }))
    }

    /// Move money between two categories (or to/from "To assign" when an id is
    /// null). Only money that is actually available can be moved.
    pub(crate) fn budget_move(&mut self, p: &Value) -> R<Value> {
        let month = month_arg(p)?;
        let from = opt_id(p, "fromCategoryId");
        let to = opt_id(p, "toCategoryId");
        let amount = req_i(p, "amount")?;
        if amount <= 0 {
            return Err("Enter an amount greater than zero".into());
        }
        if from.is_none() && to.is_none() {
            return Err("Choose where the money comes from or goes to".into());
        }
        if from.is_some() && from == to {
            return Err("Choose two different categories".into());
        }
        let tx = self.conn.transaction().map_err(err)?;
        match from {
            Some(f) => {
                expense_category(&tx, f)?;
                let avail = available(&tx, f, &month)?;
                if avail < amount {
                    return Err(format!(
                        "Only {avail} (minor units) is available in that category"
                    ));
                }
                let cur = get_allocation(&tx, f, &month)?;
                put_allocation(&tx, f, &month, cur - amount)?;
            }
            None => {
                let ta = to_assign(&tx, &month)?;
                if ta < amount {
                    return Err(format!("Only {ta} (minor units) is left to assign"));
                }
            }
        }
        if let Some(t) = to {
            expense_category(&tx, t)?;
            let cur = get_allocation(&tx, t, &month)?;
            put_allocation(&tx, t, &month, cur + amount)?;
        }
        audit(
            &tx,
            "move",
            "budget",
            None,
            json!({ "month": month, "from": from, "to": to, "amount": amount }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "month": month }))
    }

    /// Copy last month's assigned amounts into categories that have nothing
    /// assigned this month. Never overwrites an existing assignment.
    pub(crate) fn budget_copy_previous(&mut self, p: &Value) -> R<Value> {
        let month = month_arg(p)?;
        let prev = dates::shift_month(&month, -1).ok_or("bad month")?;
        let tx = self.conn.transaction().map_err(err)?;
        let n = tx
            .execute(
                "INSERT INTO allocations (category_id, month, amount)
                 SELECT a.category_id, ?1, a.amount FROM allocations a
                   JOIN categories c ON c.id = a.category_id
                  WHERE a.month = ?2 AND c.archived = 0
                    AND NOT EXISTS (SELECT 1 FROM allocations b WHERE b.category_id = a.category_id AND b.month = ?1)",
                params![month, prev],
            )
            .map_err(err)?;
        audit(
            &tx,
            "copy",
            "budget",
            None,
            json!({ "month": month, "from": prev, "categories": n }),
        )?;
        tx.commit().map_err(err)?;
        Ok(json!({ "copied": n }))
    }
}
