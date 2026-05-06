// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Phase 2: Direct Rust SQLite bindings via rusqlite.
// Connection pool with WAL mode, PRAGMA optimizations, multi-threaded access.
// Replaces better-sqlite3 Node.js bindings for lower overhead and true
// multi-threaded query capability.

use parking_lot::Mutex;
use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde_json::{json, Value};
use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

static POOL: OnceLock<Mutex<ConnectionPool>> = OnceLock::new();

struct ConnectionPool {
    connections: Vec<Connection>,
    db_path: String,
    max_size: usize,
}

impl ConnectionPool {
    fn new(path: &str, pool_size: usize) -> Result<Self, rusqlite::Error> {
        let mut connections = Vec::with_capacity(pool_size);
        for _ in 0..pool_size {
            let conn = Self::create_connection(path)?;
            connections.push(conn);
        }
        Ok(ConnectionPool {
            connections,
            db_path: path.to_string(),
            max_size: pool_size,
        })
    }

    fn create_connection(path: &str) -> Result<Connection, rusqlite::Error> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;

        // Performance PRAGMAs
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA mmap_size = 268435456;
             PRAGMA wal_autocheckpoint = 1000;",
        )?;

        Ok(conn)
    }

    fn acquire(&mut self) -> Result<Connection, rusqlite::Error> {
        if let Some(conn) = self.connections.pop() {
            Ok(conn)
        } else if self.connections.len() < self.max_size {
            Self::create_connection(&self.db_path)
        } else {
            // All connections in use, create a temporary one
            Self::create_connection(&self.db_path)
        }
    }

    fn release(&mut self, conn: Connection) {
        if self.connections.len() < self.max_size {
            self.connections.push(conn);
        }
        // Drop excess connections
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Open a database at the given path, creating the connection pool.
pub fn open(path: &str) -> Result<(), String> {
    if POOL.get().is_some() {
        // Already open -- close first then reopen
        close()?;
    }

    let pool = ConnectionPool::new(path, 4).map_err(|e| format!("db_open: {}", e))?;

    POOL.set(Mutex::new(pool))
        .map_err(|_| "db_open: pool already initialized".to_string())
}

/// Execute a write statement (INSERT, UPDATE, DELETE, CREATE TABLE, etc.).
/// Returns the number of rows affected.
pub fn execute(sql: &str, params_json: &str) -> Result<u32, String> {
    let pool_lock = POOL.get().ok_or("db not open")?;
    let mut pool = pool_lock.lock();
    let conn = pool.acquire().map_err(|e| format!("db_execute acquire: {}", e))?;

    let params = parse_params(params_json)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let result = conn
        .execute(sql, param_refs.as_slice())
        .map(|n| n as u32)
        .map_err(|e| format!("db_execute: {}", e));

    pool.release(conn);
    result
}

/// Execute a read query and return results as a JSON array of objects.
pub fn query(sql: &str, params_json: &str) -> Result<String, String> {
    let pool_lock = POOL.get().ok_or("db not open")?;
    let mut pool = pool_lock.lock();
    let conn = pool.acquire().map_err(|e| format!("db_query acquire: {}", e))?;

    let params = parse_params(params_json)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let result = (|| -> Result<String, String> {
        let mut stmt = conn.prepare(sql).map_err(|e| format!("db_query prepare: {}", e))?;

        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();

        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                let mut obj = serde_json::Map::new();
                for (i, name) in column_names.iter().enumerate() {
                    let val: Value = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => Value::Null,
                        Ok(rusqlite::types::ValueRef::Integer(n)) => json!(n),
                        Ok(rusqlite::types::ValueRef::Real(f)) => json!(f),
                        Ok(rusqlite::types::ValueRef::Text(t)) => {
                            json!(String::from_utf8_lossy(t))
                        }
                        Ok(rusqlite::types::ValueRef::Blob(b)) => {
                            json!(base64_encode(b))
                        }
                        Err(_) => Value::Null,
                    };
                    obj.insert(name.clone(), val);
                }
                Ok(Value::Object(obj))
            })
            .map_err(|e| format!("db_query: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            match row {
                Ok(v) => results.push(v),
                Err(e) => return Err(format!("db_query row: {}", e)),
            }
        }
        serde_json::to_string(&results).map_err(|e| format!("db_query serialize: {}", e))
    })();

    pool.release(conn);
    result
}

/// Close the database and drain the connection pool.
pub fn close() -> Result<(), String> {
    if let Some(pool_lock) = POOL.get() {
        let mut pool = pool_lock.lock();
        pool.connections.clear();
        Ok(())
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a JSON params string into a Vec of rusqlite-compatible values.
fn parse_params(params_json: &str) -> Result<Vec<SqlParam>, String> {
    if params_json.is_empty() || params_json == "[]" || params_json == "null" {
        return Ok(Vec::new());
    }
    let arr: Vec<Value> =
        serde_json::from_str(params_json).map_err(|e| format!("param parse: {}", e))?;
    Ok(arr.into_iter().map(SqlParam).collect())
}

/// Wrapper to implement ToSql for serde_json::Value.
struct SqlParam(Value);

impl rusqlite::types::ToSql for SqlParam {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        match &self.0 {
            Value::Null => Ok(rusqlite::types::ToSqlOutput::Owned(
                rusqlite::types::Value::Null,
            )),
            Value::Bool(b) => Ok(rusqlite::types::ToSqlOutput::Owned(
                rusqlite::types::Value::Integer(if *b { 1 } else { 0 }),
            )),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Ok(rusqlite::types::ToSqlOutput::Owned(
                        rusqlite::types::Value::Integer(i),
                    ))
                } else if let Some(f) = n.as_f64() {
                    Ok(rusqlite::types::ToSqlOutput::Owned(
                        rusqlite::types::Value::Real(f),
                    ))
                } else {
                    Ok(rusqlite::types::ToSqlOutput::Owned(
                        rusqlite::types::Value::Null,
                    ))
                }
            }
            Value::String(s) => Ok(rusqlite::types::ToSqlOutput::Owned(
                rusqlite::types::Value::Text(s.clone()),
            )),
            _ => {
                let s = serde_json::to_string(&self.0).unwrap_or_default();
                Ok(rusqlite::types::ToSqlOutput::Owned(
                    rusqlite::types::Value::Text(s),
                ))
            }
        }
    }
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn database_crud_roundtrip() {
        let path = "/tmp/dex_test_db.sqlite";
        let _ = fs::remove_file(path);

        open(path).expect("open");
        execute(
            "CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT, value REAL)",
            "[]",
        )
        .expect("create table");

        execute(
            "INSERT INTO test (name, value) VALUES (?, ?)",
            r#"["hello", 3.14]"#,
        )
        .expect("insert");

        let rows = query("SELECT * FROM test WHERE name = ?", r#"["hello"]"#).expect("query");
        assert!(rows.contains("hello"));
        assert!(rows.contains("3.14"));

        close().expect("close");
        let _ = fs::remove_file(path);
    }
}
