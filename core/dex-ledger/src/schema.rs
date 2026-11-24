// =============================================================================
// DEX Ledger — schema migrations.
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Versioned with `PRAGMA user_version`. Each migration runs inside one SQLite
//! transaction together with its version bump, so a crash mid-migration leaves
//! the previous schema intact. Never edit a shipped migration; append a new one.

use rusqlite::Connection;

pub const CURRENT_VERSION: i64 = 1;

const V1: &str = r#"
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE accounts (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
    kind            TEXT NOT NULL CHECK (kind IN ('cash','checking','savings','credit','other')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    opening_date    TEXT NOT NULL,
    archived        INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
    notes           TEXT NOT NULL DEFAULT '',
    sort            INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

CREATE TABLE category_groups (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL CHECK (length(trim(name)) > 0),
    kind      TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
    sort      INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
    id       INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES category_groups(id) ON DELETE RESTRICT,
    name     TEXT NOT NULL CHECK (length(trim(name)) > 0),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
    sort     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (group_id, name)
);

CREATE TABLE reconciliations (
    id                INTEGER PRIMARY KEY,
    account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    statement_date    TEXT NOT NULL,
    statement_balance INTEGER NOT NULL,
    cleared_balance   INTEGER NOT NULL,
    txn_count         INTEGER NOT NULL,
    adjustment_txn    INTEGER,
    undone            INTEGER NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL
);

CREATE TABLE transactions (
    id                INTEGER PRIMARY KEY,
    account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    date              TEXT NOT NULL CHECK (date GLOB '[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
    payee             TEXT NOT NULL DEFAULT '',
    memo              TEXT NOT NULL DEFAULT '',
    amount            INTEGER NOT NULL,
    category_id       INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
    status            TEXT NOT NULL DEFAULT 'uncleared' CHECK (status IN ('uncleared','cleared','reconciled')),
    is_transfer       INTEGER NOT NULL DEFAULT 0 CHECK (is_transfer IN (0,1)),
    transfer_peer     INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    is_split          INTEGER NOT NULL DEFAULT 0 CHECK (is_split IN (0,1)),
    import_id         TEXT,
    reconciliation_id INTEGER REFERENCES reconciliations(id) ON DELETE SET NULL,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    CHECK (NOT (is_transfer = 1 AND (category_id IS NOT NULL OR is_split = 1))),
    CHECK (NOT (is_split = 1 AND category_id IS NOT NULL))
);
CREATE INDEX idx_txn_account_date ON transactions(account_id, date);
CREATE INDEX idx_txn_date ON transactions(date);
CREATE INDEX idx_txn_category ON transactions(category_id);
CREATE UNIQUE INDEX idx_txn_import ON transactions(account_id, import_id) WHERE import_id IS NOT NULL;

CREATE TABLE splits (
    id          INTEGER PRIMARY KEY,
    txn_id      INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
    amount      INTEGER NOT NULL,
    memo        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_splits_txn ON splits(txn_id);
CREATE INDEX idx_splits_category ON splits(category_id);

CREATE TABLE attachments (
    id         INTEGER PRIMARY KEY,
    txn_id     INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    file_name  TEXT NOT NULL,
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    data       BLOB NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX idx_attach_txn ON attachments(txn_id);

CREATE TABLE allocations (
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month       TEXT NOT NULL CHECK (month GLOB '[12][0-9][0-9][0-9]-[01][0-9]'),
    amount      INTEGER NOT NULL,
    PRIMARY KEY (category_id, month)
);

CREATE TABLE recurring (
    id                  INTEGER PRIMARY KEY,
    account_id          INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    transfer_account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    payee               TEXT NOT NULL DEFAULT '',
    memo                TEXT NOT NULL DEFAULT '',
    amount              INTEGER NOT NULL CHECK (amount <> 0),
    category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    frequency           TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly')),
    next_date           TEXT NOT NULL,
    created_at          INTEGER NOT NULL
);

CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY,
    ts        INTEGER NOT NULL,
    action    TEXT NOT NULL,
    entity    TEXT NOT NULL,
    entity_id INTEGER,
    detail    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_ts ON audit_log(ts);

-- Every categorised money movement, one row per category line: plain
-- transactions contribute themselves, split transactions contribute each split.
-- Transfers move money between accounts and never appear here.
CREATE VIEW cat_lines AS
    SELECT t.id AS txn_id, t.account_id, t.date, t.category_id, t.amount
      FROM transactions t
     WHERE t.is_transfer = 0 AND t.is_split = 0
    UNION ALL
    SELECT t.id, t.account_id, t.date, s.category_id, s.amount
      FROM splits s JOIN transactions t ON t.id = s.txn_id
     WHERE t.is_transfer = 0 AND t.is_split = 1;
"#;

const MIGRATIONS: &[(i64, &str)] = &[(1, V1)];

pub fn user_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("PRAGMA user_version", [], |r| r.get(0))
}

/// Bring the database to `CURRENT_VERSION`. Refuses a database written by a
/// newer DEX (it would not understand its schema).
pub fn migrate(conn: &mut Connection) -> Result<i64, String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    let mut v = user_version(conn).map_err(|e| e.to_string())?;
    if v > CURRENT_VERSION {
        return Err(format!(
            "This ledger was created by a newer DEX (schema {v}, this build supports {CURRENT_VERSION}). Update DEX to open it."
        ));
    }
    for (ver, sql) in MIGRATIONS {
        if *ver <= v {
            continue;
        }
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql)
            .map_err(|e| format!("migration {ver} failed: {e}"))?;
        tx.execute_batch(&format!("PRAGMA user_version = {ver};"))
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        v = *ver;
    }
    Ok(v)
}
