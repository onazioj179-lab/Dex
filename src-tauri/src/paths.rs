// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Where DEX keeps its data.
//!
//! Every native module resolves its data/config directory through
//! [`DexPaths`] instead of `app.path().app_data_dir()`. Normally that is the
//! same `%APPDATA%\com.onazioj.dex`. When the `DEX_DATA_DIR` environment
//! variable is set (test runs, CDP checks, a portable copy) everything DEX
//! writes (dex.db, dex-kv.json, search index, vault, backups) goes there
//! instead, so a test can never touch the real profile.

use std::path::PathBuf;
use tauri::{Manager, Runtime};

/// The override, if set to a non-empty value.
pub fn data_dir_override() -> Option<PathBuf> {
    std::env::var_os("DEX_DATA_DIR")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

pub trait DexPaths<R: Runtime> {
    /// `app_data_dir`, or `DEX_DATA_DIR` when set.
    fn dex_data_dir(&self) -> tauri::Result<PathBuf>;
    /// `app_config_dir`, or `DEX_DATA_DIR` when set (DEX keeps both together).
    fn dex_config_dir(&self) -> tauri::Result<PathBuf>;
}

impl<R: Runtime, M: Manager<R>> DexPaths<R> for M {
    fn dex_data_dir(&self) -> tauri::Result<PathBuf> {
        match data_dir_override() {
            Some(dir) => Ok(dir),
            None => self.path().app_data_dir(),
        }
    }
    fn dex_config_dir(&self) -> tauri::Result<PathBuf> {
        match data_dir_override() {
            Some(dir) => Ok(dir),
            None => self.path().app_config_dir(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::data_dir_override;

    #[test]
    fn override_reads_env_and_ignores_empty() {
        // Single test touching the variable, so no cross-test races.
        std::env::set_var("DEX_DATA_DIR", "");
        assert!(data_dir_override().is_none());
        std::env::set_var("DEX_DATA_DIR", "C:/tmp/dex-test");
        assert_eq!(data_dir_override().unwrap(), std::path::PathBuf::from("C:/tmp/dex-test"));
        std::env::remove_var("DEX_DATA_DIR");
        assert!(data_dir_override().is_none());
    }
}
