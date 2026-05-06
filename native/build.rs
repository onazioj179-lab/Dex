extern crate napi_build;

fn main() {
    // ── Compile AXL C solid geometry kernel ───────────────────────────────
    // Pure C mesh kernel (like Blender's core). Compiled to a static lib,
    // linked into the final .node binary so Rust can call it via FFI.
    cc::Build::new()
        .file("src/c/axl_solid.c")
        .include("src/c")
        .opt_level(3)
        .warnings(true)
        .flag_if_supported("-std=c11")
        .flag_if_supported("-ffast-math")
        .compile("axl_solid");

    // On Windows with GNU toolchain, napi-build expects libnode.dll which doesn't
    // ship with standard Node.js. We generate a GNU import library from a .def file
    // using dlltool, then set LIBNODE_PATH so napi-build finds it.
    #[cfg(target_os = "windows")]
    {
        let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
        if target_env == "gnu" {
            prepare_windows_gnu();
        }
    }

    napi_build::setup();
}

#[cfg(target_os = "windows")]
fn prepare_windows_gnu() {
    use std::path::PathBuf;
    use std::process::Command;

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set"));
    let libnode_dir = out_dir.join("libnode");
    std::fs::create_dir_all(&libnode_dir).expect("Failed to create libnode dir");

    // Write .def file with Node-API exports (stable ABI)
    let def_content = generate_napi_def();
    let def_path = libnode_dir.join("node.def");
    std::fs::write(&def_path, &def_content).expect("Failed to write node.def");

    // Find dlltool in Rust GNU toolchain
    let dlltool = find_dlltool();
    eprintln!("Using dlltool: {}", dlltool);

    // Generate GNU import library from .def file
    // This creates libnode.dll.a which the GNU linker uses to resolve NAPI symbols
    // The -D flag specifies that symbols come from node.exe (the host process)
    let import_lib = libnode_dir.join("libnode.dll.a");
    let status = Command::new(&dlltool)
        .args([
            "-d",
            &def_path.to_string_lossy(),
            "-D",
            "node.exe",
            "-l",
            &import_lib.to_string_lossy(),
            "-m",
            "i386:x86-64",
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            eprintln!(
                "Generated GNU import library: {}",
                import_lib.to_string_lossy()
            );
        }
        Ok(s) => {
            eprintln!("Warning: dlltool exited with status {}", s);
        }
        Err(e) => {
            eprintln!("Warning: dlltool failed: {}", e);
        }
    }

    // Create dummy libnode.dll to satisfy napi-build's file existence check.
    // The actual linking uses libnode.dll.a (the import library) not this file.
    let dummy_dll = libnode_dir.join("libnode.dll");
    if !dummy_dll.exists() {
        // Create minimal valid PE stub (MZ header)
        let _ = std::fs::write(&dummy_dll, b"MZ");
    }

    // Set LIBNODE_PATH so napi-build's search_libnode_path() finds our directory
    std::env::set_var("LIBNODE_PATH", &libnode_dir);
    eprintln!("Set LIBNODE_PATH={}", libnode_dir.display());
}

#[cfg(target_os = "windows")]
fn find_dlltool() -> String {
    // Check PATH first
    if let Ok(output) = std::process::Command::new("where")
        .arg("dlltool")
        .output()
    {
        if output.status.success() {
            if let Ok(path) = String::from_utf8(output.stdout) {
                if let Some(first_line) = path.lines().next() {
                    let p = first_line.trim();
                    if !p.is_empty() {
                        return p.to_string();
                    }
                }
            }
        }
    }

    // Look in Rust GNU toolchain's self-contained directory
    if let Ok(home) = std::env::var("USERPROFILE") {
        let toolchain_path = std::path::PathBuf::from(&home)
            .join(".rustup")
            .join("toolchains")
            .join("stable-x86_64-pc-windows-gnu")
            .join("lib")
            .join("rustlib")
            .join("x86_64-pc-windows-gnu")
            .join("bin")
            .join("self-contained")
            .join("dlltool.exe");
        if toolchain_path.exists() {
            return toolchain_path.to_string_lossy().to_string();
        }
    }

    // Try rustup home
    if let Ok(rustup_home) = std::env::var("RUSTUP_HOME") {
        let toolchain_path = std::path::PathBuf::from(&rustup_home)
            .join("toolchains")
            .join("stable-x86_64-pc-windows-gnu")
            .join("lib")
            .join("rustlib")
            .join("x86_64-pc-windows-gnu")
            .join("bin")
            .join("self-contained")
            .join("dlltool.exe");
        if toolchain_path.exists() {
            return toolchain_path.to_string_lossy().to_string();
        }
    }

    "dlltool".to_string()
}

/// Generate a .def file with all Node-API v9 exports.
/// These are the stable N-API symbols exported by node.exe/electron.exe.
#[cfg(target_os = "windows")]
fn generate_napi_def() -> String {
    let symbols = [
        // Module registration
        "napi_module_register",
        "napi_fatal_error",
        "napi_fatal_exception",
        // Error handling
        "napi_create_error",
        "napi_create_type_error",
        "napi_create_range_error",
        "napi_throw",
        "napi_throw_error",
        "napi_throw_type_error",
        "napi_throw_range_error",
        "napi_is_error",
        "napi_is_exception_pending",
        "napi_get_and_clear_last_exception",
        "napi_get_last_error_info",
        // Lifecycle
        "napi_get_version",
        "napi_get_node_version",
        "napi_get_uv_event_loop",
        "napi_add_env_cleanup_hook",
        "napi_remove_env_cleanup_hook",
        "napi_add_async_cleanup_hook",
        "napi_remove_async_cleanup_hook",
        // Handle scopes
        "napi_open_handle_scope",
        "napi_close_handle_scope",
        "napi_open_escapable_handle_scope",
        "napi_close_escapable_handle_scope",
        "napi_escape_handle",
        // References
        "napi_create_reference",
        "napi_delete_reference",
        "napi_reference_ref",
        "napi_reference_unref",
        "napi_get_reference_value",
        // Value creation
        "napi_create_int32",
        "napi_create_uint32",
        "napi_create_int64",
        "napi_create_double",
        "napi_create_bigint_int64",
        "napi_create_bigint_uint64",
        "napi_create_bigint_words",
        "napi_create_string_latin1",
        "napi_create_string_utf8",
        "napi_create_string_utf16",
        "napi_create_symbol",
        // Value getters
        "napi_get_value_int32",
        "napi_get_value_uint32",
        "napi_get_value_int64",
        "napi_get_value_double",
        "napi_get_value_bool",
        "napi_get_value_bigint_int64",
        "napi_get_value_bigint_uint64",
        "napi_get_value_bigint_words",
        "napi_get_value_string_latin1",
        "napi_get_value_string_utf8",
        "napi_get_value_string_utf16",
        "napi_get_value_external",
        // Type checking
        "napi_typeof",
        "napi_is_array",
        "napi_is_arraybuffer",
        "napi_is_buffer",
        "napi_is_dataview",
        "napi_is_date",
        "napi_is_detached_arraybuffer",
        "napi_is_promise",
        "napi_is_typedarray",
        "napi_strict_equals",
        // Coercion
        "napi_coerce_to_bool",
        "napi_coerce_to_number",
        "napi_coerce_to_object",
        "napi_coerce_to_string",
        // Global/special values
        "napi_get_undefined",
        "napi_get_null",
        "napi_get_boolean",
        "napi_get_global",
        // Objects
        "napi_create_object",
        "napi_get_prototype",
        "napi_get_property",
        "napi_set_property",
        "napi_has_property",
        "napi_delete_property",
        "napi_has_own_property",
        "napi_get_named_property",
        "napi_set_named_property",
        "napi_has_named_property",
        "napi_get_property_names",
        "napi_get_all_property_names",
        "napi_define_properties",
        "napi_object_freeze",
        "napi_object_seal",
        "napi_type_tag_object",
        "napi_check_object_type_tag",
        // Arrays
        "napi_create_array",
        "napi_create_array_with_length",
        "napi_get_array_length",
        "napi_get_element",
        "napi_set_element",
        "napi_has_element",
        "napi_delete_element",
        // Functions
        "napi_create_function",
        "napi_call_function",
        "napi_get_cb_info",
        "napi_get_new_target",
        "napi_new_instance",
        "napi_instanceof",
        // Classes
        "napi_define_class",
        "napi_wrap",
        "napi_unwrap",
        "napi_remove_wrap",
        "napi_add_finalizer",
        // External
        "napi_create_external",
        // Buffer / ArrayBuffer / TypedArray / DataView
        "napi_create_buffer",
        "napi_create_buffer_copy",
        "napi_create_external_buffer",
        "napi_get_buffer_info",
        "napi_create_arraybuffer",
        "napi_create_external_arraybuffer",
        "napi_get_arraybuffer_info",
        "napi_detach_arraybuffer",
        "napi_create_typedarray",
        "napi_get_typedarray_info",
        "napi_create_dataview",
        "napi_get_dataview_info",
        // Date
        "napi_create_date",
        "napi_get_date_value",
        // Promises
        "napi_create_promise",
        "napi_resolve_deferred",
        "napi_reject_deferred",
        // Script execution
        "napi_run_script",
        // Memory management
        "napi_adjust_external_memory",
        // Async operations
        "napi_async_init",
        "napi_async_destroy",
        "napi_make_callback",
        "napi_create_async_work",
        "napi_delete_async_work",
        "napi_queue_async_work",
        "napi_cancel_async_work",
        // Callback scope
        "napi_open_callback_scope",
        "napi_close_callback_scope",
        // Thread-safe functions
        "napi_create_threadsafe_function",
        "napi_get_threadsafe_function_context",
        "napi_call_threadsafe_function",
        "napi_acquire_threadsafe_function",
        "napi_release_threadsafe_function",
        "napi_unref_threadsafe_function",
        "napi_ref_threadsafe_function",
        // Node-API extensions
        "node_api_get_module_file_name",
        "node_api_create_syntax_error",
        "node_api_throw_syntax_error",
        // Property
        "napi_create_string_utf8",
    ];

    let mut def = String::from("LIBRARY node.exe\nEXPORTS\n");
    let mut seen = std::collections::HashSet::new();
    for sym in &symbols {
        if seen.insert(*sym) {
            def.push_str("    ");
            def.push_str(sym);
            def.push('\n');
        }
    }
    def
}
