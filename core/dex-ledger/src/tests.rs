// DEX Ledger — engine tests. Every test runs against a fresh in-memory ledger
// (and a temp backup folder); nothing touches a real profile.

use super::*;
use serde_json::json;

fn tmpdir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("dex-ledger-test-{tag}-{}-{}", std::process::id(), now_ms()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn ledger(tag: &str) -> Ledger {
    let mut l = Ledger::open_in_memory(&tmpdir(tag)).unwrap();
    ok(&mut l, "ledger:setup", json!({ "currency": "EUR" }));
    l
}

fn ok(l: &mut Ledger, ch: &str, p: Value) -> Value {
    let r = l.dispatch(ch, &json!([p]));
    assert_eq!(r["ok"], true, "{ch} failed: {}", r["error"]);
    r["data"].clone()
}

fn fail(l: &mut Ledger, ch: &str, p: Value) -> String {
    let r = l.dispatch(ch, &json!([p]));
    assert_eq!(r["ok"], false, "{ch} unexpectedly succeeded");
    r["error"].as_str().unwrap_or("").to_string()
}

fn cat(l: &mut Ledger, name: &str) -> i64 {
    let groups = ok(l, "ledger:categories:list", json!({}));
    for g in groups.as_array().unwrap() {
        for c in g["categories"].as_array().unwrap() {
            if c["name"] == name {
                return c["id"].as_i64().unwrap();
            }
        }
    }
    panic!("no category {name}");
}

fn account(l: &mut Ledger, name: &str, kind: &str, opening: i64) -> i64 {
    ok(l, "ledger:accounts:create", json!({ "name": name, "kind": kind, "openingBalance": opening, "openingDate": "2026-01-01" }))["id"].as_i64().unwrap()
}

fn balance(l: &mut Ledger, id: i64) -> i64 {
    let list = ok(l, "ledger:accounts:list", json!({}));
    list.as_array().unwrap().iter().find(|a| a["id"] == id).unwrap()["balance"].as_i64().unwrap()
}

#[test]
fn setup_seeds_categories_and_rejects_bad_currency() {
    let mut l = Ledger::open_in_memory(&tmpdir("setup")).unwrap();
    assert_eq!(ok(&mut l, "ledger:status", json!({}))["ready"], false);
    assert!(fail(&mut l, "ledger:setup", json!({ "currency": "euro" })).contains("ISO 4217"));
    let s = ok(&mut l, "ledger:setup", json!({ "currency": "jpy" }));
    assert_eq!(s["currency"], "JPY");
    assert_eq!(s["digits"], 0);
    let groups = ok(&mut l, "ledger:categories:list", json!({}));
    let names: Vec<&str> = groups.as_array().unwrap().iter().map(|g| g["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Everyday", "Bills", "Savings", "Personal", "Income"]);
    // No accounts or transactions are invented.
    assert_eq!(ok(&mut l, "ledger:accounts:list", json!({})).as_array().unwrap().len(), 0);
}

#[test]
fn balances_and_transfers_are_exact_and_not_income() {
    let mut l = ledger("transfer");
    let chk = account(&mut l, "Current", "checking", 100_000);
    let sav = account(&mut l, "Savings", "savings", 0);
    let salary = cat(&mut l, "Salary");
    let food = cat(&mut l, "Groceries");
    ok(&mut l, "ledger:txns:create", json!({ "accountId": chk, "date": "2026-02-01", "payee": "Employer", "amount": 250_000, "categoryId": salary }));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": chk, "date": "2026-02-03", "payee": "Market", "amount": -4_210, "categoryId": food }));
    let t = ok(&mut l, "ledger:txns:transfer", json!({ "fromAccountId": chk, "toAccountId": sav, "date": "2026-02-05", "amount": 50_000 }));
    assert_eq!(balance(&mut l, chk), 100_000 + 250_000 - 4_210 - 50_000);
    assert_eq!(balance(&mut l, sav), 50_000);

    let rep = ok(&mut l, "ledger:reports:incomeExpense", json!({ "from": "2026-02-01", "to": "2026-02-28" }));
    assert_eq!(rep["totals"]["income"], 250_000);
    assert_eq!(rep["totals"]["expenses"], 4_210);
    let cf = ok(&mut l, "ledger:reports:cashFlow", json!({ "from": "2026-02-01", "to": "2026-02-28" }));
    assert_eq!(cf["rows"][0]["inflow"], 250_000);
    assert_eq!(cf["rows"][0]["outflow"], 4_210);
    assert_eq!(cf["closingBalance"], 100_000 + 250_000 - 4_210);

    // Editing one side moves the other; deleting removes both.
    ok(&mut l, "ledger:txns:update", json!({ "id": t["id"], "amount": -60_000 }));
    assert_eq!(balance(&mut l, sav), 60_000);
    assert!(fail(&mut l, "ledger:txns:update", json!({ "id": t["id"], "categoryId": food })).contains("Transfers"));
    ok(&mut l, "ledger:txns:delete", json!({ "ids": [t["peerId"]] }));
    assert_eq!(balance(&mut l, sav), 0);
    assert_eq!(ok(&mut l, "ledger:integrity", json!({}))["ok"], true);
}

#[test]
fn validation_rejects_bad_input() {
    let mut l = ledger("validate");
    let a = account(&mut l, "Wallet", "cash", 0);
    assert!(fail(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-30", "amount": -100 })).contains("valid date"));
    assert!(fail(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-10", "amount": 0 })).contains("zero"));
    assert!(fail(&mut l, "ledger:txns:create", json!({ "accountId": 999, "date": "2026-02-10", "amount": -1 })).contains("does not exist"));
    assert!(fail(&mut l, "ledger:txns:transfer", json!({ "fromAccountId": a, "toAccountId": a, "date": "2026-02-10", "amount": 5 })).contains("different"));
    assert!(fail(&mut l, "ledger:accounts:create", json!({ "name": "X", "kind": "crypto" })).contains("unknown account type"));
}

#[test]
fn splits_must_add_up() {
    let mut l = ledger("split");
    let a = account(&mut l, "Card", "credit", 0);
    let food = cat(&mut l, "Groceries");
    let home = cat(&mut l, "Household");
    let e = fail(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-03-01", "amount": -10_000, "splits": [{ "categoryId": food, "amount": -6_000 }, { "categoryId": home, "amount": -3_000 }] }));
    assert!(e.contains("must match"));
    let id = ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-03-01", "amount": -10_000, "splits": [{ "categoryId": food, "amount": -6_000 }, { "categoryId": home, "amount": -4_000 }] }))["id"].clone();
    let b = ok(&mut l, "ledger:budget:month", json!({ "month": "2026-03" }));
    let everyday = &b["groups"][0];
    let act = |n: &str| everyday["categories"].as_array().unwrap().iter().find(|c| c["name"] == n).unwrap()["activity"].as_i64().unwrap();
    assert_eq!(act("Groceries"), -6_000);
    assert_eq!(act("Household"), -4_000);
    let got = ok(&mut l, "ledger:txns:get", json!({ "id": id }));
    assert_eq!(got["splits"].as_array().unwrap().len(), 2);
    // Changing the amount without new lines is refused; unsplitting works.
    assert!(fail(&mut l, "ledger:txns:update", json!({ "id": id, "amount": -9_000 })).contains("split"));
    ok(&mut l, "ledger:txns:update", json!({ "id": id, "splits": [], "categoryId": food }));
    assert_eq!(ok(&mut l, "ledger:txns:get", json!({ "id": id }))["isSplit"], false);
}

#[test]
fn budget_rolls_over_and_to_assign_is_consistent() {
    let mut l = ledger("budget");
    let a = account(&mut l, "Current", "checking", 0);
    let salary = cat(&mut l, "Salary");
    let food = cat(&mut l, "Groceries");
    let rent = cat(&mut l, "Rent or mortgage");
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-01-02", "amount": 300_000, "categoryId": salary }));
    let jan = ok(&mut l, "ledger:budget:month", json!({ "month": "2026-01" }));
    assert_eq!(jan["toAssign"], 300_000);
    ok(&mut l, "ledger:budget:set", json!({ "month": "2026-01", "categoryId": food, "amount": 40_000 }));
    ok(&mut l, "ledger:budget:set", json!({ "month": "2026-01", "categoryId": rent, "amount": 120_000 }));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-01-20", "amount": -45_000, "categoryId": food }));
    let jan = ok(&mut l, "ledger:budget:month", json!({ "month": "2026-01" }));
    assert_eq!(jan["toAssign"], 300_000 - 160_000);
    assert_eq!(jan["overspentCount"], 1);
    // February: overspending of 5 000 carries forward; leftover rent carries too.
    let feb = ok(&mut l, "ledger:budget:month", json!({ "month": "2026-02" }));
    let find = |m: &Value, n: &str| m["groups"].as_array().unwrap().iter().flat_map(|g| g["categories"].as_array().unwrap().clone()).find(|c| c["name"] == n).unwrap();
    assert_eq!(find(&feb, "Groceries")["available"], -5_000);
    assert_eq!(find(&feb, "Groceries")["prevActivity"], -45_000);
    assert_eq!(find(&feb, "Rent or mortgage")["available"], 120_000);
    // Moving money: only what's available, and To assign is respected.
    assert!(fail(&mut l, "ledger:budget:move", json!({ "month": "2026-02", "fromCategoryId": food, "toCategoryId": rent, "amount": 1 })).contains("available"));
    ok(&mut l, "ledger:budget:move", json!({ "month": "2026-02", "fromCategoryId": rent, "toCategoryId": food, "amount": 5_000 }));
    let feb = ok(&mut l, "ledger:budget:month", json!({ "month": "2026-02" }));
    assert_eq!(find(&feb, "Groceries")["available"], 0);
    assert_eq!(find(&feb, "Rent or mortgage")["available"], 115_000);
    assert_eq!(feb["toAssign"], 140_000);
    assert!(fail(&mut l, "ledger:budget:move", json!({ "month": "2026-02", "toCategoryId": food, "amount": 140_001 })).contains("left to assign"));
    assert!(fail(&mut l, "ledger:budget:set", json!({ "month": "2026-02", "categoryId": salary, "amount": 1 })).contains("Income"));
    // Copy previous only fills empty months.
    let n = ok(&mut l, "ledger:budget:copyPrevious", json!({ "month": "2026-03" }));
    assert_eq!(n["copied"], 2);
}

#[test]
fn reconciled_transactions_are_locked_until_confirmed() {
    let mut l = ledger("recon");
    let a = account(&mut l, "Current", "checking", 10_000);
    let t1 = ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-04-02", "payee": "Shop", "amount": -2_500 }))["id"].clone();
    let t2 = ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-04-09", "payee": "Cafe", "amount": -700 }))["id"].clone();
    // Statement match proposes, changes nothing.
    let m = ok(&mut l, "ledger:reconcile:match", json!({ "accountId": a, "content": "Date,Description,Amount\n2026-04-03,SHOP,-25.00\n2026-04-20,Bank fee,-1.50\n" }));
    assert_eq!(m["lines"][0]["matchId"], t1);
    assert!(m["lines"][1]["matchId"].is_null());
    assert_eq!(m["unmatchedTransactions"].as_array().unwrap().len(), 1);
    assert_eq!(ok(&mut l, "ledger:txns:get", json!({ "id": t1 }))["status"], "uncleared");
    ok(&mut l, "ledger:txns:setStatus", json!({ "ids": [t1], "status": "cleared" }));
    // Statement says 7 350; cleared is 7 500 -> difference refused without adjustment.
    let e = fail(&mut l, "ledger:reconcile:finish", json!({ "accountId": a, "statementDate": "2026-04-30", "statementBalance": 7_350 }));
    assert_eq!(e, "DIFFERENCE:-150");
    let r = ok(&mut l, "ledger:reconcile:finish", json!({ "accountId": a, "statementDate": "2026-04-30", "statementBalance": 7_500 }));
    assert_eq!(r["transactions"], 1);
    assert_eq!(ok(&mut l, "ledger:txns:get", json!({ "id": t1 }))["status"], "reconciled");
    assert_eq!(ok(&mut l, "ledger:txns:get", json!({ "id": t2 }))["status"], "uncleared");
    assert!(fail(&mut l, "ledger:txns:update", json!({ "id": t1, "amount": -2_000 })).starts_with("RECONCILED"));
    assert!(fail(&mut l, "ledger:txns:delete", json!({ "ids": [t1] })).starts_with("RECONCILED"));
    ok(&mut l, "ledger:txns:update", json!({ "id": t1, "memo": "notes are fine" }));
    ok(&mut l, "ledger:txns:update", json!({ "id": t1, "amount": -2_000, "confirmReconciled": true }));
    // History + undo.
    let h = ok(&mut l, "ledger:reconcile:history", json!({ "accountId": a }));
    assert_eq!(h.as_array().unwrap().len(), 1);
    ok(&mut l, "ledger:reconcile:undo", json!({ "id": r["id"] }));
    assert_eq!(ok(&mut l, "ledger:txns:get", json!({ "id": t1 }))["status"], "cleared");
}

#[test]
fn reconcile_with_explicit_adjustment() {
    let mut l = ledger("adjust");
    let a = account(&mut l, "Current", "checking", 1_000);
    let r = ok(&mut l, "ledger:reconcile:finish", json!({ "accountId": a, "statementDate": "2026-04-30", "statementBalance": 900, "createAdjustment": true }));
    assert_eq!(r["difference"], -100);
    assert_eq!(balance(&mut l, a), 900);
}

#[test]
fn csv_import_detects_duplicates_and_round_trips() {
    let mut l = ledger("csv");
    let a = account(&mut l, "Current", "checking", 0);
    let food = cat(&mut l, "Groceries");
    let csv_text = "Date,Description,Debit,Credit,Category\n03/02/2026,Market,12.40,,Groceries\n03/02/2026,Market,12.40,,Groceries\n15/02/2026,Employer,,1500.00,\n31/02/2026,Broken,1,,\n";
    let pv = ok(&mut l, "ledger:csv:preview", json!({ "accountId": a, "content": csv_text }));
    assert_eq!(pv["dateFormat"], "dmy");
    assert_eq!(pv["dateAmbiguous"], false);
    assert_eq!(pv["errorCount"], 1);
    let rows = pv["rows"].as_array().unwrap();
    assert_eq!(rows[0]["amount"], -1240);
    assert_eq!(rows[0]["categoryId"], food);
    assert_eq!(rows[2]["amount"], 150_000);
    let good: Vec<Value> = rows.iter().filter(|r| r["error"].is_null()).cloned().collect();
    let res = ok(&mut l, "ledger:csv:import", json!({ "accountId": a, "rows": good }));
    assert_eq!(res["imported"], 3); // two identical market rows are both genuine
    assert!(res["backup"].as_str().unwrap().contains("before-import"));
    // Re-import: everything is a duplicate.
    let pv2 = ok(&mut l, "ledger:csv:preview", json!({ "accountId": a, "content": csv_text }));
    assert_eq!(pv2["duplicateCount"], 3);
    let res2 = ok(&mut l, "ledger:csv:import", json!({ "accountId": a, "rows": good }));
    assert_eq!(res2["imported"], 0);
    assert_eq!(res2["skipped"], 3);
    // Export uses plain decimals and the book currency.
    let ex = ok(&mut l, "ledger:csv:export", json!({ "accountId": a }));
    let text = ex["csv"].as_str().unwrap();
    assert!(text.starts_with("Date,Account,Payee,Category,Notes,Amount,Status,Currency"));
    assert!(text.contains("2026-02-03,Current,Market,Groceries,,-12.40,uncleared,EUR"));
    assert!(text.contains("1500.00"));
    assert_eq!(ex["count"], 3);
}

#[test]
fn ambiguous_dates_are_reported() {
    let mut l = ledger("ambig");
    let a = account(&mut l, "Current", "checking", 0);
    let pv = ok(&mut l, "ledger:csv:preview", json!({ "accountId": a, "content": "Date,Payee,Amount\n03/04/2026,A,-1\n", "dateOrder": "mdy" }));
    assert_eq!(pv["dateAmbiguous"], true);
    assert_eq!(pv["rows"][0]["date"], "2026-03-04");
    let pv = ok(&mut l, "ledger:csv:preview", json!({ "accountId": a, "content": "Date,Payee,Amount\n03/04/2026,A,-1\n", "dateFormat": "dmy" }));
    assert_eq!(pv["rows"][0]["date"], "2026-04-03");
}

#[test]
fn reports_match_stored_rows() {
    let mut l = ledger("reports");
    let a = account(&mut l, "Current", "checking", 5_000);
    let food = cat(&mut l, "Groceries");
    let salary = cat(&mut l, "Salary");
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-05-01", "amount": 10_000, "categoryId": salary }));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-05-02", "amount": -3_000, "categoryId": food }));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-05-03", "amount": 500, "categoryId": food })); // refund
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-06-10", "amount": -200 })); // uncategorised
    ok(&mut l, "ledger:budget:set", json!({ "month": "2026-05", "categoryId": food, "amount": 4_000 }));
    let sp = ok(&mut l, "ledger:reports:spending", json!({ "from": "2026-05-01", "to": "2026-06-30" }));
    assert_eq!(sp["rows"][0]["spent"], 2_500);
    assert_eq!(sp["uncategorizedSpent"], 200);
    let bva = ok(&mut l, "ledger:reports:budgetVsActual", json!({ "from": "2026-05-01", "to": "2026-05-31" }));
    assert_eq!(bva["rows"][0]["assigned"], 4_000);
    assert_eq!(bva["rows"][0]["spent"], 2_500);
    assert_eq!(bva["rows"][0]["difference"], 1_500);
    let bal = ok(&mut l, "ledger:reports:balances", json!({ "asOf": "2026-05-31" }));
    assert_eq!(bal["total"], 5_000 + 10_000 - 3_000 + 500);
    let ov = ok(&mut l, "ledger:overview", json!({ "from": "2026-05-01", "to": "2026-06-30", "today": "2026-06-15" }));
    assert_eq!(ov["income"], 10_000);
    assert_eq!(ov["expenses"], 2_500);
    assert_eq!(ov["uncategorized"], -200);
    assert_eq!(ov["net"], 10_000 - 2_500 - 200);
    assert_eq!(ov["totalBalance"], 5_000 + 10_000 - 3_000 + 500 - 200);
    let csv_out = ok(&mut l, "ledger:reports:csv", json!({ "report": "spending", "from": "2026-05-01", "to": "2026-06-30" }));
    assert!(csv_out["csv"].as_str().unwrap().contains("Everyday,Groceries,25.00,2"));
}

#[test]
fn recurring_posts_only_on_request() {
    let mut l = ledger("recurring");
    let a = account(&mut l, "Current", "checking", 0);
    let rent = cat(&mut l, "Rent or mortgage");
    let r = ok(&mut l, "ledger:recurring:create", json!({ "accountId": a, "payee": "Landlord", "amount": -90_000, "categoryId": rent, "frequency": "monthly", "nextDate": "2026-01-31" }));
    assert_eq!(ok(&mut l, "ledger:accounts:list", json!({}))[0]["transactionCount"], 0);
    let ov = ok(&mut l, "ledger:overview", json!({ "from": "2026-01-01", "to": "2026-01-31", "today": "2026-01-15" }));
    assert_eq!(ov["upcoming"].as_array().unwrap().len(), 1);
    let posted = ok(&mut l, "ledger:recurring:post", json!({ "id": r["id"] }));
    assert_eq!(posted["nextDate"], "2026-02-28");
    assert_eq!(balance(&mut l, a), -90_000);
    let skipped = ok(&mut l, "ledger:recurring:skip", json!({ "id": r["id"] }));
    assert_eq!(skipped["nextDate"], "2026-03-28");
}

#[test]
fn accounts_archive_only_when_settled() {
    let mut l = ledger("archive");
    let a = account(&mut l, "Old card", "credit", -5_000);
    assert!(fail(&mut l, "ledger:accounts:archive", json!({ "id": a })).contains("zero balance"));
    let b = account(&mut l, "Current", "checking", 10_000);
    ok(&mut l, "ledger:txns:transfer", json!({ "fromAccountId": b, "toAccountId": a, "date": "2026-02-01", "amount": 5_000 }));
    ok(&mut l, "ledger:accounts:archive", json!({ "id": a }));
    assert!(fail(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-02", "amount": -1 })).contains("archived"));
    assert!(fail(&mut l, "ledger:accounts:delete", json!({ "id": a })).contains("Archive"));
    ok(&mut l, "ledger:accounts:update", json!({ "id": b, "name": "Main account" }));
}

#[test]
fn categories_in_use_cannot_be_deleted() {
    let mut l = ledger("cats");
    let a = account(&mut l, "Current", "checking", 0);
    let groups = ok(&mut l, "ledger:categories:list", json!({}));
    let gid = groups[0]["id"].as_i64().unwrap();
    let c = ok(&mut l, "ledger:categories:create", json!({ "groupId": gid, "name": "Pets" }))["id"].as_i64().unwrap();
    assert!(fail(&mut l, "ledger:categories:create", json!({ "groupId": gid, "name": "Pets" })).contains("already exists"));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-01", "amount": -100, "categoryId": c }));
    assert!(fail(&mut l, "ledger:categories:delete", json!({ "id": c })).contains("Archive"));
    ok(&mut l, "ledger:categories:update", json!({ "id": c, "archived": true }));
    assert!(fail(&mut l, "ledger:groups:delete", json!({ "id": gid })).contains("first"));
}

#[test]
fn currency_change_refuses_to_change_value() {
    let mut l = ledger("currency");
    ok(&mut l, "ledger:settings:currency", json!({ "currency": "USD" })); // same exponent, empty
    let a = account(&mut l, "Current", "checking", 100);
    let _ = a;
    assert!(fail(&mut l, "ledger:settings:currency", json!({ "currency": "JPY" })).contains("decimal places"));
}

#[test]
fn audit_trail_records_every_change() {
    let mut l = ledger("audit");
    let a = account(&mut l, "Current", "checking", 0);
    let t = ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-01", "amount": -100 }))["id"].clone();
    ok(&mut l, "ledger:txns:delete", json!({ "ids": [t] }));
    let log = ok(&mut l, "ledger:audit:list", json!({}));
    let actions: Vec<&str> = log.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
    assert_eq!(actions[..3], ["delete", "create", "create"]);
    // The deleted row is kept in the audit entry.
    assert_eq!(log[0]["detail"]["amount"], -100);
}

#[test]
fn file_backup_and_restore_round_trip() {
    let dir = tmpdir("backup");
    let path = dir.join("ledger.db");
    let mut l = Ledger::open(&path, &dir.join("backups")).unwrap();
    ok(&mut l, "ledger:setup", json!({ "currency": "GBP" }));
    let a = account(&mut l, "Current", "checking", 1_234);
    let b = ok(&mut l, "ledger:backup:create", json!({}));
    let file = b["file"].as_str().unwrap().to_string();
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-01", "amount": -34 }));
    assert_eq!(balance(&mut l, a), 1_200);
    let r = ok(&mut l, "ledger:backup:restore", json!({ "file": file }));
    assert!(r["safetyBackup"].as_str().unwrap().contains("before-restore"));
    assert_eq!(balance(&mut l, a), 1_234);
    let list = ok(&mut l, "ledger:backup:list", json!({}));
    assert!(list.as_array().unwrap().len() >= 2);
    assert!(fail(&mut l, "ledger:backup:restore", json!({ "file": "../evil.db" })).contains("not a ledger backup"));
    // A non-ledger file is refused.
    let junk = dir.join("junk.db");
    std::fs::write(&junk, b"not sqlite").unwrap();
    assert!(l.restore_from_path(&junk).is_err());
    assert_eq!(balance(&mut l, a), 1_234);
    // Reopen from disk: data persisted.
    drop(l);
    let mut l2 = Ledger::open(&path, &dir.join("backups")).unwrap();
    assert_eq!(balance(&mut l2, a), 1_234);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn search_filters_and_sorting() {
    let mut l = ledger("search");
    let a = account(&mut l, "Current", "checking", 0);
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-01", "payee": "Coffee 100%", "amount": -350 }));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-02", "payee": "Bakery", "amount": -1_200 }));
    let r = ok(&mut l, "ledger:txns:list", json!({ "search": "100%" }));
    assert_eq!(r["total"], 1);
    let r = ok(&mut l, "ledger:txns:list", json!({ "search": "12", "searchAmount": 1200 }));
    assert_eq!(r["rows"][0]["payee"], "Bakery");
    let r = ok(&mut l, "ledger:txns:list", json!({ "sort": "amount", "dir": "asc" }));
    assert_eq!(r["rows"][0]["amount"], -1_200);
    assert_eq!(r["sum"], -1_550);
    let r = ok(&mut l, "ledger:txns:list", json!({ "categoryId": -1 }));
    assert_eq!(r["total"], 2);
    let ids: Vec<Value> = r["rows"].as_array().unwrap().iter().map(|x| x["id"].clone()).collect();
    let food = cat(&mut l, "Groceries");
    ok(&mut l, "ledger:txns:categorize", json!({ "ids": ids, "categoryId": food }));
    assert_eq!(ok(&mut l, "ledger:txns:list", json!({ "categoryId": -1 }))["total"], 0);
    assert_eq!(ok(&mut l, "ledger:txns:list", json!({ "categoryId": food }))["total"], 2);
}

#[test]
fn attachments_are_stored_and_capped() {
    let mut l = ledger("attach");
    let a = account(&mut l, "Current", "checking", 0);
    let t = ok(&mut l, "ledger:txns:create", json!({ "accountId": a, "date": "2026-02-01", "amount": -100 }))["id"].as_i64().unwrap();
    let att = l.attachment_add(t, "receipt.png", "image/png", &[1, 2, 3]).unwrap();
    let list = ok(&mut l, "ledger:attachments:list", json!({ "txnId": t }));
    assert_eq!(list[0]["size"], 3);
    let got = ok(&mut l, "ledger:attachments:get", json!({ "id": att["id"] }));
    assert_eq!(got["base64"], "AQID");
    assert!(l.attachment_add(t, "big.bin", "application/octet-stream", &vec![0u8; crate::txns::MAX_ATTACHMENT + 1]).is_err());
    ok(&mut l, "ledger:txns:delete", json!({ "ids": [t] }));
    assert!(fail(&mut l, "ledger:attachments:get", json!({ "id": att["id"] })).contains("does not exist"));
}

#[test]
fn imports_the_earlier_document_ledger() {
    let mut l = Ledger::open_in_memory(&tmpdir("legacy")).unwrap();
    // Setup screen ran first (seeded empty categories) - import still allowed.
    ok(&mut l, "ledger:setup", json!({ "currency": "EUR" }));
    let doc = json!({
        "version": 1, "currency": "EUR",
        "accounts": [
            { "id": "a1", "name": "Checking", "type": "checking", "openingMinor": 100000, "openingDate": "2026-01-01" },
            { "id": "a2", "name": "Savings", "type": "savings", "openingMinor": 0, "openingDate": "2026-01-01" },
            { "id": "a3", "name": "Mortgage", "type": "loan", "openingMinor": -500000, "openingDate": "2026-01-01", "closed": false }
        ],
        "categories": [
            { "id": "c1", "name": "Groceries", "group": "Everyday", "kind": "expense" },
            { "id": "c2", "name": "Home", "group": "Everyday", "kind": "expense" },
            { "id": "c3", "name": "Salary", "group": "Income", "kind": "income" }
        ],
        "transactions": [
            { "id": "t1", "date": "2026-01-05", "accountId": "a1", "payee": "Market", "memo": "", "status": 2, "createdAt": 1,
              "splits": [{ "categoryId": "c1", "amountMinor": -4210, "memo": "" }] },
            { "id": "t2", "date": "2026-01-06", "accountId": "a1", "transferId": "x1", "transferAccountId": "a2", "status": 0, "createdAt": 2,
              "splits": [{ "categoryId": null, "amountMinor": -10000, "memo": "" }] },
            { "id": "t3", "date": "2026-01-06", "accountId": "a2", "transferId": "x1", "transferAccountId": "a1", "status": 0, "createdAt": 2,
              "splits": [{ "categoryId": null, "amountMinor": 10000, "memo": "" }] },
            { "id": "t4", "date": "2026-01-07", "accountId": "a1", "payee": "Shop", "memo": "", "status": 1, "createdAt": 3,
              "splits": [{ "categoryId": "c1", "amountMinor": -2000, "memo": "" }, { "categoryId": "c2", "amountMinor": -1000, "memo": "bulbs" }] },
            { "id": "t5", "date": "2026-01-08", "accountId": "a1", "payee": "Employer", "memo": "", "status": 0, "createdAt": 4,
              "splits": [{ "categoryId": "c3", "amountMinor": 250000, "memo": "" }] },
            { "id": "t6", "date": "2026-01-09", "accountId": "zz", "payee": "Ghost", "status": 0, "createdAt": 5,
              "splits": [{ "categoryId": "c1", "amountMinor": -1, "memo": "" }] }
        ],
        "budgets": [ { "month": "2026-01", "categoryId": "c1", "amountMinor": 30000 } ]
    });
    let r = l.import_legacy(&doc).unwrap();
    assert_eq!(r["accounts"], 3);
    assert_eq!(r["transactions"], 5);
    assert_eq!(r["skipped"], 1);
    let accts = ok(&mut l, "ledger:accounts:list", json!({}));
    let bal = |n: &str| accts.as_array().unwrap().iter().find(|a| a["name"] == n).unwrap()["balance"].as_i64().unwrap();
    assert_eq!(bal("Checking"), 100000 - 4210 - 10000 - 3000 + 250000);
    assert_eq!(bal("Savings"), 10000);
    assert_eq!(accts.as_array().unwrap().iter().find(|a| a["name"] == "Mortgage").unwrap()["kind"], "other");
    let ie = ok(&mut l, "ledger:reports:incomeExpense", json!({ "from": "2026-01-01", "to": "2026-01-31" }));
    assert_eq!(ie["totals"]["income"], 250000);
    assert_eq!(ie["totals"]["expenses"], 7210); // transfer excluded
    let b = ok(&mut l, "ledger:budget:month", json!({ "month": "2026-01" }));
    let g = &b["groups"][0];
    assert_eq!(g["name"], "Everyday");
    let groc = g["categories"].as_array().unwrap().iter().find(|c| c["name"] == "Groceries").unwrap();
    assert_eq!(groc["assigned"], 30000);
    assert_eq!(groc["activity"], -6210);
    let t = ok(&mut l, "ledger:txns:list", json!({ "search": "Market" }));
    assert_eq!(t["rows"][0]["status"], "reconciled");
    assert_eq!(ok(&mut l, "ledger:integrity", json!({}))["ok"], true);
    // Never into a ledger that already has data.
    assert!(l.import_legacy(&doc).unwrap_err().contains("already has"));
}

#[test]
fn idempotency_key_makes_a_repeated_write_happen_once() {
    let mut l = ledger("idem");
    let acct = json!({ "name": "Main", "kind": "checking", "openingBalance": 0, "openingDate": "2026-01-01", "idempotencyKey": "k-1" });
    let a = ok(&mut l, "ledger:accounts:create", acct.clone());
    let b = ok(&mut l, "ledger:accounts:create", acct);
    assert_eq!(a["id"], b["id"], "the repeat returned the first result");
    assert_eq!(ok(&mut l, "ledger:accounts:list", json!({})).as_array().unwrap().len(), 1);

    let id = a["id"].as_i64().unwrap();
    let t = json!({ "accountId": id, "date": "2026-01-02", "payee": "Shop", "amount": -500, "idempotencyKey": "t-1" });
    let x = ok(&mut l, "ledger:txns:create", t.clone());
    let y = ok(&mut l, "ledger:txns:create", t);
    assert_eq!(x["id"], y["id"]);
    // A new key is a new write.
    ok(&mut l, "ledger:txns:create", json!({ "accountId": id, "date": "2026-01-02", "payee": "Shop", "amount": -500, "idempotencyKey": "t-2" }));
    // No key: every call writes (unchanged behaviour).
    ok(&mut l, "ledger:txns:create", json!({ "accountId": id, "date": "2026-01-02", "payee": "Shop", "amount": -500 }));
    ok(&mut l, "ledger:txns:create", json!({ "accountId": id, "date": "2026-01-02", "payee": "Shop", "amount": -500 }));
    let list = ok(&mut l, "ledger:txns:list", json!({ "accountId": id }));
    assert_eq!(list["total"], 4);
}

#[test]
fn idempotency_key_does_not_cache_a_failure() {
    let mut l = ledger("idem-fail");
    fail(&mut l, "ledger:accounts:create", json!({ "name": "", "kind": "checking", "openingBalance": 0, "openingDate": "2026-01-01", "idempotencyKey": "k" }));
    // Same key, now valid: it is written, not answered with the old error.
    ok(&mut l, "ledger:accounts:create", json!({ "name": "Main", "kind": "checking", "openingBalance": 0, "openingDate": "2026-01-01", "idempotencyKey": "k" }));
}

#[test]
fn idempotency_keys_are_per_channel() {
    let mut l = ledger("idem-ch");
    let g = ok(&mut l, "ledger:groups:create", json!({ "name": "A", "idempotencyKey": "same" }));
    let c = ok(&mut l, "ledger:categories:create", json!({ "groupId": g["id"], "name": "B", "idempotencyKey": "same" }));
    // The category write ran (not answered with the group's cached reply).
    assert_eq!(c["id"].as_i64(), Some(cat(&mut l, "B")));
}
