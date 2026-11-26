// =============================================================================
// DEX 6.0 — HTTP Transfer server (Tauri port of controllers/HttpTransferServer.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! LAN file sharing over a tiny blocking HTTP server: a receiver scans the QR /
//! visits the URL to download shared files, and can upload files back (the
//! desktop accepts/rejects). Mirrors the Electron `HttpTransferServer`:
//!   httpTransfer:start  ({password?,speedLimit?,downloadDir?,autoAccept}) -> {success,url,qrData}
//!   httpTransfer:stop   () -> {success}
//!   httpTransfer:share  (paths[]) -> {success, fileIds[]}
//!   httpTransfer:unshare(id) -> {success}
//!   httpTransfer:info   () -> {isRunning,url,qrData,localIP,port,sharedFiles[],hostname}
//!   httpTransfer:pickAndShare () -> {success, fileIds[]}  (native multi-file picker)
//!   httpTransfer:acceptUpload (id, accept) -> {success}
//!   httpTransfer:getPendingUploads () -> [{id,fileName,fileSize,senderIp,status}]
//! Events (kebab, matching the renderer's literal `dex.on` subscriptions):
//!   http-transfer:files-updated  (info)
//!   http-transfer:upload-request {id,fileName,fileSize,senderIp}
//!   http-transfer:upload-complete{id,fileName,savePath}
//!   http-transfer:download       {fileId,fileName,senderIp}
//!
//! NOTE: password / speedLimit are accepted but not enforced server-side — the
//! Electron server never implemented them either (its start() took no args). The
//! port honors `downloadDir` and `autoAccept` as faithful, useful behavior.

use crate::util::LockSafe;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use crate::native_ops::{fp_to_string, now_ms};

const BASE_PORT: u16 = 47633;
const MAX_UPLOAD_SIZE: usize = 500 * 1024 * 1024; // 500MB
/// Uploads wait in memory until someone presses Accept. Without a cap, a phone
/// (or anything else on the network) could queue upload after upload until DEX
/// ran out of memory. Past either limit the sender is told to wait.
const MAX_PENDING_BYTES: usize = 1024 * 1024 * 1024; // 1 GiB waiting in total
const MAX_PENDING_UPLOADS: usize = 16;
const EXPIRY_MS: i64 = 30 * 60 * 1000; // 30 minutes

struct SharedFile {
    id: String,
    name: String,
    path: String,
    size: i64,
    mime: String,
    added_at: i64,
    download_count: u64,
    expires_at: i64,
}

struct PendingUpload {
    id: String,
    file_name: String,
    file_size: i64,
    sender_ip: String,
    status: String, // pending | accepted | rejected
    data: Option<Vec<u8>>,
}

#[derive(Default)]
struct ServerData {
    shared: HashMap<String, SharedFile>,
    pending: HashMap<String, PendingUpload>,
    auto_accept: bool,
    download_dir: String,
    hostname: String,
    counter: u64,
    /// Secret in the link / QR code. Without it, anyone on the same Wi-Fi could
    /// list and download everything being shared.
    key: String,
}

/// Answered uploads kept so a phone polling /upload-status still gets its answer.
const KEEP_ANSWERED: usize = 64;

impl ServerData {
    /// Drop expired shares and all but the newest answered uploads. Both maps
    /// only ever grew while the server ran (a long-running share session kept
    /// every entry it ever had).
    fn prune(&mut self, now: i64) {
        self.shared.retain(|_, f| f.expires_at > now);
        let mut answered: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, u)| u.data.is_none() && u.status != "pending")
            .map(|(id, _)| id.clone())
            .collect();
        if answered.len() > KEEP_ANSWERED {
            // Ids start with the creation time in hex, so they sort oldest first.
            answered.sort();
            for id in &answered[..answered.len() - KEEP_ANSWERED] {
                self.pending.remove(id);
            }
        }
    }

    fn next_id(&mut self) -> String {
        self.counter = self.counter.wrapping_add(1);
        format!("{:x}{:04x}", now_ms(), self.counter & 0xffff)
    }
}

pub(crate) struct Running {
    server: Arc<tiny_http::Server>,
    data: Arc<Mutex<ServerData>>,
    port: u16,
    thread: Option<JoinHandle<()>>,
}

/// Tauri-managed server slot (None while stopped).
pub type HttpTransferState = Mutex<Option<Running>>;

// --- Pure helpers (unit-tested) ---------------------------------------------

/// Best-effort LAN IPv4 via the routing table — no packets sent, no dependency.
fn local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DEX".to_string())
}

fn mime_type(name: &str) -> &'static str {
    let ext = std::path::Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html",
        "css" => "text/css",
        "js" => "text/javascript",
        "json" => "application/json",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn format_size(bytes: i64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1_048_576 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1_073_741_824 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{:.2} GB", bytes as f64 / 1_073_741_824.0)
    }
}

fn find_sub(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn rfind_sub(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).rposition(|w| w == needle)
}

/// Parse a single-file multipart/form-data body into (filename, bytes). Mirrors
/// the Electron binary-string slice: filename from the part headers, data between
/// the first blank line and the closing `--boundary`.
fn parse_multipart(body: &[u8], boundary: &str) -> Option<(String, Vec<u8>)> {
    // filename="..."
    let fname_key = b"filename=\"";
    let fstart = find_sub(body, fname_key)? + fname_key.len();
    let frest = &body[fstart..];
    let fend = find_sub(frest, b"\"")?;
    let raw_name = String::from_utf8_lossy(&frest[..fend]).to_string();
    // Strip path components + illegal chars (directory-traversal guard).
    let base = std::path::Path::new(&raw_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| raw_name.clone());
    let file_name: String = base
        .chars()
        .map(|c| if "<>:\"|?*".contains(c) || (c as u32) < 0x20 { '_' } else { c })
        .collect();
    let file_name = if file_name.is_empty() {
        format!("upload-{}", now_ms())
    } else {
        file_name
    };

    let header_end = find_sub(body, b"\r\n\r\n")?;
    let close = format!("--{}", boundary);
    let boundary_end = rfind_sub(body, close.as_bytes())?;
    let data_start = header_end + 4;
    if boundary_end < 2 || boundary_end - 2 < data_start {
        return Some((file_name, Vec::new()));
    }
    let data = body[data_start..boundary_end - 2].to_vec();
    Some((file_name, data))
}

fn file_label(name: &str) -> &'static str {
    let ext = std::path::Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => "[IMG]",
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" => "[AUD]",
        "mp4" | "webm" | "mkv" | "avi" | "mov" => "[VID]",
        "pdf" => "[PDF]",
        "zip" | "rar" | "7z" | "tar" | "gz" => "[ZIP]",
        "doc" | "docx" | "txt" | "md" | "rtf" => "[DOC]",
        "xls" | "xlsx" | "csv" => "[XLS]",
        _ => "[FILE]",
    }
}

fn generate_web_ui(files: &[&SharedFile], host: &str) -> String {
    let host_e = escape_html(host);
    let cards: String = files
        .iter()
        .map(|f| {
            format!(
                "<div class=\"file-card\"><div class=\"file-icon\">{}</div><div class=\"file-info\"><div class=\"file-name\">{}</div><div class=\"file-size\">{}</div></div><a href=\"/download/{}\" class=\"download-btn\" download=\"{}\">Download</a></div>",
                file_label(&f.name), escape_html(&f.name), format_size(f.size), f.id, escape_html(&f.name)
            )
        })
        .collect();
    let body = if files.is_empty() {
        "<div class=\"empty\"><p>No files shared yet.</p></div>".to_string()
    } else {
        cards
    };
    format!(
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>DEX Transfer - {host}</title><style>*{{margin:0;padding:0;box-sizing:border-box}}body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f23;color:#e4e4e7;min-height:100vh;padding:20px}}.container{{max-width:600px;margin:0 auto}}.header{{text-align:center;padding:30px 0}}.header h1{{font-size:24px;font-weight:700;color:#3b82f6}}.file-card{{display:flex;align-items:center;gap:14px;padding:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;margin-bottom:10px}}.file-icon{{font-size:14px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,.1);border-radius:8px}}.file-info{{flex:1;min-width:0}}.file-name{{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.file-size{{color:#71717a;font-size:12px;margin-top:2px}}.download-btn{{padding:8px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px}}.upload-section{{margin-top:30px;padding:24px;background:rgba(255,255,255,.03);border:2px dashed rgba(255,255,255,.1);border-radius:12px;text-align:center}}.upload-btn{{display:inline-block;padding:10px 24px;background:rgba(34,197,94,.2);border:1px solid rgba(34,197,94,.3);color:#22c55e;border-radius:6px;cursor:pointer;font-weight:600}}.empty{{text-align:center;padding:60px 20px;color:#52525b}}.footer{{text-align:center;padding:20px;color:#3f3f46;font-size:11px}}</style></head><body><div class=\"container\"><div class=\"header\"><h1>DEX Transfer</h1><p>Shared by {host}</p></div>{body}<div class=\"upload-section\"><h3>Send Files Back</h3><label class=\"upload-btn\">Choose Files<input type=\"file\" multiple style=\"display:none\" onchange=\"uploadFiles(this.files)\"></label><div id=\"upload-status\" style=\"margin-top:12px;font-size:12px;color:#71717a\"></div></div><div class=\"footer\">Powered by DEX Platform &middot; Files expire in 30 minutes</div></div><script>async function uploadFiles(files){{const s=document.getElementById('upload-status');for(const file of files){{s.textContent='Uploading '+file.name+'...';const fd=new FormData();fd.append('file',file);try{{const r=await fetch('/upload',{{method:'POST',body:fd}});const j=await r.json();if(j.status==='pending'){{s.textContent='Waiting to accept...';const p=setInterval(async()=>{{const c=await fetch('/upload-status/'+j.id);const rr=await c.json();if(rr.status==='accepted'){{clearInterval(p);s.textContent='\\u2713 '+file.name+' accepted!';s.style.color='#22c55e'}}else if(rr.status==='rejected'){{clearInterval(p);s.textContent='\\u2717 '+file.name+' rejected';s.style.color='#ef4444'}}}},1000)}}else{{s.textContent=j.message||'Upload failed'}}}}catch(e){{s.textContent='Error: '+e.message}}}}}}</script></body></html>",
        host = host_e, body = body
    )
}

// --- Server lifecycle + request handling ------------------------------------

fn resp_json(value: Value) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let body = value.to_string();
    tiny_http::Response::from_string(body).with_header(
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap(),
    )
}

fn header_value(request: &tiny_http::Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_string())
}

/// `Content-Disposition` for a download. Header values must be ASCII
/// (tiny_http refuses anything else, which used to panic the server thread on
/// a file named "café.jpg"), and a quote, backslash or line break in the name
/// must not end the value early. ASCII fallback for old clients plus the
/// RFC 6266 / 5987 `filename*` with the real UTF-8 name.
fn content_disposition(name: &str) -> String {
    let fallback: String = name
        .chars()
        .map(|c| if c.is_ascii() && !c.is_ascii_control() && c != '"' && c != '\\' { c } else { '_' })
        .collect();
    let mut encoded = String::new();
    for b in name.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || "!#$&+-.^_`|~".contains(c) {
            encoded.push(c);
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    format!("attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}")
}

const KEY_COOKIE: &str = "dexshare";

fn new_key() -> String {
    dex_vault::crypto::random_bytes(16).iter().map(|b| format!("{b:02x}")).collect()
}

fn link_key(url: &str) -> Option<&str> {
    url.split_once('?')?.1.split('&').find_map(|p| p.strip_prefix("k="))
}

fn cookie_key(header: &str) -> Option<String> {
    header.split(';').find_map(|p| p.trim().strip_prefix(KEY_COOKIE)?.strip_prefix('=').map(str::to_string))
}

/// Constant-time comparison; an empty key never matches.
fn same_key(given: &str, key: &str) -> bool {
    !key.is_empty() && given.len() == key.len() && given.bytes().zip(key.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

fn share_url(ip: &str, port: u16, key: &str) -> String {
    format!("http://{ip}:{port}/?k={key}")
}

fn handle_request(app: &tauri::AppHandle, data: &Arc<Mutex<ServerData>>, mut request: tiny_http::Request) {
    let method = request.method().as_str().to_string();
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();

    let key = data.lock_safe().key.clone();
    let by_link = link_key(&url).is_some_and(|k| same_key(k, &key));
    let by_cookie = header_value(&request, "Cookie").and_then(|c| cookie_key(&c)).is_some_and(|k| same_key(&k, &key));
    if !by_link && !by_cookie {
        let _ = request.respond(
            tiny_http::Response::from_string("Open the link or QR code shown in DEX on the sharing computer.").with_status_code(403),
        );
        return;
    }

    // GET / -> web UI
    if method == "GET" && path == "/" {
        let now = now_ms();
        let guard = data.lock_safe();
        let live: Vec<&SharedFile> = guard.shared.values().filter(|f| f.expires_at > now).collect();
        let html = generate_web_ui(&live, &guard.hostname);
        drop(guard);
        let mut resp = tiny_http::Response::from_string(html).with_header(
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap(),
        );
        // The page's own downloads and uploads then carry the key.
        let cookie = format!("{KEY_COOKIE}={key}; Path=/; HttpOnly; SameSite=Strict");
        if let Ok(h) = tiny_http::Header::from_bytes(&b"Set-Cookie"[..], cookie.as_bytes()) {
            resp = resp.with_header(h);
        }
        let _ = request.respond(resp);
        return;
    }

    // GET /download/<id> -> stream file
    if method == "GET" && path.starts_with("/download/") {
        let id = path.trim_start_matches("/download/").to_string();
        let (file_path, name, mime) = {
            let mut guard = data.lock_safe();
            let now = now_ms();
            match guard.shared.get_mut(&id) {
                Some(f) if f.expires_at > now => {
                    f.download_count += 1;
                    (f.path.clone(), f.name.clone(), f.mime.clone())
                }
                _ => {
                    let _ = request.respond(resp_json(json!({ "error": "File not found or expired" })).with_status_code(404));
                    return;
                }
            }
        };
        match std::fs::File::open(&file_path) {
            Ok(file) => {
                let cd = content_disposition(&name);
                let ctype = tiny_http::Header::from_bytes(&b"Content-Type"[..], mime.as_bytes())
                    .or_else(|_| tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/octet-stream"[..]));
                let mut resp = tiny_http::Response::from_file(file);
                if let Ok(h) = ctype {
                    resp = resp.with_header(h);
                }
                if let Ok(h) = tiny_http::Header::from_bytes(&b"Content-Disposition"[..], cd.as_bytes()) {
                    resp = resp.with_header(h);
                }
                crate::native_ops::emit_event(app, "http-transfer:download", &json!({ "fileId": id, "fileName": name }));
                let _ = request.respond(resp);
            }
            Err(_) => {
                let _ = request.respond(resp_json(json!({ "error": "File read error" })).with_status_code(500));
            }
        }
        return;
    }

    // GET /upload-status/<id>
    if method == "GET" && path.starts_with("/upload-status/") {
        let id = path.trim_start_matches("/upload-status/").to_string();
        let guard = data.lock_safe();
        match guard.pending.get(&id) {
            Some(u) => {
                let _ = request.respond(resp_json(json!({ "status": u.status })));
            }
            None => {
                let _ = request.respond(resp_json(json!({ "error": "Upload not found" })).with_status_code(404));
            }
        }
        return;
    }

    // GET /api/files
    if method == "GET" && path == "/api/files" {
        let now = now_ms();
        let guard = data.lock_safe();
        let files: Vec<Value> = guard
            .shared
            .values()
            .filter(|f| f.expires_at > now)
            .map(|f| json!({ "id": f.id, "name": f.name, "size": f.size, "mimeType": f.mime }))
            .collect();
        drop(guard);
        let _ = request.respond(resp_json(json!(files)));
        return;
    }

    // POST /upload
    if method == "POST" && path == "/upload" {
        let ctype = header_value(&request, "Content-Type").unwrap_or_default();
        let boundary = ctype.split("boundary=").nth(1).map(|s| s.trim().to_string());
        let boundary = match boundary {
            Some(b) if !b.is_empty() => b,
            _ => {
                let _ = request.respond(resp_json(json!({ "error": "Invalid multipart request" })).with_status_code(400));
                return;
            }
        };
        if request.body_length().map(|n| n > MAX_UPLOAD_SIZE).unwrap_or(false) {
            let _ = request.respond(resp_json(json!({ "error": "File too large (500MB limit)" })).with_status_code(413));
            return;
        }
        let admitted = admit_upload(&data.lock_safe(), request.body_length().unwrap_or(0));
        if let Err(msg) = admitted {
            let _ = request.respond(resp_json(json!({ "error": msg })).with_status_code(429));
            return;
        }
        let mut buf = Vec::new();
        if request.as_reader().take((MAX_UPLOAD_SIZE + 1) as u64).read_to_end(&mut buf).is_err() {
            let _ = request.respond(resp_json(json!({ "error": "Read error" })).with_status_code(400));
            return;
        }
        if buf.len() > MAX_UPLOAD_SIZE {
            let _ = request.respond(resp_json(json!({ "error": "File too large (500MB limit)" })).with_status_code(413));
            return;
        }
        let (file_name, file_data) = match parse_multipart(&buf, &boundary) {
            Some(v) => v,
            None => {
                let _ = request.respond(resp_json(json!({ "error": "Malformed upload" })).with_status_code(400));
                return;
            }
        };
        let sender_ip = request
            .remote_addr()
            .map(|a| a.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        drop(buf);
        let (upload_id, auto) = {
            let mut guard = data.lock_safe();
            // Re-check with the real size: other uploads may have arrived meanwhile.
            if let Err(msg) = admit_upload(&guard, file_data.len()) {
                drop(guard);
                let _ = request.respond(resp_json(json!({ "error": msg })).with_status_code(429));
                return;
            }
            guard.prune(now_ms());
            let id = guard.next_id();
            let size = file_data.len() as i64;
            let auto = guard.auto_accept;
            guard.pending.insert(
                id.clone(),
                PendingUpload {
                    id: id.clone(),
                    file_name: file_name.clone(),
                    file_size: size,
                    sender_ip: sender_ip.clone(),
                    status: "pending".to_string(),
                    data: Some(file_data),
                },
            );
            (id, auto)
        };

        crate::native_ops::emit_event(
            app,
            "http-transfer:upload-request",
            &json!({ "id": upload_id, "fileName": file_name, "fileSize": (file_data_len(data, &upload_id)), "senderIp": sender_ip }),
        );

        // Respond immediately; the receiver polls /upload-status. Auto-accept (an
        // opt-in improvement) resolves it right away so the poll returns accepted.
        let _ = request.respond(resp_json(json!({ "status": "pending", "id": upload_id })));
        if auto {
            resolve_upload(app, data, &upload_id, true);
        }
        return;
    }

    let _ = request.respond(
        tiny_http::Response::from_string("Not Found").with_status_code(404),
    );
}

/// Read a pending upload's byte length (for the event payload) without moving it.
fn file_data_len(data: &Arc<Mutex<ServerData>>, id: &str) -> i64 {
    data.lock()
        .ok()
        .and_then(|g| g.pending.get(id).map(|u| u.file_size))
        .unwrap_or(0)
}

/// Accept or reject a pending upload. On accept, write the held bytes into the
/// configured download dir and emit `http-transfer:upload-complete`.
/// May another upload of `incoming` bytes wait for Accept right now?
fn admit_upload(d: &ServerData, incoming: usize) -> Result<(), &'static str> {
    let waiting: Vec<usize> = d.pending.values().filter_map(|u| u.data.as_ref().map(|b| b.len())).collect();
    if waiting.len() >= MAX_PENDING_UPLOADS {
        return Err("Too many files are waiting to be accepted. Try again after the receiver answers.");
    }
    if waiting.iter().sum::<usize>().saturating_add(incoming) > MAX_PENDING_BYTES {
        return Err("Too much data is waiting to be accepted. Try again after the receiver answers.");
    }
    Ok(())
}

fn resolve_upload(app: &tauri::AppHandle, data: &Arc<Mutex<ServerData>>, id: &str, accept: bool) -> bool {
    let (file_name, bytes, dir) = {
        let mut guard = data.lock_safe();
        let dir = guard.download_dir.clone();
        match guard.pending.get_mut(id) {
            Some(u) if u.status == "pending" => {
                u.status = if accept { "accepted".into() } else { "rejected".into() };
                // Take the bytes either way: a declined upload used to keep its
                // whole file in memory until the server stopped.
                let bytes = u.data.take();
                (u.file_name.clone(), if accept { bytes } else { None }, dir)
            }
            _ => return false,
        }
    };
    if accept {
        if let Some(bytes) = bytes {
            // Never overwrite a file already in the folder: "photo.jpg" becomes
            // "photo (1).jpg", like a browser download.
            let save_path = crate::download_ctl::unique_path(std::path::Path::new(&dir), &file_name);
            match std::fs::write(&save_path, &bytes) {
                Ok(()) => crate::native_ops::emit_event(
                    app,
                    "http-transfer:upload-complete",
                    &json!({ "id": id, "fileName": file_name, "savePath": save_path.to_string_lossy() }),
                ),
                Err(e) => {
                    if let Some(u) = data.lock_safe().pending.get_mut(id) {
                        u.status = "failed".into();
                    }
                    crate::native_ops::emit_event(
                        app,
                        "http-transfer:upload-complete",
                        &json!({ "id": id, "fileName": file_name, "error": e.to_string() }),
                    );
                    return false;
                }
            }
        }
    }
    true
}

fn start_server(app: &tauri::AppHandle, opts: &Value) -> Value {
    let state = app.state::<HttpTransferState>();
    let mut slot = state.lock_safe();
    if let Some(running) = slot.as_ref() {
        let url = share_url(&local_ip(), running.port, &running.data.lock_safe().key);
        return json!({ "success": true, "url": url, "qrData": url });
    }
    if let Err(e) = crate::net_gate::check_lan() {
        return json!({ "success": false, "error": e });
    }

    // Bind, incrementing the port a few times on conflict (EADDRINUSE parity).
    let mut port = BASE_PORT;
    let server = loop {
        match tiny_http::Server::http(format!("0.0.0.0:{}", port)) {
            Ok(s) => break Some((s, port)),
            Err(_) => {
                port += 1;
                if port > BASE_PORT + 10 {
                    break None;
                }
            }
        }
    };
    let (server, port) = match server {
        Some(s) => s,
        None => return json!({ "success": false, "error": "could not bind a port" }),
    };

    let download_dir = opts
        .get("downloadDir")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            app.path()
                .download_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| std::env::var("USERPROFILE").unwrap_or_default())
        });
    let auto_accept = opts.get("autoAccept").and_then(|v| v.as_bool()).unwrap_or(false);

    let data = Arc::new(Mutex::new(ServerData {
        auto_accept,
        download_dir,
        hostname: hostname(),
        key: new_key(),
        ..Default::default()
    }));
    let key = data.lock_safe().key.clone();
    let server = Arc::new(server);

    let server_t = server.clone();
    let data_t = data.clone();
    let app_t = app.clone();
    let thread = crate::util::spawn_named("http_transfer", move || {
        while let Ok(request) = server_t.recv() {
            // One bad request must not kill the share server for every later
            // phone: this thread is outside the dex_ipc panic guard.
            crate::util::guard_panic("phone share request", || handle_request(&app_t, &data_t, request));
        }
    });

    *slot = Some(Running { server, data, port, thread: Some(thread) });
    let url = share_url(&local_ip(), port, &key);
    json!({ "success": true, "url": url, "qrData": url })
}

fn stop_server(app: &tauri::AppHandle) -> Value {
    let state = app.state::<HttpTransferState>();
    let mut slot = state.lock_safe();
    if let Some(mut running) = slot.take() {
        running.server.unblock();
        if let Some(t) = running.thread.take() {
            let _ = t.join();
        }
    }
    json!({ "success": true })
}

fn share_files(app: &tauri::AppHandle, paths: &[String]) -> Value {
    // Auto-start the server if it is not running (matches the TS shareFiles).
    {
        let state = app.state::<HttpTransferState>();
        let running = state.lock().map(|g| g.is_some()).unwrap_or(false);
        if !running && !paths.is_empty() {
            start_server(app, &json!({}));
        }
    }
    let state = app.state::<HttpTransferState>();
    let slot = state.lock_safe();
    let running = match slot.as_ref() {
        Some(r) => r,
        None => return json!({ "success": false, "fileIds": [] }),
    };
    let mut ids = Vec::new();
    {
        let mut d = running.data.lock_safe();
        d.prune(now_ms());
        for p in paths {
            if let Ok(meta) = std::fs::metadata(p) {
                let id = d.next_id();
                let name = std::path::Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| p.clone());
                let now = now_ms();
                d.shared.insert(
                    id.clone(),
                    SharedFile {
                        id: id.clone(),
                        name,
                        path: p.clone(),
                        size: meta.len() as i64,
                        mime: mime_type(p).to_string(),
                        added_at: now,
                        download_count: 0,
                        expires_at: now + EXPIRY_MS,
                    },
                );
                ids.push(id);
            }
        }
    }
    drop(slot);
    let info = server_info(app);
    crate::native_ops::emit_event(app, "http-transfer:files-updated", &info);
    json!({ "success": true, "fileIds": ids })
}

fn server_info(app: &tauri::AppHandle) -> Value {
    let state = app.state::<HttpTransferState>();
    let slot = state.lock_safe();
    let ip = local_ip();
    match slot.as_ref() {
        Some(running) => {
            let url = share_url(&ip, running.port, &running.data.lock_safe().key);
            let now = now_ms();
            let guard = running.data.lock_safe();
            let files: Vec<Value> = guard
                .shared
                .values()
                .filter(|f| f.expires_at > now)
                .map(|f| json!({ "id": f.id, "name": f.name, "size": f.size, "downloadCount": f.download_count, "addedAt": f.added_at }))
                .collect();
            json!({
                "isRunning": true,
                "url": url,
                "qrData": url,
                "localIP": ip,
                "port": running.port,
                "sharedFiles": files,
                "hostname": guard.hostname,
            })
        }
        None => json!({
            "isRunning": false,
            "url": Value::Null,
            "qrData": Value::Null,
            "localIP": ip,
            "port": BASE_PORT,
            "sharedFiles": [],
            "hostname": hostname(),
        }),
    }
}

fn pending_uploads(app: &tauri::AppHandle) -> Value {
    let state = app.state::<HttpTransferState>();
    let slot = state.lock_safe();
    match slot.as_ref() {
        Some(running) => {
            let guard = running.data.lock_safe();
            let list: Vec<Value> = guard
                .pending
                .values()
                .filter(|u| u.status == "pending")
                .map(|u| json!({ "id": u.id, "fileName": u.file_name, "fileSize": u.file_size, "senderIp": u.sender_ip, "status": u.status }))
                .collect();
            json!(list)
        }
        None => json!([]),
    }
}

fn accept_upload(app: &tauri::AppHandle, id: &str, accept: bool) -> Value {
    let state = app.state::<HttpTransferState>();
    let data = {
        let slot = state.lock_safe();
        match slot.as_ref() {
            Some(r) => r.data.clone(),
            None => return json!({ "success": false }),
        }
    };
    let ok = resolve_upload(app, &data, id, accept);
    json!({ "success": ok })
}

/// Native multi-file picker (shared by httpTransfer:pickAndShare + transfer:selectFiles).
fn pick_files(app: &tauri::AppHandle, title: &str) -> Vec<String> {
    app.dialog()
        .file()
        .set_title(title)
        .blocking_pick_files()
        .map(|fps| fps.into_iter().filter_map(fp_to_string).collect())
        .unwrap_or_default()
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "httpTransfer:start" => start_server(app, &args.get(0).cloned().unwrap_or(Value::Null)),
        "httpTransfer:stop" => stop_server(app),
        "httpTransfer:info" => server_info(app),
        "httpTransfer:getPendingUploads" => pending_uploads(app),
        "httpTransfer:share" => {
            let paths: Vec<String> = args
                .get(0)
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            share_files(app, &paths)
        }
        "httpTransfer:unshare" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            let state = app.state::<HttpTransferState>();
            { let slot = state.lock_safe();
                if let Some(r) = slot.as_ref() {
                    r.data.lock_safe().shared.remove(id);
                }
            }
            json!({ "success": true })
        }
        "httpTransfer:pickAndShare" => {
            let paths = pick_files(app, "Select files to share");
            if paths.is_empty() {
                return json!({ "success": false, "message": "Cancelled" });
            }
            share_files(app, &paths)
        }
        "httpTransfer:acceptUpload" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or_default();
            let accept = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
            accept_upload(app, id, accept)
        }
        // transfer:selectFiles — native multi-file picker -> { filePaths }.
        "transfer:selectFiles" => {
            json!({ "filePaths": pick_files(app, "Select files") })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(n: usize) -> PendingUpload {
        PendingUpload { id: String::new(), file_name: String::new(), file_size: n as i64, sender_ip: String::new(), status: "pending".into(), data: Some(vec![0; n]) }
    }

    #[test]
    fn prune_drops_expired_shares_and_old_answers_only() {
        let mut d = ServerData::default();
        for i in 0..(KEEP_ANSWERED + 10) {
            let mut u = pending(1);
            u.data = None;
            u.status = "accepted".into();
            d.pending.insert(format!("{:04}", i), u);
        }
        d.pending.insert("zzzz-waiting".into(), pending(1));
        d.prune(0);
        assert_eq!(d.pending.len(), KEEP_ANSWERED + 1, "newest answers + the waiting one");
        assert!(d.pending.contains_key("zzzz-waiting"));
        assert!(!d.pending.contains_key("0000"), "oldest answer dropped");
    }

    #[test]
    fn waiting_uploads_are_capped_by_count_and_bytes() {
        let mut d = ServerData::default();
        assert!(admit_upload(&d, 10).is_ok());
        for i in 0..MAX_PENDING_UPLOADS {
            d.pending.insert(i.to_string(), pending(1));
        }
        assert!(admit_upload(&d, 1).is_err(), "count cap");
        // Answered uploads no longer hold bytes and stop counting.
        for u in d.pending.values_mut() {
            u.data = None;
        }
        assert!(admit_upload(&d, 1).is_ok());
        assert!(admit_upload(&d, MAX_PENDING_BYTES + 1).is_err(), "byte cap");
    }

    #[test]
    fn content_disposition_is_ascii_and_cannot_be_broken_out_of() {
        for name in ["café.jpg", "照片.png", "a\"b.txt", "line\r\nX-Evil: 1.txt", "plain name.pdf"] {
            let cd = content_disposition(name);
            assert!(cd.is_ascii(), "{cd}");
            assert!(!cd.contains('\r') && !cd.contains('\n'), "{cd}");
            assert!(tiny_http::Header::from_bytes(&b"Content-Disposition"[..], cd.as_bytes()).is_ok(), "{cd}");
            // Only the two quotes around the fallback name.
            assert_eq!(cd.matches('"').count(), 2, "{cd}");
        }
        assert_eq!(
            content_disposition("café.jpg"),
            "attachment; filename=\"caf_.jpg\"; filename*=UTF-8''caf%C3%A9.jpg"
        );
    }

    #[test]
    fn parse_multipart_extracts_name_and_data() {
        let boundary = "----dexBoundary123";
        let body = format!(
            "--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"hello world.txt\"\r\nContent-Type: text/plain\r\n\r\nHELLO-PAYLOAD\r\n--{b}--\r\n",
            b = boundary
        );
        let (name, data) = parse_multipart(body.as_bytes(), boundary).unwrap();
        assert_eq!(name, "hello world.txt");
        assert_eq!(data, b"HELLO-PAYLOAD");
    }

    #[test]
    fn parse_multipart_sanitizes_traversal_and_illegal_chars() {
        let boundary = "B";
        let body = format!(
            "--{b}\r\nContent-Disposition: form-data; filename=\"../../e?vil:name.bin\"\r\n\r\nX\r\n--{b}--\r\n",
            b = boundary
        );
        let (name, data) = parse_multipart(body.as_bytes(), boundary).unwrap();
        // Path components stripped; illegal chars replaced with '_'.
        assert_eq!(name, "e_vil_name.bin");
        assert_eq!(data, b"X");
    }

    #[test]
    fn parse_multipart_handles_binary_payload_with_crlf() {
        let boundary = "Z";
        let mut body = format!(
            "--{b}\r\nContent-Disposition: form-data; filename=\"a.bin\"\r\n\r\n",
            b = boundary
        )
        .into_bytes();
        let payload = vec![0u8, 1, 13, 10, 255, 254, 0]; // contains CR/LF/NULs
        body.extend_from_slice(&payload);
        body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());
        let (name, data) = parse_multipart(&body, boundary).unwrap();
        assert_eq!(name, "a.bin");
        assert_eq!(data, payload);
    }

    #[test]
    fn mime_and_size_and_label() {
        assert_eq!(mime_type("x.PNG"), "image/png");
        assert_eq!(mime_type("x.unknownext"), "application/octet-stream");
        assert_eq!(format_size(512), "512 B");
        assert_eq!(format_size(2048), "2.0 KB");
        assert_eq!(file_label("clip.mp4"), "[VID]");
        assert_eq!(escape_html("<a>&\""), "&lt;a&gt;&amp;&quot;");
    }
}

#[cfg(test)]
mod key_tests {
    use super::*;

    #[test]
    fn only_the_shared_link_or_its_cookie_opens_the_server() {
        let key = new_key();
        assert_eq!(key.len(), 32);
        let url = share_url("10.0.0.2", 8080, &key);
        assert_eq!(link_key(&url), Some(key.as_str()));
        assert_eq!(link_key("/download/abc?x=1&k=zz"), Some("zz"));
        assert_eq!(link_key("/api/files"), None);
        assert_eq!(cookie_key(&format!("a=1; {KEY_COOKIE}={key}")).as_deref(), Some(key.as_str()));
        assert_eq!(cookie_key("a=1"), None);
        assert!(same_key(&key, &key));
        assert!(!same_key("", ""));
        assert!(!same_key(&key[1..], &key));
    }
}
