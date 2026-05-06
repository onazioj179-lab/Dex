// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
extern crate napi_build;

fn main() {
    // Platform detection flags for conditional compilation
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    println!("cargo:rerun-if-changed=src/");
    println!("cargo:rustc-cfg=dex_platform=\"{}\"", target_os);
    println!("cargo:rustc-cfg=dex_arch=\"{}\"", target_arch);

    // Enable SIMD feature flags on supported architectures
    if target_arch == "x86_64" {
        println!("cargo:rustc-cfg=dex_simd_available");
    }
    if target_arch == "aarch64" {
        println!("cargo:rustc-cfg=dex_neon_available");
    }

    // Windows-specific: generate node import library for GNU toolchain
    #[cfg(target_os = "windows")]
    {
        let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
        if target_env == "gnu" {
            generate_gnu_import_lib();
        }
        // Create dummy libnode.dll so napi-build's search_libnode_path() finds it
        prepare_libnode_path();
    }

    napi_build::setup();
}

#[cfg(target_os = "windows")]
fn generate_gnu_import_lib() {
    use std::io::Write;
    use std::process::Command;

    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR not set");
    let def_path = format!("{}/node_api.def", out_dir);
    let lib_path = format!("{}/libnode_api.a", out_dir);

    // Write the .def file with Node-API symbols
    let mut def = std::fs::File::create(&def_path).expect("Cannot create .def file");
    writeln!(def, "LIBRARY node.exe").ok();
    writeln!(def, "EXPORTS").ok();
    for i in 1..=9 {
        for sym in napi_symbols(i) {
            writeln!(def, "  {}", sym).ok();
        }
    }

    // Find dlltool
    let dlltool = find_dlltool().unwrap_or_else(|| "dlltool".to_string());

    let status = Command::new(&dlltool)
        .args(["-d", &def_path, "-l", &lib_path])
        .status();

    if let Ok(s) = status {
        if s.success() {
            println!("cargo:rustc-link-search=native={}", out_dir);
            println!("cargo:rustc-link-lib=static=node_api");
        }
    }
}

#[cfg(target_os = "windows")]
fn prepare_libnode_path() {
    use std::io::Write;
    use std::path::PathBuf;
    use std::process::Command;

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set"));
    let libnode_dir = out_dir.join("libnode");
    std::fs::create_dir_all(&libnode_dir).expect("Failed to create libnode dir");

    // Write .def file with Node-API exports (stable ABI)
    let def_path = libnode_dir.join("node.def");
    let mut def = std::fs::File::create(&def_path).expect("Cannot create node.def");
    writeln!(def, "LIBRARY node.exe").ok();
    writeln!(def, "EXPORTS").ok();
    for i in 1..=9 {
        for sym in napi_symbols(i) {
            writeln!(def, "  {}", sym).ok();
        }
    }
    drop(def);

    // Find dlltool
    let dlltool = find_dlltool().unwrap_or_else(|| "dlltool".to_string());

    // Generate GNU import library from .def file
    let import_lib = libnode_dir.join("libnode.dll.a");
    let status = Command::new(&dlltool)
        .args([
            "-d", &def_path.to_string_lossy(),
            "-D", "node.exe",
            "-l", &import_lib.to_string_lossy(),
            "-m", "i386:x86-64",
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            eprintln!("Generated GNU import library: {}", import_lib.display());
        }
        Ok(s) => {
            eprintln!("Warning: dlltool exited with status {}", s);
        }
        Err(e) => {
            eprintln!("Warning: dlltool failed: {}", e);
        }
    }

    // Create dummy libnode.dll to satisfy napi-build's file existence check.
    // The actual linking uses libnode.dll.a (the import library), not this file.
    let dummy_dll = libnode_dir.join("libnode.dll");
    if !dummy_dll.exists() {
        // Write a minimal valid PE file (just enough that the linker won't choke)
        let _ = std::fs::write(&dummy_dll, b"MZ");
    }

    // Set LIBNODE_PATH so napi-build's search_libnode_path() finds our directory
    unsafe { std::env::set_var("LIBNODE_PATH", &libnode_dir); }
    eprintln!("Set LIBNODE_PATH={}", libnode_dir.display());
}

#[cfg(target_os = "windows")]
fn find_dlltool() -> Option<String> {
    // Check PATH first
    if std::process::Command::new("dlltool").arg("--version").output().is_ok() {
        return Some("dlltool".to_string());
    }
    // Check Rust toolchain self-contained directory
    if let Ok(home) = std::env::var("RUSTUP_HOME") {
        let candidate = format!(
            "{}/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/dlltool.exe",
            home
        );
        if std::path::Path::new(&candidate).exists() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn napi_symbols(version: u32) -> Vec<&'static str> {
    match version {
        1 => vec![
            "napi_create_object", "napi_create_array", "napi_create_string_utf8",
            "napi_get_cb_info", "napi_get_value_string_utf8", "napi_get_value_int32",
            "napi_get_value_double", "napi_get_value_bool", "napi_set_named_property",
            "napi_get_named_property", "napi_throw_error", "napi_create_function",
            "napi_define_properties", "napi_get_undefined", "napi_get_null",
        ],
        2 => vec!["napi_get_value_bigint_int64", "napi_get_value_bigint_uint64"],
        3 => vec!["napi_add_finalizer", "napi_set_instance_data", "napi_get_instance_data"],
        4 => vec!["napi_create_threadsafe_function", "napi_call_threadsafe_function"],
        5 => vec!["napi_create_date", "napi_get_date_value"],
        6 => vec!["napi_create_bigint_int64", "napi_set_element"],
        7 => vec!["napi_detach_arraybuffer"],
        8 => vec!["napi_object_freeze", "napi_object_seal"],
        9 => vec!["node_api_get_module_file_name"],
        _ => vec![],
    }
}
