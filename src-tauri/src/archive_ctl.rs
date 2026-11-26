// =============================================================================
// DEX Tauri — Archive subsystem — full port of the `archive:*` IPC handlers in
// src/main/services/ArchiveService.ts.
//
// SCOPE: all five channels are ported here:
//   - archive:detect     (filePath)            -> ArchiveFormat string
//   - archive:list       (filePath)            -> ArchiveListResult
//   - archive:extract    (filePath, outputDir) -> ArchiveOperationResult
//   - archive:create-zip (files[], outputPath) -> ArchiveOperationResult
//   - archive:tools      ()                    -> { sevenZip, unrar }
//
// The HEAVY channels are now implemented with REAL native code:
//   - ZIP extract: parse the central directory, raw-inflate each entry
//     (flate2 DeflateDecoder == Node `zlib.inflateRawSync`), with the SAME
//     zip-slip path sanitisation and zip-bomb (ratio + per-entry cap) guards
//     ArchiveService.ts enforces, then write under outputDir.
//   - ZIP create: build a byte-for-byte ZIP (local headers + central directory
//     + EOCD) with CRC-32 and raw-deflate (flate2 DeflateEncoder == Node
//     `zlib.deflateRawSync`, level 6), choosing stored vs deflate exactly as
//     buildZip() does.
//   - 7z / rar extract: shell out via std::process::Command (console hidden on
//     Windows, CREATE_NO_WINDOW) to a discovered system binary, mirroring
//     ArchiveService.runExternal; absent the tool, the same error result is
//     returned.
//   - tool discovery: probe `7z`/`7za` and `unrar`/`unar` with a `--help` spawn
//     (allow-listed names), cached per process, matching findTool/findSevenZip/
//     findUnrar.
//
// STORAGE: ArchiveService.ts is STATELESS — every handler operates directly on a
// caller-supplied file path and persists nothing. There is therefore no
// electron-store / DataStore / fs-json file to mirror; the nominal
// `archive-state.json` storage slot has no backing data in the Electron source,
// so nothing is read or written here. (Documented divergence #1.)
//
// RETURN SHAPES (matched exactly to ArchiveService.ts):
//   detectFormat -> bare string (one of the ArchiveFormat union members).
//   list -> {
//     format: ArchiveFormat,
//     entries: ArchiveEntry[],          // { name, size, compressedSize,
//                                       //   isDirectory, modified }
//     supported: boolean,
//     note?: string                     // only present when Electron set it
//   }
//
// ZIP listing is done in pure std by parsing the End-of-Central-Directory and
// Central Directory records (the SAME byte layout as readZipCentralDirectory in
// ArchiveService.ts). NO decompression is performed for a listing, so no zlib /
// added dependency is needed — only entry metadata is read.
//
// DIVERGENCES (documented):
//   1. No persisted state (see STORAGE above) — the Electron service has none.
//   2. 7z / rar listing in Electron shells out to external tools when present.
//      That is a heavy/native-runtime path; here those formats always report the
//      tool-missing branch Electron itself returns when no binary is found:
//        7z  -> { format:"7z",  supported:false, entries:[], note:"7-Zip not installed." }
//        rar -> { format:"rar", supported:false, entries:[], note:"unrar / unar not installed." }
//      i.e. we never claim a tool is available. The shape is byte-identical to
//      Electron's missing-tool result, so the renderer is unchanged.
//   3. dosToUnix in Electron uses `new Date(y,m,d,h,mi,s)` (LOCAL time). To stay
//      tz-crate-free, `modified` is computed in UTC (Howard Hinnant
//      days_from_civil). For ZIP DOS timestamps this differs from the Electron
//      value by the host's local UTC offset — same precedent as the analytics
//      UTC-bucketing divergence. Field name/type (number, epoch millis) match.
// =============================================================================

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const ZIP_LOCAL_FILE_HEADER_SIG: u32 = 0x0403_4b50;
const ZIP_CENTRAL_DIR_SIG: u32 = 0x0201_4b50;
const ZIP_END_OF_CENTRAL_DIR_SIG: u32 = 0x0605_4b50;
const DAY_MS: i64 = 86_400_000;

// zip-bomb guards — identical thresholds to ArchiveService.ts.
const ZIP_BOMB_RATIO: u64 = 100; // refuse if uncompressed > 100x compressed
const ZIP_BOMB_MAX_BYTES: u64 = 5 * 1024 * 1024 * 1024; // 5 GiB hard cap per entry

// --- little-endian readers (bounds-checked) ---------------------------------

fn u16le(b: &[u8], at: usize) -> Option<u16> {
    let s = b.get(at..at + 2)?;
    Some(u16::from_le_bytes([s[0], s[1]]))
}

fn u32le(b: &[u8], at: usize) -> Option<u32> {
    let s = b.get(at..at + 4)?;
    Some(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

// detectFormat(filePath) — extension sniff, lowercased. Order/precedence match
// the Electron implementation exactly.
fn detect_format(file_path: &str) -> &'static str {
    let lower = file_path.to_lowercase();
    let ends = |suffix: &str| lower.ends_with(suffix);
    if ends(".zip") || ends(".jar") || ends(".apk") {
        "zip"
    } else if ends(".7z") {
        "7z"
    } else if ends(".rar") {
        "rar"
    } else if ends(".tar") || ends(".tar.gz") || ends(".tgz") || ends(".tar.bz2") {
        "tar"
    } else {
        "unknown"
    }
}

// dosToUnix(dosDate, dosTime): DOS date/time -> epoch millis.
// DOS date: bits 0-4 day, 5-8 month, 9-15 year (since 1980).
// DOS time: bits 0-4 sec/2, 5-10 min, 11-15 hour.
// Computed in UTC (see divergence #3).
fn dos_to_unix(dos_date: u16, dos_time: u16) -> i64 {
    let day = (dos_date & 0x1f) as i64;
    let month = (((dos_date >> 5) & 0x0f) as i64) - 1; // 0-based month, as Electron
    let year = (((dos_date >> 9) & 0x7f) as i64) + 1980;
    let sec = ((dos_time & 0x1f) as i64) * 2;
    let min = ((dos_time >> 5) & 0x3f) as i64;
    let hour = ((dos_time >> 11) & 0x1f) as i64;

    // new Date(year, month/*0-based*/, day, hour, min, sec) -> map to a civil
    // (y, m/*1-based*/, d) midnight then add the intraday seconds, all in UTC.
    let m1 = month + 1; // back to 1-based for days_from_civil
    let days = days_from_civil(year, m1, day);
    days * DAY_MS + (hour * 3600 + min * 60 + sec) * 1000
}

// Howard Hinnant days_from_civil (1-based month). Same algorithm DEX uses
// elsewhere (cmd_export_bundle / analytics parse_date_ms).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let yy = if m <= 2 { y - 1 } else { y };
    let era = (if yy >= 0 { yy } else { yy - 399 }) / 400;
    let yoe = yy - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

// One central-directory entry (mirrors CentralDirEntry). Carries everything the
// listing AND the extractor need (compression method + local-header offset).
struct CdEntry {
    name: String,
    compression_method: u16,
    compressed_size: u32,
    uncompressed_size: u32,
    crc32: u32,
    local_header_offset: u32,
    modified: i64,
    is_directory: bool,
}

// readZipCentralDirectory(buffer): parse EOCD + central directory. Returns None
// on any malformed/out-of-bounds read (the Electron code throws; for a data
// listing we instead surface an unsupported result — see list_zip).
fn read_zip_central_directory(buffer: &[u8]) -> Option<Vec<CdEntry>> {
    if buffer.len() < 22 {
        return None;
    }
    // Find EOCD scanning backwards from end, max 64K window (matches 65557).
    let max_scan = buffer.len().min(65557);
    let start = buffer.len().saturating_sub(max_scan);
    let mut eocd: Option<usize> = None;
    let mut i = buffer.len() - 22;
    loop {
        if u32le(buffer, i) == Some(ZIP_END_OF_CENTRAL_DIR_SIG) {
            eocd = Some(i);
            break;
        }
        if i == 0 || i <= start {
            break;
        }
        i -= 1;
    }
    let eocd = eocd?;

    let total_entries = u16le(buffer, eocd + 10)? as usize;
    let cd_size = u32le(buffer, eocd + 12)? as usize;
    let cd_offset = u32le(buffer, eocd + 16)? as usize;
    if cd_offset.checked_add(cd_size)? > buffer.len() {
        return None;
    }

    let mut entries = Vec::with_capacity(total_entries);
    let mut p = cd_offset;
    for _ in 0..total_entries {
        if u32le(buffer, p)? != ZIP_CENTRAL_DIR_SIG {
            return None;
        }
        let compression_method = u16le(buffer, p + 10)?;
        let dos_time = u16le(buffer, p + 12)?;
        let dos_date = u16le(buffer, p + 14)?;
        let compressed_size = u32le(buffer, p + 20)?;
        let crc32 = u32le(buffer, p + 16)?;
        let uncompressed_size = u32le(buffer, p + 24)?;
        let file_name_len = u16le(buffer, p + 28)? as usize;
        let extra_len = u16le(buffer, p + 30)? as usize;
        let comment_len = u16le(buffer, p + 32)? as usize;
        let local_header_offset = u32le(buffer, p + 42)?;
        let name_start = p + 46;
        let name_end = name_start.checked_add(file_name_len)?;
        let name_bytes = buffer.get(name_start..name_end)?;
        let name = String::from_utf8_lossy(name_bytes).into_owned();
        let is_directory = name.ends_with('/');

        entries.push(CdEntry {
            name,
            compression_method,
            compressed_size,
            uncompressed_size,
            crc32,
            local_header_offset,
            modified: dos_to_unix(dos_date, dos_time),
            is_directory,
        });

        p = p
            .checked_add(46)?
            .checked_add(file_name_len)?
            .checked_add(extra_len)?
            .checked_add(comment_len)?;
    }
    Some(entries)
}

// list(filePath) for the ZIP path. Mirrors ArchiveService.list's zip branch.
fn list_zip(file_path: &str) -> Value {
    let buffer = match std::fs::read(file_path) {
        Ok(b) => b,
        // Electron would throw (fs.readFileSync); over IPC the renderer sees a
        // rejected invoke. Here we degrade to an unsupported, noted result so the
        // dispatcher returns a shaped object rather than panicking.
        Err(e) => {
            return json!({
                "format": "zip",
                "supported": false,
                "entries": [],
                "note": format!("Cannot read file: {}", e),
            });
        }
    };
    match read_zip_central_directory(&buffer) {
        Some(cd) => {
            let entries: Vec<Value> = cd
                .into_iter()
                .map(|e| {
                    json!({
                        "name": e.name,
                        "size": e.uncompressed_size,
                        "compressedSize": e.compressed_size,
                        "isDirectory": e.is_directory,
                        "modified": e.modified,
                    })
                })
                .collect();
            json!({
                "format": "zip",
                "supported": true,
                "entries": entries,
            })
        }
        None => json!({
            "format": "zip",
            "supported": false,
            "entries": [],
            "note": "Not a ZIP archive (no end-of-central-directory record).",
        }),
    }
}

// list(filePath) — full mirror of ArchiveService.list across all formats.
fn list(file_path: &str) -> Value {
    match detect_format(file_path) {
        "zip" => list_zip(file_path),
        // 7z: list via the discovered binary (`7z l -slt`), parsing the -slt
        // key=value blocks exactly as listViaSevenZip does. Absent the tool,
        // Electron's missing-tool result.
        "7z" => match find_seven_zip() {
            Some(tool) => list_via_seven_zip(file_path, &tool),
            None => json!({
                "format": "7z",
                "supported": false,
                "entries": [],
                "note": "7-Zip not installed.",
            }),
        },
        // rar: Electron returns supported:true with an empty entry set + note
        // when unrar/unar is present (it does not enumerate); the missing-tool
        // result otherwise. Mirror both.
        "rar" => match find_unrar() {
            Some(_) => json!({
                "format": "rar",
                "supported": true,
                "entries": [],
                "note": "Listing RAR via external tool — extract to enumerate.",
            }),
            None => json!({
                "format": "rar",
                "supported": false,
                "entries": [],
                "note": "unrar / unar not installed.",
            }),
        },
        // tar + unknown both hit Electron's final "Unsupported archive format."
        // branch (list() has no tar case), with format echoed back.
        other => json!({
            "format": other,
            "supported": false,
            "entries": [],
            "note": "Unsupported archive format.",
        }),
    }
}

// =============================================================================
// External-tool discovery (cached) — port of findTool / findSevenZip / findUnrar
// =============================================================================

// Per-process cache of probed tool names -> resolved name (Some) / missing
// (None). Mirrors EXTERNAL_TOOL_CACHE in ArchiveService.ts.
static TOOL_CACHE: Mutex<Option<Vec<(String, Option<String>)>>> = Mutex::new(None);

fn cache_get(name: &str) -> Option<Option<String>> {
    let guard = TOOL_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .as_ref()
        .and_then(|v| v.iter().find(|(k, _)| k == name).map(|(_, val)| val.clone()))
}

fn cache_put(name: &str, val: Option<String>) {
    let mut guard = TOOL_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let v = guard.get_or_insert_with(Vec::new);
    if let Some(slot) = v.iter_mut().find(|(k, _)| k == name) {
        slot.1 = val;
    } else {
        v.push((name.to_string(), val));
    }
}

// A std::process::Command with the console window hidden on Windows
// (CREATE_NO_WINDOW), the precedent in power.rs `run`.
fn hidden_command(program: &str) -> std::process::Command {
    let cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        return cmd;
    }
    #[allow(unreachable_code)]
    cmd
}

// findTool(name): allow-listed probe (`name --help`). Names with anything other
// than [a-z0-9_-] are rejected. Many tools exit 1 on --help, so status 0 or 1
// both count as present. Cached per process.
fn find_tool(name: &str) -> Option<String> {
    if !name
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
        || name.is_empty()
    {
        return None;
    }
    if let Some(cached) = cache_get(name) {
        return cached;
    }
    let mut cmd = hidden_command(name);
    cmd.arg("--help");
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    let resolved = match cmd.output() {
        Ok(out) => {
            let code = out.status.code();
            if code == Some(0) || code == Some(1) {
                Some(name.to_string())
            } else {
                None
            }
        }
        Err(_) => None,
    };
    cache_put(name, resolved.clone());
    resolved
}

fn find_seven_zip() -> Option<String> {
    find_tool("7z").or_else(|| find_tool("7za"))
}

fn find_unrar() -> Option<String> {
    find_tool("unrar").or_else(|| find_tool("unar"))
}

// listViaSevenZip(filePath, tool): run `tool l -slt filePath`, parse the -slt
// key=value blocks into ArchiveEntry rows.
fn list_via_seven_zip(file_path: &str, tool: &str) -> Value {
    let mut cmd = hidden_command(tool);
    cmd.args(["l", "-slt", file_path]);
    cmd.stdin(std::process::Stdio::null());
    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => {
            return json!({
                "format": "7z",
                "supported": false,
                "entries": [],
                "note": "7z spawn failed.",
            });
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries: Vec<Value> = Vec::new();
    // Blocks are separated by blank lines (\n\n / \r\n\r\n).
    for block in stdout.replace("\r\n", "\n").split("\n\n") {
        let mut path_val: Option<String> = None;
        let mut size = 0i64;
        let mut packed = 0i64;
        let mut attrs = String::new();
        let mut modified = 0i64;
        for line in block.lines() {
            let Some(eq) = line.find('=') else { continue };
            let key = line[..eq].trim();
            let val = line[eq + 1..].trim();
            match key {
                "Path" => path_val = Some(val.to_string()),
                "Size" => size = val.parse::<i64>().unwrap_or(0),
                "Packed Size" => packed = val.parse::<i64>().unwrap_or(0),
                "Attributes" => attrs = val.to_string(),
                "Modified" => modified = parse_seven_zip_date(val),
                _ => {}
            }
        }
        if let Some(name) = path_val {
            entries.push(json!({
                "name": name,
                "size": size,
                "compressedSize": packed,
                "isDirectory": attrs.contains('D'),
                "modified": modified,
            }));
        }
    }
    json!({ "format": "7z", "supported": true, "entries": entries })
}

// Parse 7-Zip's `Modified` field ("YYYY-MM-DD HH:MM:SS") to epoch millis (UTC),
// mirroring `Date.parse(map.Modified)`. Returns 0 when absent/unparseable
// (matches `map.Modified ? Date.parse(...) : 0`). Computed in UTC to stay
// tz-crate-free (same divergence #3 caveat as ZIP DOS timestamps).
fn parse_seven_zip_date(s: &str) -> i64 {
    let s = s.trim();
    if s.is_empty() {
        return 0;
    }
    let mut parts = s.split([' ', 'T']);
    let Some(date) = parts.next() else { return 0 };
    let time = parts.next().unwrap_or("00:00:00");
    let mut d = date.split('-');
    let (Some(y), Some(mo), Some(da)) = (d.next(), d.next(), d.next()) else {
        return 0;
    };
    let mut t = time.split(':');
    let (h, mi, se) = (
        t.next().unwrap_or("0"),
        t.next().unwrap_or("0"),
        t.next().unwrap_or("0"),
    );
    let (Ok(y), Ok(mo), Ok(da)) = (y.parse::<i64>(), mo.parse::<i64>(), da.parse::<i64>()) else {
        return 0;
    };
    let h = h.parse::<i64>().unwrap_or(0);
    let mi = mi.parse::<i64>().unwrap_or(0);
    let se = se.parse::<i64>().unwrap_or(0);
    days_from_civil(y, mo, da) * DAY_MS + (h * 3600 + mi * 60 + se) * 1000
}

// =============================================================================
// Path safety (zip-slip) — port of safeJoin
// =============================================================================

// safeJoin(targetDir, entryName): resolve entryName under targetDir, rejecting
// any `..` segment, absolute escape, or path that resolves outside the base.
// Returns None on an unsafe path (Electron returns null).
fn safe_join(target_dir: &Path, entry_name: &str) -> Option<PathBuf> {
    let cleaned = entry_name.replace('\\', "/");
    let cleaned = cleaned.trim_start_matches('/');
    if cleaned.split('/').any(|seg| seg == "..") {
        return None;
    }
    let base = match target_dir.canonicalize() {
        Ok(b) => b,
        // If the base does not yet exist canonicalize fails; fall back to the
        // logical path (it was just created with mkdir -p before extraction).
        Err(_) => target_dir.to_path_buf(),
    };
    let mut resolved = base.clone();
    for seg in cleaned.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        resolved.push(seg);
    }
    // Guard: the resolved path must stay within (or equal) the base.
    if resolved == base || resolved.starts_with(&base) {
        Some(resolved)
    } else {
        None
    }
}

// =============================================================================
// ZIP extract (native) — port of ArchiveService.extract zip branch
// =============================================================================

// readLocalFileData + inflateEntry combined: locate the entry's compressed
// bytes via its local-file header, then return the decompressed data.
fn inflate_entry(buffer: &[u8], entry: &CdEntry) -> Result<Vec<u8>, String> {
    let lf = entry.local_header_offset as usize;
    if u32le(buffer, lf) != Some(ZIP_LOCAL_FILE_HEADER_SIG) {
        return Err("ZIP local-file-header signature mismatch.".to_string());
    }
    let file_name_len = u16le(buffer, lf + 26).ok_or("Truncated local header.")? as usize;
    let extra_len = u16le(buffer, lf + 28).ok_or("Truncated local header.")? as usize;
    let data_start = lf
        .checked_add(30)
        .and_then(|x| x.checked_add(file_name_len))
        .and_then(|x| x.checked_add(extra_len))
        .ok_or("Local header overflow.")?;
    let data_end = data_start
        .checked_add(entry.compressed_size as usize)
        .ok_or("Compressed size overflow.")?;
    let compressed = buffer
        .get(data_start..data_end)
        .ok_or("ZIP entry data out of bounds.")?;
    let data = match entry.compression_method {
        0 => compressed.to_vec(),
        8 => {
            // deflate — raw (RFC 1951), Node `zlib.inflateRawSync`.
            let mut dec = flate2::read::DeflateDecoder::new(compressed)
                .take(u64::from(entry.uncompressed_size) + 1);
            let mut out = Vec::new();
            dec.read_to_end(&mut out)
                .map_err(|e| format!("inflate failed: {}", e))?;
            out
        }
        m => return Err(format!("Unsupported ZIP compression method: {}", m)),
    };
    if data.len() != entry.uncompressed_size as usize || crc32(&data) != entry.crc32 {
        return Err("ZIP entry size or checksum is invalid.".into());
    }
    Ok(data)
}

pub(crate) fn read_zip_parts(
    buffer: &[u8],
    limit: usize,
    select: impl Fn(&str) -> bool,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let entries = read_zip_central_directory(buffer).ok_or("Could not open the Word document package.")?;
    let mut total = 0usize;
    let mut seen = std::collections::HashSet::new();
    let mut parts = Vec::new();
    for entry in entries.into_iter().filter(|entry| !entry.is_directory && select(&entry.name)) {
        if !seen.insert(entry.name.clone()) {
            return Err("The document package contains duplicate parts.".into());
        }
        total = total.saturating_add(entry.uncompressed_size as usize);
        if total > limit || parts.len() >= 256 {
            return Err("The imported document exceeds the Notes import size limit.".into());
        }
        let data = inflate_entry(buffer, &entry)?;
        parts.push((entry.name, data));
    }
    Ok(parts)
}

fn op_result(success: bool, entry_count: i64, output_path: &str, error: Option<String>) -> Value {
    let mut v = json!({
        "success": success,
        "entryCount": entry_count,
        "outputPath": output_path,
    });
    if let Some(e) = error {
        v["error"] = json!(e);
    }
    v
}

fn extract_zip(file_path: &str, output_dir: &str) -> Value {
    let buffer = match std::fs::read(file_path) {
        Ok(b) => b,
        Err(e) => {
            return op_result(false, 0, output_dir, Some(e.to_string()));
        }
    };
    let entries = match read_zip_central_directory(&buffer) {
        Some(e) => e,
        None => {
            return op_result(
                false,
                0,
                output_dir,
                Some("Not a ZIP archive (no end-of-central-directory record).".to_string()),
            );
        }
    };
    let out_base = Path::new(output_dir);
    let mut count = 0i64;
    for entry in &entries {
        if entry.uncompressed_size as u64 > ZIP_BOMB_MAX_BYTES {
            return op_result(
                false,
                0,
                output_dir,
                Some(format!(
                    "Refusing entry > {} bytes: {}",
                    ZIP_BOMB_MAX_BYTES, entry.name
                )),
            );
        }
        if entry.compressed_size > 0
            && (entry.uncompressed_size as u64) / (entry.compressed_size as u64) > ZIP_BOMB_RATIO
        {
            return op_result(
                false,
                0,
                output_dir,
                Some(format!("Refusing zip-bomb-ratio entry: {}", entry.name)),
            );
        }
        let dest = match safe_join(out_base, &entry.name) {
            Some(d) => d,
            None => {
                return op_result(
                    false,
                    0,
                    output_dir,
                    Some(format!("Refusing unsafe path: {}", entry.name)),
                );
            }
        };
        if entry.is_directory {
            if let Err(e) = std::fs::create_dir_all(&dest) {
                return op_result(false, 0, output_dir, Some(e.to_string()));
            }
            continue;
        }
        if let Some(parent) = dest.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return op_result(false, 0, output_dir, Some(e.to_string()));
            }
        }
        let data = match inflate_entry(&buffer, entry) {
            Ok(d) => d,
            Err(e) => return op_result(false, 0, output_dir, Some(e)),
        };
        if let Err(e) = std::fs::write(&dest, &data) {
            return op_result(false, 0, output_dir, Some(e.to_string()));
        }
        count += 1;
    }
    op_result(true, count, output_dir, None)
}

// Walk outputDir counting files (best-effort), mirroring runExternal's post-run
// entry count.
fn count_files(dir: &Path) -> i64 {
    let mut count = 0i64;
    let Ok(rd) = std::fs::read_dir(dir) else {
        return count;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_dir() {
            count += count_files(&p);
        } else {
            count += 1;
        }
    }
    count
}

// runExternal(tool, args, outputDir): spawn the tool, success on exit 0 with a
// best-effort file count, otherwise the trimmed stderr / `exit <code>`.
fn run_external(tool: &str, args: &[String], output_dir: &str) -> Value {
    let mut cmd = hidden_command(tool);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    let output = match cmd.output() {
        Ok(o) => o,
        Err(e) => return op_result(false, 0, output_dir, Some(e.to_string())),
    };
    if output.status.success() {
        let count = count_files(Path::new(output_dir));
        op_result(true, count, output_dir, None)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let trimmed = stderr.trim();
        let err = if trimmed.is_empty() {
            match output.status.code() {
                Some(c) => format!("exit {}", c),
                None => "exit (signal)".to_string(),
            }
        } else {
            trimmed.to_string()
        };
        op_result(false, 0, output_dir, Some(err))
    }
}

// extract(filePath, outputDir) — full mirror of ArchiveService.extract.
fn extract(file_path: &str, output_dir: &str) -> Value {
    // mkdirSync(outputDir, { recursive: true })
    if let Err(e) = std::fs::create_dir_all(output_dir) {
        return op_result(false, 0, output_dir, Some(e.to_string()));
    }
    match detect_format(file_path) {
        "zip" => extract_zip(file_path, output_dir),
        "7z" => match find_seven_zip() {
            Some(tool) => run_external(
                &tool,
                &[
                    "x".to_string(),
                    file_path.to_string(),
                    format!("-o{}", output_dir),
                    "-y".to_string(),
                ],
                output_dir,
            ),
            None => op_result(false, 0, output_dir, Some("7-Zip not installed.".to_string())),
        },
        "rar" => match find_unrar() {
            Some(tool) => {
                let args: Vec<String> = if tool == "unar" {
                    vec![
                        "-quiet".to_string(),
                        "-output-directory".to_string(),
                        output_dir.to_string(),
                        "-force-overwrite".to_string(),
                        file_path.to_string(),
                    ]
                } else {
                    // unrar: trailing separator on the destination (Electron uses
                    // outputDir + path.sep).
                    let mut dest = output_dir.to_string();
                    if !dest.ends_with(std::path::MAIN_SEPARATOR) {
                        dest.push(std::path::MAIN_SEPARATOR);
                    }
                    vec![
                        "x".to_string(),
                        "-y".to_string(),
                        file_path.to_string(),
                        dest,
                    ]
                };
                run_external(&tool, &args, output_dir)
            }
            None => op_result(
                false,
                0,
                output_dir,
                Some("unrar / unar not installed.".to_string()),
            ),
        },
        other => op_result(
            false,
            0,
            output_dir,
            Some(format!("Unsupported format: {}", other)),
        ),
    }
}

// =============================================================================
// ZIP create (native) — port of buildZip / createZip
// =============================================================================

// CRC-32 (IEEE) table, built once. Same polynomial/order as ArchiveService.ts.
fn crc32(buf: &[u8]) -> u32 {
    static TABLE: Mutex<Option<[u32; 256]>> = Mutex::new(None);
    let table = {
        let mut guard = TABLE.lock().unwrap_or_else(|e| e.into_inner());
        *guard.get_or_insert_with(|| {
            let mut t = [0u32; 256];
            for (n, slot) in t.iter_mut().enumerate() {
                let mut c = n as u32;
                for _ in 0..8 {
                    c = if c & 1 != 0 {
                        0xedb8_8320 ^ (c >> 1)
                    } else {
                        c >> 1
                    };
                }
                *slot = c;
            }
            t
        })
    };
    let mut c: u32 = 0xffff_ffff;
    for &b in buf {
        c = table[((c ^ b as u32) & 0xff) as usize] ^ (c >> 8);
    }
    c ^ 0xffff_ffff
}

// raw deflate (RFC 1951) at level 6 — Node `zlib.deflateRawSync(data,{level:6})`.
fn deflate_raw(data: &[u8]) -> Vec<u8> {
    let mut enc = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::new(6));
    if enc.write_all(data).is_err() {
        return data.to_vec();
    }
    enc.finish().unwrap_or_else(|_| data.to_vec())
}

// unixToDos(mtime millis): epoch millis (UTC) -> (dosDate, dosTime). Electron
// uses local-time getters; computed here in UTC for tz-crate-freedom (same
// divergence #3 caveat). Years before 1980 clamp to 1980 (year field 0).
fn unix_to_dos(epoch_ms: i64) -> (u16, u16) {
    let secs = epoch_ms.div_euclid(1000);
    let days = secs.div_euclid(DAY_MS / 1000);
    let rem = secs.rem_euclid(DAY_MS / 1000);
    let (y, mo, da) = civil_from_days(days);
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;
    let year = (y - 1980).max(0) as u16;
    let dos_date =
        ((year & 0x7f) << 9) | (((mo as u16) & 0x0f) << 5) | ((da as u16) & 0x1f);
    let dos_time =
        (((hour as u16) & 0x1f) << 11) | (((min as u16) & 0x3f) << 5) | (((sec / 2) as u16) & 0x1f);
    (dos_date, dos_time)
}

// Inverse of days_from_civil (Howard Hinnant). Returns (year, month/*1-based*/,
// day) for a count of days since the Unix epoch.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

struct PendingZipEntry {
    name: String,
    payload: Vec<u8>, // bytes actually written (stored data OR deflate output)
    uncompressed_len: u32,
    method: u16,
    crc32: u32,
    dos_date: u16,
    dos_time: u16,
    local_offset: u32,
}

fn write_u16(out: &mut Vec<u8>, v: u16) {
    out.extend_from_slice(&v.to_le_bytes());
}
fn write_u32(out: &mut Vec<u8>, v: u32) {
    out.extend_from_slice(&v.to_le_bytes());
}

impl PendingZipEntry {
    fn new(name: String, data: Vec<u8>, modified: i64) -> Self {
        let compressed = deflate_raw(&data);
        let use_store = compressed.len() >= data.len();
        let (dos_date, dos_time) = unix_to_dos(modified);
        Self {
            name,
            crc32: crc32(&data),
            uncompressed_len: data.len() as u32,
            payload: if use_store { data } else { compressed },
            method: if use_store { 0 } else { 8 },
            dos_date,
            dos_time,
            local_offset: 0,
        }
    }
}

pub(crate) fn zip_parts(parts: &[(&str, &[u8])]) -> Vec<u8> {
    encode_zip(parts.iter().map(|(name, data)| {
        PendingZipEntry::new((*name).to_owned(), data.to_vec(), 0)
    }).collect())
}

// buildZip(files): assemble a complete ZIP (local headers + central directory +
// EOCD) in memory. `files[i].0` = in-archive name, `files[i].1` = on-disk path.
fn build_zip(files: &[(String, String)]) -> Result<Vec<u8>, String> {
    let mut pending: Vec<PendingZipEntry> = Vec::new();
    for (name, abs_path) in files {
        let meta = match std::fs::metadata(abs_path) {
            Ok(m) => m,
            Err(e) => return Err(format!("{}: {}", abs_path, e)),
        };
        if meta.is_dir() {
            continue; // buildZip skips directories
        }
        let data = std::fs::read(abs_path).map_err(|e| format!("{}: {}", abs_path, e))?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        pending.push(PendingZipEntry::new(name.replace('\\', "/"), data, modified));
    }
    Ok(encode_zip(pending))
}

fn encode_zip(mut pending: Vec<PendingZipEntry>) -> Vec<u8> {
    let mut body: Vec<u8> = Vec::new();
    for e in pending.iter_mut() {
        e.local_offset = body.len() as u32;
        let name_bytes = e.name.as_bytes();
        write_u32(&mut body, ZIP_LOCAL_FILE_HEADER_SIG);
        write_u16(&mut body, 20); // version needed
        write_u16(&mut body, 0x0800); // bit 11 = UTF-8
        write_u16(&mut body, e.method);
        write_u16(&mut body, e.dos_time);
        write_u16(&mut body, e.dos_date);
        write_u32(&mut body, e.crc32);
        write_u32(&mut body, e.payload.len() as u32);
        write_u32(&mut body, e.uncompressed_len);
        write_u16(&mut body, name_bytes.len() as u16);
        write_u16(&mut body, 0); // extra field length
        body.extend_from_slice(name_bytes);
        body.extend_from_slice(&e.payload);
    }

    let cd_start = body.len() as u32;
    for e in &pending {
        let name_bytes = e.name.as_bytes();
        write_u32(&mut body, ZIP_CENTRAL_DIR_SIG);
        write_u16(&mut body, 20); // version made by
        write_u16(&mut body, 20); // version needed
        write_u16(&mut body, 0x0800); // bit 11 = UTF-8
        write_u16(&mut body, e.method);
        write_u16(&mut body, e.dos_time);
        write_u16(&mut body, e.dos_date);
        write_u32(&mut body, e.crc32);
        write_u32(&mut body, e.payload.len() as u32);
        write_u32(&mut body, e.uncompressed_len);
        write_u16(&mut body, name_bytes.len() as u16);
        write_u16(&mut body, 0); // extra field length
        write_u16(&mut body, 0); // file comment length
        write_u16(&mut body, 0); // disk number start
        write_u16(&mut body, 0); // internal attrs
        write_u32(&mut body, 0); // external attrs
        write_u32(&mut body, e.local_offset);
        body.extend_from_slice(name_bytes);
    }
    let cd_size = body.len() as u32 - cd_start;

    write_u32(&mut body, ZIP_END_OF_CENTRAL_DIR_SIG);
    write_u16(&mut body, 0); // disk number
    write_u16(&mut body, 0); // cd start disk
    write_u16(&mut body, pending.len() as u16); // entries on disk
    write_u16(&mut body, pending.len() as u16); // total entries
    write_u32(&mut body, cd_size);
    write_u32(&mut body, cd_start);
    write_u16(&mut body, 0); // comment length

    body
}

// createZip(files, outputPath) — full mirror of ArchiveService.createZip.
fn create_zip(files: &[(String, String)], output_path: &str) -> Value {
    let buffer = match build_zip(files) {
        Ok(b) => b,
        Err(e) => return op_result(false, 0, output_path, Some(e)),
    };
    if let Some(parent) = Path::new(output_path).parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return op_result(false, 0, output_path, Some(e.to_string()));
            }
        }
    }
    if let Err(e) = std::fs::write(output_path, &buffer) {
        return op_result(false, 0, output_path, Some(e.to_string()));
    }
    // entryCount mirrors Electron: files.length (NOT the post-skip count).
    op_result(true, files.len() as i64, output_path, None)
}

// Parse the create-zip `files` argument: an array of { name, absPath } objects.
fn parse_zip_files(arg: Option<&Value>) -> Vec<(String, String)> {
    let Some(Value::Array(items)) = arg else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let name = item.get("name")?.as_str()?.to_string();
            let abs = item.get("absPath")?.as_str()?.to_string();
            Some((name, abs))
        })
        .collect()
}

/// Route an `archive:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). All five handlers are ported:
///   detect/list (data), extract/create-zip (native ZIP + external 7z/rar),
///   tools (binary discovery).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg0 = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    match channel {
        "archive:detect" => json!(detect_format(arg0)),
        "archive:list" => list(arg0),
        // extract(filePath, outputDir)
        "archive:extract" => {
            let output_dir = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            extract(arg0, output_dir)
        }
        // create-zip(files[], outputPath)
        "archive:create-zip" => {
            let files = parse_zip_files(args.get(0));
            let output_path = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            create_zip(&files, output_path)
        }
        // tools() -> { sevenZip, unrar } — false when missing (Electron returns
        // the resolved name string or `false`).
        "archive:tools" => json!({
            "sevenZip": find_seven_zip().map(Value::String).unwrap_or(Value::Bool(false)),
            "unrar": find_unrar().map(Value::String).unwrap_or(Value::Bool(false)),
        }),
        _ => Value::Null,
    }
}
