// =============================================================================
// DEX Tauri — Large File subsystem (port of the `largefile:*` IPC handlers in
// src/main/core/LargeFileReader.ts).
//
// NAME divergence (documented): the porting brief named the source
// `LargeFileHandler.ts` and the data channel `getInfo`; the real source is
// `LargeFileReader.ts` and the real channel is `largefile:info` (handler
// `getFileInfo`). This module ports that channel under its true name.
//
// HEAVY CHANNELS NOW PORTED (this round): the original module only ported the
// pure-stat `largefile:info` channel and returned Value::Null for everything
// else. LargeFileReader is, however, fully native-implementable — it keeps an
// in-memory Map of open file sessions and does chunked / line-based reads over
// arbitrary caller-supplied paths via the fs module. There are NO LLM calls,
// no IoT, no live OS windows, no sandboxed JS here, so every channel below is a
// REAL native implementation backed by std::fs + an in-process session table.
//
//   open       -> stat the path, mint a session, store it (concurrency cap +
//                 oldest-eviction). Returns { session } | { error }.
//   close      -> drop the session. Returns { success }.
//   readNext   -> read the next chunkSize bytes from currentPosition, advance.
//   readChunk  -> read an explicit [startByte,endByte) window (no session).
//   readLines  -> read up to N newline-delimited lines, advance position.
//   seek       -> set currentPosition (validated against size).
//   info       -> stat-only metadata + recommended chunk size (unchanged).
//   session    -> one session's record (or null).
//   sessions   -> all active session records.
//   setConfig  -> merge partial config into the live config.
//
// STATE: Electron's `private sessions: Map<string, FileSession>` and mutable
// `config` are mirrored by two process-global Mutexes. Electron's 60s cleanup
// interval is mirrored by LAZY pruning: before each routed channel we evict any
// session idle longer than config.sessionTimeout (compute-on-read — same
// observable effect as the timer, no thread to manage). The monotonic
// sessionCounter is a third global so ids match `lf-{Date.now()}-{counter}`.
//
// ENCODING: Electron decodes chunks with Buffer.toString('utf8'), which is
// lossy for invalid sequences; we mirror that with String::from_utf8_lossy.
//
// Helpers: std + serde_json only (no extra deps).
// =============================================================================

use crate::util::LockSafe;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::{Mutex, OnceLock};

// ---------------------------------------------------------------------------
// CONFIG (DEFAULT_CONFIG parity)
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct LargeFileConfig {
    default_chunk_size: u64,        // 64KB
    max_chunk_size: u64,            // 1MB
    session_timeout: i64,           // 5 min (ms)
    max_concurrent_sessions: usize, // 10
    line_buffer_size: usize,        // 4096
}

impl LargeFileConfig {
    fn default() -> Self {
        LargeFileConfig {
            default_chunk_size: 64 * 1024,
            max_chunk_size: 1024 * 1024,
            session_timeout: 5 * 60 * 1000,
            max_concurrent_sessions: 10,
            line_buffer_size: 4096,
        }
    }
}

fn config_store() -> &'static Mutex<LargeFileConfig> {
    static CONFIG: OnceLock<Mutex<LargeFileConfig>> = OnceLock::new();
    CONFIG.get_or_init(|| Mutex::new(LargeFileConfig::default()))
}

// ---------------------------------------------------------------------------
// SESSION TABLE (FileSession parity)
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct FileSession {
    id: String,
    file_path: String,
    size: u64,
    chunk_size: u64,
    current_position: u64,
    encoding: String, // always "utf8" — Electron never changes it
    is_open: bool,
    created: i64,
    last_access: i64,
}

impl FileSession {
    // Exact FileSession JSON shape the renderer receives.
    fn to_value(&self) -> Value {
        json!({
            "id": self.id,
            "filePath": self.file_path,
            "size": self.size,
            "chunkSize": self.chunk_size,
            "currentPosition": self.current_position,
            "encoding": self.encoding,
            "isOpen": self.is_open,
            "created": self.created,
            "lastAccess": self.last_access,
        })
    }
}

fn session_store() -> &'static Mutex<HashMap<String, FileSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, FileSession>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

// Monotonic counter mirroring `++this.sessionCounter` (so ids are stable/unique
// even within the same millisecond).
fn next_counter() -> u64 {
    static COUNTER: OnceLock<Mutex<u64>> = OnceLock::new();
    let m = COUNTER.get_or_init(|| Mutex::new(0));
    let mut c = m.lock_safe();
    *c += 1;
    *c
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

fn current_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// LargeFileReader.formatBytes — byte-for-byte: thresholds and decimal places.
fn format_bytes(bytes: u64) -> String {
    let b = bytes as f64;
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", b / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", b / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", b / (1024.0 * 1024.0 * 1024.0))
    }
}

// startSessionCleanup parity: evict sessions idle past sessionTimeout. Electron
// runs this on a 60s timer; we run it lazily before each routed channel, which
// produces the same observable session lifetime without a background thread.
fn prune_idle_sessions() {
    let timeout = config_store().lock_safe().session_timeout;
    let now = current_millis();
    let mut sessions = session_store().lock_safe();
    sessions.retain(|_, s| now - s.last_access <= timeout);
}

// closeOldestSession parity: remove the session with the smallest lastAccess.
fn close_oldest_session(sessions: &mut HashMap<String, FileSession>) {
    let oldest_id = sessions
        .values()
        .min_by_key(|s| s.last_access)
        .map(|s| s.id.clone());
    if let Some(id) = oldest_id {
        sessions.remove(&id);
    }
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:info — getFileInfo(filePath)
// ---------------------------------------------------------------------------

fn get_file_info(file_path: &str) -> Value {
    let meta = match std::fs::metadata(file_path) {
        Ok(m) => m,
        Err(_) => return Value::Null,
    };
    let size = meta.len();
    let is_large = size > 10 * 1024 * 1024; // > 10 MiB

    let default_chunk = config_store().lock_safe().default_chunk_size;
    let recommended_chunk_size: u64 = if size > 1024 * 1024 * 1024 {
        256 * 1024 // > 1 GiB
    } else if size > 100 * 1024 * 1024 {
        128 * 1024 // > 100 MiB
    } else {
        default_chunk
    };

    json!({
        "size": size,
        "sizeFormatted": format_bytes(size),
        "isLarge": is_large,
        "recommendedChunkSize": recommended_chunk_size,
    })
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:open — openSession(filePath, chunkSize?)
// ---------------------------------------------------------------------------

fn open_session(file_path: &str, chunk_size: Option<u64>) -> Value {
    let cfg = config_store().lock_safe().clone();

    // stat first; non-existent / unreadable path -> { error }.
    let meta = match std::fs::metadata(file_path) {
        Ok(m) => m,
        Err(e) => return json!({ "error": e.to_string() }),
    };
    if !meta.is_file() {
        return json!({ "error": "Not a file" });
    }

    let mut sessions = session_store().lock_safe();

    // Concurrency cap: evict the oldest before inserting (Electron does this
    // when at/over the limit prior to creating the new session).
    if sessions.len() >= cfg.max_concurrent_sessions {
        close_oldest_session(&mut sessions);
    }

    let now = current_millis();
    let session_id = format!("lf-{}-{}", now, next_counter());
    let effective_chunk_size = chunk_size
        .unwrap_or(cfg.default_chunk_size)
        .min(cfg.max_chunk_size);

    let session = FileSession {
        id: session_id.clone(),
        file_path: file_path.to_string(),
        size: meta.len(),
        chunk_size: effective_chunk_size,
        current_position: 0,
        encoding: "utf8".to_string(),
        is_open: true,
        created: now,
        last_access: now,
    };

    let value = json!({ "session": session.to_value() });
    sessions.insert(session_id, session);
    value
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:close — closeSession(sessionId)
// ---------------------------------------------------------------------------

fn close_session(session_id: &str) -> Value {
    let mut sessions = session_store().lock_safe();
    if sessions.remove(session_id).is_some() {
        json!({ "success": true })
    } else {
        json!({ "success": false })
    }
}

// ---------------------------------------------------------------------------
// Shared low-level read: read [start, start+length) from path, return the bytes
// actually read plus the true file size (mirrors fd.read + fd.stat). Caps the
// allocation at maxChunkSize-ish via the caller's `length`.
// ---------------------------------------------------------------------------

fn read_window(file_path: &str, start: u64, length: usize) -> Result<(Vec<u8>, u64), String> {
    let mut f = File::open(file_path).map_err(|e| e.to_string())?;
    let total_size = f.metadata().map_err(|e| e.to_string())?.len();
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; length];
    let mut filled = 0usize;
    // read() may return short; loop until the window is filled or EOF.
    while filled < length {
        match f.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) => return Err(e.to_string()),
        }
    }
    buf.truncate(filled);
    Ok((buf, total_size))
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:readChunk — readChunk(request)
// request: { filePath, startByte, endByte, encoding? }
// On success: ChunkResult. On the size-cap violation Electron throws, so the
// renderer's invoke rejects -> we surface { error } (honest failure shape).
// ---------------------------------------------------------------------------

fn read_chunk(request: &Value) -> Value {
    let file_path = request.get("filePath").and_then(|v| v.as_str()).unwrap_or("");
    let start_byte = request.get("startByte").and_then(|v| v.as_u64()).unwrap_or(0);
    let end_byte = request.get("endByte").and_then(|v| v.as_u64()).unwrap_or(0);

    let max_chunk = config_store().lock_safe().max_chunk_size;
    let length = end_byte.saturating_sub(start_byte);

    if length > max_chunk {
        return json!({
            "error": format!(
                "Chunk size exceeds maximum ({} > {})",
                format_bytes(length),
                format_bytes(max_chunk)
            )
        });
    }

    read_chunk_inner(file_path, start_byte, length as usize)
}

fn read_chunk_inner(file_path: &str, start_byte: u64, length: usize) -> Value {
    match read_window(file_path, start_byte, length) {
        Ok((bytes, total_size)) => {
            let bytes_read = bytes.len() as u64;
            let actual_end_byte = start_byte + bytes_read;
            let is_last_chunk = actual_end_byte >= total_size;
            json!({
                "content": String::from_utf8_lossy(&bytes).to_string(),
                "startByte": start_byte,
                "endByte": actual_end_byte,
                "totalSize": total_size,
                "isLastChunk": is_last_chunk,
            })
        }
        Err(e) => json!({ "error": e }),
    }
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:readNext — readNextChunk(sessionId)
// ---------------------------------------------------------------------------

fn read_next_chunk(session_id: &str) -> Value {
    // Pull the data we need under the lock, then release before the read so a
    // long read does not block the whole table.
    let (file_path, start_byte, chunk_size, size) = {
        let mut sessions = session_store().lock_safe();
        let session = match sessions.get_mut(session_id) {
            Some(s) if s.is_open => s,
            _ => return json!({ "error": "Session not found or closed" }),
        };
        session.last_access = current_millis();

        // EOF: empty terminal chunk (matches Electron exactly).
        if session.current_position >= session.size {
            return json!({
                "content": "",
                "startByte": session.current_position,
                "endByte": session.current_position,
                "totalSize": session.size,
                "isLastChunk": true,
            });
        }
        (
            session.file_path.clone(),
            session.current_position,
            session.chunk_size,
            session.size,
        )
    };

    let end_byte = (start_byte + chunk_size).min(size);
    let result = read_chunk_inner(&file_path, start_byte, (end_byte - start_byte) as usize);

    // Advance the cursor to the requested end (Electron sets currentPosition =
    // endByte regardless of short reads).
    if result.get("error").is_none() {
        let mut sessions = session_store().lock_safe();
        if let Some(s) = sessions.get_mut(session_id) {
            s.current_position = end_byte;
        }
    }
    result
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:readLines — readLines(sessionId, lineCount)
// ---------------------------------------------------------------------------

fn read_lines(session_id: &str, line_count: u64) -> Value {
    // Read config FIRST (consistent config-before-sessions lock ordering with
    // open_session/set_config — avoids any cross-lock deadlock).
    let line_buffer_size = config_store().lock_safe().line_buffer_size;
    let (file_path, mut position, size) = {
        let mut sessions = session_store().lock_safe();
        let session = match sessions.get_mut(session_id) {
            Some(s) if s.is_open => s,
            _ => return json!({ "error": "Session not found or closed" }),
        };
        session.last_access = current_millis();
        (
            session.file_path.clone(),
            session.current_position,
            session.size,
        )
    };

    let mut f = match File::open(&file_path) {
        Ok(f) => f,
        Err(e) => return json!({ "error": e.to_string() }),
    };

    let mut lines: Vec<String> = Vec::new();
    // `buffer` mirrors the JS string buffer: a UTF-8 decoded carry-over of the
    // partial trailing line between reads.
    let mut buffer = String::new();

    while (lines.len() as u64) < line_count && position < size {
        if let Err(e) = f.seek(SeekFrom::Start(position)) {
            return json!({ "error": e.to_string() });
        }
        let mut chunk = vec![0u8; line_buffer_size];
        let bytes_read = match f.read(&mut chunk) {
            Ok(n) => n,
            Err(e) => return json!({ "error": e.to_string() }),
        };
        if bytes_read == 0 {
            break;
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk[..bytes_read]));
        position += bytes_read as u64;

        // Extract complete lines — mirror the JS shift/join exactly:
        //   while lineBreaks.length > 1 && lines.length < lineCount:
        //       lines.push(lineBreaks.shift())
        //   buffer = lineBreaks.join('\n')
        // `line_breaks` is a deque of the split parts; the last element is the
        // (possibly empty) trailing partial line.
        let mut line_breaks: std::collections::VecDeque<String> =
            buffer.split('\n').map(|s| s.to_string()).collect();
        while line_breaks.len() > 1 && (lines.len() as u64) < line_count {
            // shift() — front element is a complete line.
            lines.push(line_breaks.pop_front().unwrap());
        }
        // join('\n') of whatever remains becomes the new carry-over buffer.
        buffer = line_breaks.into_iter().collect::<Vec<_>>().join("\n");
    }

    // EOF: flush the remaining buffer as the last line (Electron parity).
    if position >= size && !buffer.is_empty() && (lines.len() as u64) < line_count {
        lines.push(std::mem::take(&mut buffer));
    }

    // Update session position, accounting for the unconsumed buffer's byte
    // length (Electron: position - Buffer.byteLength(buffer, encoding)).
    let new_position = position.saturating_sub(buffer.len() as u64);
    {
        let mut sessions = session_store().lock_safe();
        if let Some(s) = sessions.get_mut(session_id) {
            s.current_position = new_position;
        }
    }

    json!({
        "lines": lines,
        "hasMore": new_position < size,
    })
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:seek — seek(sessionId, position)
// ---------------------------------------------------------------------------

fn seek(session_id: &str, position: i64) -> Value {
    let mut sessions = session_store().lock_safe();
    let session = match sessions.get_mut(session_id) {
        Some(s) if s.is_open => s,
        _ => return json!({ "success": false, "error": "Session not found or closed" }),
    };
    if position < 0 || position as u64 > session.size {
        return json!({ "success": false, "error": "Invalid position" });
    }
    session.current_position = position as u64;
    session.last_access = current_millis();
    json!({ "success": true, "position": position })
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:session — getSession(sessionId)
// ---------------------------------------------------------------------------

fn get_session(session_id: &str) -> Value {
    let sessions = session_store().lock_safe();
    match sessions.get(session_id) {
        Some(s) => s.to_value(),
        None => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:sessions — listSessions()
// ---------------------------------------------------------------------------

fn list_sessions() -> Value {
    let sessions = session_store().lock_safe();
    Value::Array(sessions.values().map(|s| s.to_value()).collect())
}

// ---------------------------------------------------------------------------
// CHANNEL: largefile:setConfig — merge partial config
// ---------------------------------------------------------------------------

fn set_config(partial: &Value) -> Value {
    let mut cfg = config_store().lock_safe();
    if let Some(v) = partial.get("defaultChunkSize").and_then(|v| v.as_u64()) {
        cfg.default_chunk_size = v;
    }
    if let Some(v) = partial.get("maxChunkSize").and_then(|v| v.as_u64()) {
        cfg.max_chunk_size = v;
    }
    if let Some(v) = partial.get("sessionTimeout").and_then(|v| v.as_i64()) {
        cfg.session_timeout = v;
    }
    if let Some(v) = partial.get("maxConcurrentSessions").and_then(|v| v.as_u64()) {
        cfg.max_concurrent_sessions = v as usize;
    }
    if let Some(v) = partial.get("lineBufferSize").and_then(|v| v.as_u64()) {
        cfg.line_buffer_size = v as usize;
    }
    json!({ "success": true })
}

/// Route a `largefile:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every listed channel is now a real
/// native implementation; unknown channels fall through to Value::Null so
/// prefix routing over the whole namespace stays safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    // Lazy session GC (mirrors the 60s cleanup interval) before each call.
    prune_idle_sessions();

    match channel {
        "largefile:info" => {
            let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_file_info(file_path)
        }
        "largefile:open" => {
            let file_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let chunk_size = args.get(1).and_then(|v| v.as_u64());
            open_session(file_path, chunk_size)
        }
        "largefile:close" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            close_session(session_id)
        }
        "largefile:readNext" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            read_next_chunk(session_id)
        }
        "largefile:readChunk" => {
            let request = args.get(0).cloned().unwrap_or(Value::Null);
            read_chunk(&request)
        }
        "largefile:readLines" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let line_count = args.get(1).and_then(|v| v.as_u64()).unwrap_or(0);
            read_lines(session_id, line_count)
        }
        "largefile:seek" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let position = args.get(1).and_then(|v| v.as_i64()).unwrap_or(-1);
            seek(session_id, position)
        }
        "largefile:session" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_session(session_id)
        }
        "largefile:sessions" => list_sessions(),
        "largefile:setConfig" => {
            let partial = args.get(0).cloned().unwrap_or(Value::Null);
            set_config(&partial)
        }
        // Unknown channels — safe no-op for prefix routing.
        _ => Value::Null,
    }
}
