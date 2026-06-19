// =============================================================================
// DEX Tauri — Archive subsystem (data tier) — port of the read-only `archive:*`
// IPC handlers in src/main/services/ArchiveService.ts.
//
// SCOPE: only the two DATA channels are ported here:
//   - archive:detect (filePath)  -> "zip" | "7z" | "rar" | "tar" | "unknown"
//   - archive:list   (filePath)  -> ArchiveListResult
//
// The HEAVY channels (archive:extract / archive:create-zip / archive:tools) are
// deliberately NOT ported: they spawn external binaries (7z/unrar) and/or do
// deflate compression, which is a native-runtime concern outside this pure-data
// pass. They are honestly degraded (see dispatch()).
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

const ZIP_LOCAL_FILE_HEADER_SIG: u32 = 0x0403_4b50;
const ZIP_CENTRAL_DIR_SIG: u32 = 0x0201_4b50;
const ZIP_END_OF_CENTRAL_DIR_SIG: u32 = 0x0605_4b50;
const DAY_MS: i64 = 86_400_000;

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

// One central-directory entry as the listing needs it (mirrors CentralDirEntry).
struct CdEntry {
    name: String,
    compressed_size: u32,
    uncompressed_size: u32,
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
        let dos_time = u16le(buffer, p + 12)?;
        let dos_date = u16le(buffer, p + 14)?;
        let compressed_size = u32le(buffer, p + 20)?;
        let uncompressed_size = u32le(buffer, p + 24)?;
        let file_name_len = u16le(buffer, p + 28)? as usize;
        let extra_len = u16le(buffer, p + 30)? as usize;
        let comment_len = u16le(buffer, p + 32)? as usize;
        let name_start = p + 46;
        let name_end = name_start.checked_add(file_name_len)?;
        let name_bytes = buffer.get(name_start..name_end)?;
        let name = String::from_utf8_lossy(name_bytes).into_owned();
        let is_directory = name.ends_with('/');

        entries.push(CdEntry {
            name,
            compressed_size,
            uncompressed_size,
            modified: dos_to_unix(dos_date, dos_time),
            is_directory,
        });

        p = p
            .checked_add(46)?
            .checked_add(file_name_len)?
            .checked_add(extra_len)?
            .checked_add(comment_len)?;
    }
    // Touch the local-file-header sig constant the same way Electron's reader
    // module references it, so the contract (a real ZIP) is documented; not used
    // for listing since no data is extracted.
    let _ = ZIP_LOCAL_FILE_HEADER_SIG;
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
        // 7z / rar listing requires an external binary (heavy/native-runtime).
        // Emit the exact shape Electron returns when no tool is installed; we
        // never claim a tool is present in this pure-data tier (divergence #2).
        "7z" => json!({
            "format": "7z",
            "supported": false,
            "entries": [],
            "note": "7-Zip not installed.",
        }),
        "rar" => json!({
            "format": "rar",
            "supported": false,
            "entries": [],
            "note": "unrar / unar not installed.",
        }),
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

/// Route an `archive:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read-only DATA channels are handled;
/// every other channel in the namespace (extract / create-zip / tools) returns
/// Value::Null so the prefix route degrades honestly without faking heavy work.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    match channel {
        "archive:detect" => json!(detect_format(file_path)),
        "archive:list" => list(file_path),
        // Heavy channels — not ported (need native runtime: external binaries /
        // deflate). Return Null; the renderer for these is not exercised in the
        // data tier.
        _ => Value::Null,
    }
}
