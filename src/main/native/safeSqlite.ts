// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// safeSqlite -- crash-safe loader for the better-sqlite3 native addon.
//
// A top-level `import Database from 'better-sqlite3'` throws at MODULE-LOAD time
// if the prebuilt binary is missing or incompatible (wrong arch, missing VC++
// runtime, antivirus quarantine). Because that happens while main.js's
// dependency graph is being required -- before any try/catch or process guard
// is installed -- it kills the whole main process at startup. That is one of
// the "DEX won't open on some machines" failure modes.
//
// Every manager that needs SQLite imports the default from THIS module instead
// of 'better-sqlite3'. The native require is contained here; if it fails,
// constructing the returned stand-in throws a clear, catchable error at USE
// time, so each manager's existing `new Database(...)` try/catch degrades to
// its JSON/in-memory fallback instead of the process dying.
//
// `typeof import('better-sqlite3')` is a pure type query (erased at compile
// time, no runtime require), so the export keeps better-sqlite3's exact static
// types -- including `Database.Database` annotations and the non-null instance
// type from `new Database(...)` -- without reintroducing the load-time crash.
// ===========================================================================
import * as log from 'electron-log';
import type BetterSqlite3 from 'better-sqlite3';

let RealDatabase: unknown = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RealDatabase = require('better-sqlite3');
} catch (e) {
  log.warn('[safeSqlite] better-sqlite3 native module unavailable; SQLite-backed features will degrade to fallbacks:', (e as Error)?.message || e);
}

// When the addon is present this IS the real better-sqlite3 constructor. When
// it is absent, constructing throws a clear error that callers already catch.
const SafeDatabase = (RealDatabase || function SqliteUnavailable(): never {
  throw new Error('better-sqlite3 native module is unavailable on this machine');
}) as unknown as typeof import('better-sqlite3');

// Re-expose better-sqlite3's instance/option types so existing
// `Database.Database` / `Database.Statement` annotations keep resolving.
declare namespace SafeDatabase {
  export type Database = BetterSqlite3.Database;
  export type Statement = BetterSqlite3.Statement;
  export type Options = BetterSqlite3.Options;
  export type RunResult = BetterSqlite3.RunResult;
}

export = SafeDatabase;
