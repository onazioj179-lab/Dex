//! DEX Transfer Protocol (DTP) v1: encrypted DEX-to-DEX file transfer on the LAN.
//!
//! Wire format
//! -----------
//! Every message is a frame: a 4-byte big-endian length, then the bytes.
//!
//! 1. Handshake (plain JSON, one frame each way). The sender opens TCP and sends
//!    `Hello { magic:"DEX1", v:1, pub:<hex X25519 key>, deviceId, deviceName, deviceType }`;
//!    the receiver answers with its own `Hello`. Both keys are fresh per connection.
//! 2. Keys. HKDF-SHA256 over the X25519 shared secret (salt = sender pub || receiver pub)
//!    gives one AES-256-GCM key per direction and a 6-digit **match code**. Both screens
//!    show the code; when they agree, nobody sits in the middle. A key exchange that
//!    yields a non-contributory (all-zero) secret is refused.
//! 3. Encrypted frames: AES-256-GCM, nonce = 4 zero bytes + a 64-bit counter per
//!    direction (never reused: a fresh key per connection). Plaintext = 1 kind byte + body.
//!    Sender: `MANIFEST` (file names + sizes). Receiver: `DECISION` (accept or deny).
//!    Sender, per file: `CHUNK`s, then `FILE_END` with the file's SHA-256.
//!    Receiver: `DONE` (or `ERROR`). Either side may send `CANCEL`/`ERROR` and close.
//!
//! The receiver writes each file to a hidden temp file in the destination folder, checks
//! the size and SHA-256, then renames it to a free name (`name (1).ext` on collision).
//! Names from the peer are reduced to a bare, Windows-safe file name, so a manifest can't
//! write outside the destination. A failed or cancelled file leaves nothing behind.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::Duration;
use x25519_dalek::{EphemeralSecret, PublicKey};

pub const MAGIC: &str = "DEX1";
pub const VERSION: u32 = 1;
pub const DEFAULT_PORT: u16 = 58432;

const MAX_HELLO: usize = 4 * 1024;
const MAX_MANIFEST: usize = 2 * 1024 * 1024;
const CHUNK: usize = 256 * 1024;
const MAX_FILES: usize = 10_000;
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const STREAM_TIMEOUT: Duration = Duration::from_secs(60);

const K_MANIFEST: u8 = 1;
const K_DECISION: u8 = 2;
const K_CHUNK: u8 = 3;
const K_FILE_END: u8 = 4;
const K_DONE: u8 = 5;
const K_ERROR: u8 = 6;
const K_CANCEL: u8 = 7;

// ---------------------------------------------------------------------------
// Errors + public types
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum DtpError {
    Io(io::Error),
    /// The peer broke the protocol (bad magic, oversize frame, wrong order...).
    Protocol(String),
    /// A frame failed authentication: tampered, replayed or a wrong key.
    Crypto,
    /// The receiver said no (or the approval timed out).
    Denied(String),
    /// This side cancelled.
    Cancelled,
    /// The other side cancelled or reported an error.
    Remote(String),
}

impl fmt::Display for DtpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DtpError::Io(e) => write!(f, "{e}"),
            DtpError::Protocol(m) => write!(f, "protocol error: {m}"),
            DtpError::Crypto => write!(f, "a frame failed its integrity check"),
            DtpError::Denied(m) => write!(f, "{m}"),
            DtpError::Cancelled => write!(f, "cancelled"),
            DtpError::Remote(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for DtpError {}

impl From<io::Error> for DtpError {
    fn from(e: io::Error) -> Self {
        DtpError::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, DtpError>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub device_id: String,
    pub device_name: String,
    pub device_type: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
}

/// What a receiver is asked to approve.
#[derive(Clone, Debug)]
pub struct Offer {
    pub peer: Identity,
    pub peer_addr: String,
    pub files: Vec<FileEntry>,
    pub total_bytes: u64,
    /// 6 digits; the sender shows the same code.
    pub code: String,
}

pub enum Decision {
    Accept,
    Deny(String),
}

pub trait ReceiveHooks {
    /// Called once the manifest is in. May block (waiting for the user).
    fn decide(&self, offer: &Offer) -> Decision;
    fn progress(&self, _offer: &Offer, _received: u64) {}
    fn cancelled(&self) -> bool {
        false
    }
}

pub trait SendHooks {
    /// Keys agreed; `code` is the match code to show the user.
    fn handshake(&self, _peer: &Identity, _code: &str) {}
    fn progress(&self, _sent: u64, _total: u64) {}
    fn cancelled(&self) -> bool {
        false
    }
}

#[derive(Debug)]
pub struct Received {
    pub peer: Identity,
    pub files: Vec<PathBuf>,
    pub total_bytes: u64,
    pub code: String,
}

#[derive(Debug)]
pub struct Sent {
    pub peer: Identity,
    pub file_count: usize,
    pub total_bytes: u64,
    pub code: String,
}

// ---------------------------------------------------------------------------
// Framing, handshake, encrypted channel
// ---------------------------------------------------------------------------

fn write_frame(w: &mut impl Write, bytes: &[u8]) -> Result<()> {
    let len =
        u32::try_from(bytes.len()).map_err(|_| DtpError::Protocol("frame too large".into()))?;
    w.write_all(&len.to_be_bytes())?;
    w.write_all(bytes)?;
    w.flush()?;
    Ok(())
}

fn read_frame(r: &mut impl Read, max: usize) -> Result<Vec<u8>> {
    let mut len = [0u8; 4];
    r.read_exact(&mut len)?;
    let len = u32::from_be_bytes(len) as usize;
    if len > max {
        return Err(DtpError::Protocol(format!(
            "frame of {len} bytes exceeds {max}"
        )));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    Ok(buf)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hello {
    magic: String,
    v: u32,
    #[serde(rename = "pub")]
    public: String,
    #[serde(flatten)]
    id: Identity,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex32(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 || !s.is_ascii() {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

fn clip(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Peer-supplied identity, trimmed so it can't flood the UI.
fn tidy_identity(id: Identity) -> Identity {
    Identity {
        device_id: clip(&id.device_id, 128),
        device_name: clip(&id.device_name, 64),
        device_type: clip(&id.device_type, 32),
    }
}

fn send_hello(stream: &mut TcpStream, me: &Identity, public: &PublicKey) -> Result<()> {
    let hello = Hello {
        magic: MAGIC.into(),
        v: VERSION,
        public: hex(public.as_bytes()),
        id: me.clone(),
    };
    write_frame(
        stream,
        &serde_json::to_vec(&hello).expect("hello serializes"),
    )
}

fn read_hello(stream: &mut TcpStream) -> Result<(Identity, [u8; 32])> {
    let raw = read_frame(stream, MAX_HELLO)?;
    let hello: Hello =
        serde_json::from_slice(&raw).map_err(|_| DtpError::Protocol("not a DTP hello".into()))?;
    if hello.magic != MAGIC {
        return Err(DtpError::Protocol("not a DTP peer".into()));
    }
    if hello.v != VERSION {
        return Err(DtpError::Protocol(format!(
            "peer speaks DTP v{}, this DEX speaks v{VERSION}",
            hello.v
        )));
    }
    let key = unhex32(&hello.public).ok_or_else(|| DtpError::Protocol("bad public key".into()))?;
    Ok((tidy_identity(hello.id), key))
}

struct Keys {
    c2s: [u8; 32],
    s2c: [u8; 32],
    code: String,
}

fn derive(shared: &[u8; 32], sender_pub: &[u8; 32], receiver_pub: &[u8; 32]) -> Keys {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(sender_pub);
    salt[32..].copy_from_slice(receiver_pub);
    let hk = Hkdf::<Sha256>::new(Some(&salt), shared);
    let mut c2s = [0u8; 32];
    let mut s2c = [0u8; 32];
    let mut code = [0u8; 4];
    hk.expand(b"DEX-DTP-V1 c2s", &mut c2s)
        .expect("32 bytes is a valid HKDF length");
    hk.expand(b"DEX-DTP-V1 s2c", &mut s2c)
        .expect("32 bytes is a valid HKDF length");
    hk.expand(b"DEX-DTP-V1 code", &mut code)
        .expect("4 bytes is a valid HKDF length");
    Keys {
        c2s,
        s2c,
        code: format!("{:06}", u32::from_be_bytes(code) % 1_000_000),
    }
}

fn agree(secret: EphemeralSecret, peer: [u8; 32]) -> Result<[u8; 32]> {
    let shared = secret.diffie_hellman(&PublicKey::from(peer));
    if !shared.was_contributory() {
        return Err(DtpError::Protocol("weak key from peer".into()));
    }
    Ok(*shared.as_bytes())
}

struct Channel {
    stream: TcpStream,
    tx: Aes256Gcm,
    rx: Aes256Gcm,
    tx_ctr: u64,
    rx_ctr: u64,
}

fn nonce(ctr: u64) -> [u8; 12] {
    let mut n = [0u8; 12];
    n[4..].copy_from_slice(&ctr.to_be_bytes());
    n
}

impl Channel {
    fn new(stream: TcpStream, tx_key: &[u8; 32], rx_key: &[u8; 32]) -> Self {
        Channel {
            stream,
            tx: Aes256Gcm::new_from_slice(tx_key).expect("32-byte key"),
            rx: Aes256Gcm::new_from_slice(rx_key).expect("32-byte key"),
            tx_ctr: 0,
            rx_ctr: 0,
        }
    }

    fn send(&mut self, kind: u8, body: &[u8]) -> Result<()> {
        let mut pt = Vec::with_capacity(body.len() + 1);
        pt.push(kind);
        pt.extend_from_slice(body);
        let n = nonce(self.tx_ctr);
        self.tx_ctr += 1;
        let ct = self
            .tx
            .encrypt(Nonce::from_slice(&n), pt.as_ref())
            .map_err(|_| DtpError::Crypto)?;
        write_frame(&mut self.stream, &ct)
    }

    fn send_json(&mut self, kind: u8, v: &serde_json::Value) -> Result<()> {
        self.send(kind, &serde_json::to_vec(v).expect("json serializes"))
    }

    fn recv(&mut self, max: usize) -> Result<(u8, Vec<u8>)> {
        let ct = read_frame(&mut self.stream, max + 1 + 16)?;
        let n = nonce(self.rx_ctr);
        self.rx_ctr += 1;
        let mut pt = self
            .rx
            .decrypt(Nonce::from_slice(&n), ct.as_ref())
            .map_err(|_| DtpError::Crypto)?;
        if pt.is_empty() {
            return Err(DtpError::Protocol("empty frame".into()));
        }
        let kind = pt.remove(0);
        Ok((kind, pt))
    }

    fn timeout(&self, d: Duration) -> Result<()> {
        self.stream.set_read_timeout(Some(d))?;
        Ok(())
    }
}

fn remote_message(body: &[u8]) -> String {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .and_then(|e| e.as_str())
                .map(|s| clip(s, 200))
        })
        .unwrap_or_else(|| "the other device stopped the transfer".into())
}

// ---------------------------------------------------------------------------
// File names on the receiving side
// ---------------------------------------------------------------------------

/// A bare, Windows-safe file name from whatever the peer sent.
pub fn sanitize_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    while name.ends_with('.') || name.ends_with(' ') {
        name.pop();
    }
    let name = name.trim_start().to_string();
    let mut name = if name.is_empty() || name == "." || name == ".." {
        "file".to_string()
    } else {
        name
    };
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        name.insert(0, '_');
    }
    if name.chars().count() > 200 {
        let (stem, ext) = split_ext(&name);
        let keep = 200usize.saturating_sub(ext.chars().count());
        name = format!("{}{}", stem.chars().take(keep).collect::<String>(), ext);
    }
    name
}

fn split_ext(name: &str) -> (String, String) {
    match name.rfind('.') {
        Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()),
        _ => (name.to_string(), String::new()),
    }
}

/// `dir/name`, or `dir/name (n).ext` if that is taken.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = split_ext(name);
    for n in 1..10_000 {
        let p = dir.join(format!("{stem} ({n}){ext}"));
        if !p.exists() {
            return p;
        }
    }
    dir.join(format!("{stem} ({}){ext}", OsRng.next_u64()))
}

struct TempFile {
    path: PathBuf,
    file: Option<File>,
}

impl TempFile {
    fn create(dir: &Path) -> Result<Self> {
        for _ in 0..8 {
            let path = dir.join(format!(".dex-{:016x}.dtp-part", OsRng.next_u64()));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => {
                    return Ok(TempFile {
                        path,
                        file: Some(file),
                    })
                }
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.into()),
            }
        }
        Err(DtpError::Io(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "no free temp name",
        )))
    }

    fn keep_as(mut self, dest: &Path) -> Result<()> {
        if let Some(f) = self.file.take() {
            f.sync_all()?;
        }
        fs::rename(&self.path, dest)?;
        self.path = PathBuf::new();
        Ok(())
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        self.file.take();
        if !self.path.as_os_str().is_empty() {
            let _ = fs::remove_file(&self.path);
        }
    }
}

// ---------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    files: Vec<FileEntry>,
}

/// Serve one incoming connection: handshake, ask `hooks` to approve, write files into `dest`.
pub fn receive(
    mut stream: TcpStream,
    me: &Identity,
    dest: &Path,
    hooks: &dyn ReceiveHooks,
) -> Result<Received> {
    let peer_addr = stream
        .peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_default();
    stream.set_read_timeout(Some(HANDSHAKE_TIMEOUT))?;
    stream.set_write_timeout(Some(STREAM_TIMEOUT))?;
    let (peer, peer_pub) = read_hello(&mut stream)?;
    let secret = EphemeralSecret::random_from_rng(OsRng);
    let my_pub = PublicKey::from(&secret);
    send_hello(&mut stream, me, &my_pub)?;
    let keys = derive(&agree(secret, peer_pub)?, &peer_pub, my_pub.as_bytes());
    let mut ch = Channel::new(stream, &keys.s2c, &keys.c2s);

    let (kind, body) = ch.recv(MAX_MANIFEST)?;
    if kind != K_MANIFEST {
        return Err(DtpError::Protocol("expected a manifest".into()));
    }
    let manifest: Manifest =
        serde_json::from_slice(&body).map_err(|_| DtpError::Protocol("bad manifest".into()))?;
    if manifest.files.is_empty() || manifest.files.len() > MAX_FILES {
        return Err(DtpError::Protocol(format!(
            "manifest lists {} files",
            manifest.files.len()
        )));
    }
    let mut total: u64 = 0;
    let files: Vec<FileEntry> = manifest
        .files
        .into_iter()
        .map(|f| FileEntry {
            name: sanitize_name(&f.name),
            size: f.size,
        })
        .collect();
    for f in &files {
        total = total
            .checked_add(f.size)
            .ok_or_else(|| DtpError::Protocol("sizes overflow".into()))?;
    }
    let offer = Offer {
        peer: peer.clone(),
        peer_addr,
        files,
        total_bytes: total,
        code: keys.code.clone(),
    };

    match hooks.decide(&offer) {
        Decision::Accept => ch.send_json(K_DECISION, &serde_json::json!({ "accept": true }))?,
        Decision::Deny(reason) => {
            let _ = ch.send_json(
                K_DECISION,
                &serde_json::json!({ "accept": false, "reason": reason }),
            );
            return Err(DtpError::Denied(reason));
        }
    }

    fs::create_dir_all(dest)?;
    ch.timeout(STREAM_TIMEOUT)?;
    let mut received: u64 = 0;
    let mut saved = Vec::with_capacity(offer.files.len());
    for entry in &offer.files {
        let mut tmp = TempFile::create(dest)?;
        let mut hasher = Sha256::new();
        let mut left = entry.size;
        loop {
            if hooks.cancelled() {
                let _ = ch.send_json(
                    K_ERROR,
                    &serde_json::json!({ "error": "The receiver cancelled the transfer." }),
                );
                return Err(DtpError::Cancelled);
            }
            let (kind, body) = ch.recv(CHUNK)?;
            match kind {
                K_CHUNK => {
                    if body.len() as u64 > left {
                        return Err(DtpError::Protocol(format!(
                            "{} is longer than announced",
                            entry.name
                        )));
                    }
                    tmp.file
                        .as_mut()
                        .expect("open temp file")
                        .write_all(&body)?;
                    hasher.update(&body);
                    left -= body.len() as u64;
                    received += body.len() as u64;
                    hooks.progress(&offer, received);
                }
                K_FILE_END => {
                    if left != 0 {
                        return Err(DtpError::Protocol(format!(
                            "{} ended {left} bytes short",
                            entry.name
                        )));
                    }
                    if body.as_slice() != hasher.finalize_reset().as_slice() {
                        return Err(DtpError::Protocol(format!(
                            "{} failed its checksum",
                            entry.name
                        )));
                    }
                    break;
                }
                K_CANCEL | K_ERROR => return Err(DtpError::Remote(remote_message(&body))),
                _ => return Err(DtpError::Protocol("unexpected frame".into())),
            }
        }
        let path = unique_path(dest, &entry.name);
        tmp.keep_as(&path)?;
        saved.push(path);
    }
    let names: Vec<String> = saved
        .iter()
        .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect();
    ch.send_json(K_DONE, &serde_json::json!({ "saved": names }))?;
    Ok(Received {
        peer,
        files: saved,
        total_bytes: total,
        code: keys.code,
    })
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/// Send `files` to the DEX listening at `addr` (`host:port`). Blocks until the receiver
/// accepts (up to `decision_timeout`) and every file is confirmed.
pub fn send(
    addr: &str,
    me: &Identity,
    files: &[PathBuf],
    hooks: &dyn SendHooks,
    decision_timeout: Duration,
) -> Result<Sent> {
    if files.is_empty() || files.len() > MAX_FILES {
        return Err(DtpError::Protocol(format!(
            "{} files is not a valid batch",
            files.len()
        )));
    }
    let mut entries = Vec::with_capacity(files.len());
    let mut total: u64 = 0;
    for p in files {
        let meta = fs::metadata(p)?;
        if !meta.is_file() {
            return Err(DtpError::Io(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("{} is not a file", p.display()),
            )));
        }
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file".into());
        total += meta.len();
        entries.push(FileEntry {
            name,
            size: meta.len(),
        });
    }

    let target = addr
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| DtpError::Io(io::Error::new(io::ErrorKind::NotFound, "no address")))?;
    let mut stream = TcpStream::connect_timeout(&target, Duration::from_secs(5))?;
    stream.set_nodelay(true).ok();
    stream.set_read_timeout(Some(HANDSHAKE_TIMEOUT))?;
    stream.set_write_timeout(Some(STREAM_TIMEOUT))?;
    let secret = EphemeralSecret::random_from_rng(OsRng);
    let my_pub = PublicKey::from(&secret);
    send_hello(&mut stream, me, &my_pub)?;
    let (peer, peer_pub) = read_hello(&mut stream)?;
    let keys = derive(&agree(secret, peer_pub)?, my_pub.as_bytes(), &peer_pub);
    hooks.handshake(&peer, &keys.code);
    let mut ch = Channel::new(stream, &keys.c2s, &keys.s2c);

    ch.send_json(K_MANIFEST, &serde_json::json!({ "files": entries }))?;
    ch.timeout(decision_timeout)?;
    let (kind, body) = ch.recv(MAX_HELLO).map_err(|e| match e {
        DtpError::Io(ref io)
            if matches!(
                io.kind(),
                io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
            ) =>
        {
            DtpError::Denied("The other device didn't answer in time.".into())
        }
        other => other,
    })?;
    if kind != K_DECISION {
        return Err(DtpError::Protocol("expected a decision".into()));
    }
    let decision: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| DtpError::Protocol("bad decision".into()))?;
    if decision.get("accept").and_then(|v| v.as_bool()) != Some(true) {
        let reason = decision
            .get("reason")
            .and_then(|r| r.as_str())
            .map(|s| clip(s, 200));
        return Err(DtpError::Denied(
            reason.unwrap_or_else(|| "The other device declined.".into()),
        ));
    }

    ch.timeout(STREAM_TIMEOUT)?;
    let mut sent: u64 = 0;
    let mut buf = vec![0u8; CHUNK];
    for (p, entry) in files.iter().zip(&entries) {
        let mut f = File::open(p)?;
        let mut hasher = Sha256::new();
        let mut left = entry.size;
        while left > 0 {
            if hooks.cancelled() {
                let _ = ch.send_json(
                    K_CANCEL,
                    &serde_json::json!({ "error": "The sender cancelled the transfer." }),
                );
                return Err(DtpError::Cancelled);
            }
            let want = (left as usize).min(CHUNK);
            let n = f.read(&mut buf[..want])?;
            if n == 0 {
                let msg = format!("{} got shorter while sending", entry.name);
                let _ = ch.send_json(K_CANCEL, &serde_json::json!({ "error": msg }));
                return Err(DtpError::Protocol(msg));
            }
            hasher.update(&buf[..n]);
            ch.send(K_CHUNK, &buf[..n])
                .map_err(|e| peer_hangup(&mut ch, e))?;
            left -= n as u64;
            sent += n as u64;
            hooks.progress(sent, total);
        }
        ch.send(K_FILE_END, hasher.finalize().as_slice())
            .map_err(|e| peer_hangup(&mut ch, e))?;
    }

    let (kind, body) = ch.recv(MAX_MANIFEST)?;
    match kind {
        K_DONE => Ok(Sent {
            peer,
            file_count: entries.len(),
            total_bytes: total,
            code: keys.code,
        }),
        K_ERROR | K_CANCEL => Err(DtpError::Remote(remote_message(&body))),
        _ => Err(DtpError::Protocol("expected done".into())),
    }
}

/// A write failed mid-stream: if the receiver left a reason (it cancelled), report that.
fn peer_hangup(ch: &mut Channel, e: DtpError) -> DtpError {
    if !matches!(e, DtpError::Io(_)) {
        return e;
    }
    let _ = ch.timeout(Duration::from_millis(500));
    match ch.recv(MAX_HELLO) {
        Ok((K_ERROR | K_CANCEL, body)) => DtpError::Remote(remote_message(&body)),
        _ => e,
    }
}

// ---------------------------------------------------------------------------
// Tests (loopback)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread;

    fn id(name: &str) -> Identity {
        Identity {
            device_id: format!("{name}-id"),
            device_name: name.into(),
            device_type: "desktop".into(),
        }
    }

    struct Rx {
        accept: bool,
        cancel_after: Option<u64>,
        seen: AtomicU64,
        offer: Mutex<Option<Offer>>,
    }

    impl ReceiveHooks for Rx {
        fn decide(&self, offer: &Offer) -> Decision {
            *self.offer.lock().unwrap() = Some(offer.clone());
            if self.accept {
                Decision::Accept
            } else {
                Decision::Deny("Not now.".into())
            }
        }
        fn progress(&self, _o: &Offer, received: u64) {
            self.seen.store(received, Ordering::SeqCst);
        }
        fn cancelled(&self) -> bool {
            self.cancel_after
                .map_or(false, |n| self.seen.load(Ordering::SeqCst) >= n)
        }
    }

    #[derive(Default)]
    struct Tx {
        code: Mutex<String>,
        cancel: AtomicBool,
    }

    impl SendHooks for Tx {
        fn handshake(&self, _p: &Identity, code: &str) {
            *self.code.lock().unwrap() = code.to_string();
        }
        fn cancelled(&self) -> bool {
            self.cancel.load(Ordering::SeqCst)
        }
    }

    fn rx(accept: bool, cancel_after: Option<u64>) -> Arc<Rx> {
        Arc::new(Rx {
            accept,
            cancel_after,
            seen: AtomicU64::new(0),
            offer: Mutex::new(None),
        })
    }

    /// One receive on a loopback listener; returns (address, join handle).
    fn serve(dest: PathBuf, hooks: Arc<Rx>) -> (String, thread::JoinHandle<Result<Received>>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap().to_string();
        let h = thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            receive(s, &id("Desk"), &dest, hooks.as_ref())
        });
        (addr, h)
    }

    fn write(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let p = dir.join(name);
        fs::write(&p, bytes).unwrap();
        p
    }

    fn leftovers(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".dtp-part"))
            .collect()
    }

    #[test]
    fn sends_files_with_matching_codes_and_checksums() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let big: Vec<u8> = (0..(CHUNK * 3 + 777))
            .map(|i| (i * 31 % 251) as u8)
            .collect();
        let a = write(src.path(), "photo.jpg", &big);
        let b = write(src.path(), "empty.txt", b"");
        fs::write(dest.path().join("photo.jpg"), b"already here").unwrap();

        let hooks = rx(true, None);
        let (addr, h) = serve(dest.path().to_path_buf(), hooks.clone());
        let tx = Tx::default();
        let sent = send(&addr, &id("Laptop"), &[a, b], &tx, Duration::from_secs(5)).unwrap();
        let got = h.join().unwrap().unwrap();

        assert_eq!(sent.file_count, 2);
        assert_eq!(sent.total_bytes, big.len() as u64);
        assert_eq!(sent.peer.device_name, "Desk");
        assert_eq!(got.peer.device_name, "Laptop");
        assert_eq!(got.code.len(), 6);
        assert_eq!(
            *tx.code.lock().unwrap(),
            got.code,
            "both sides show the same code"
        );
        assert_eq!(fs::read(dest.path().join("photo (1).jpg")).unwrap(), big);
        assert_eq!(
            fs::read(dest.path().join("photo.jpg")).unwrap(),
            b"already here",
            "existing file untouched"
        );
        assert_eq!(fs::read(dest.path().join("empty.txt")).unwrap(), b"");
        assert!(leftovers(dest.path()).is_empty());
        let offer = hooks.offer.lock().unwrap().clone().unwrap();
        assert_eq!(offer.files.len(), 2);
        assert_eq!(offer.peer_addr, "127.0.0.1");
    }

    #[test]
    fn declined_offer_writes_nothing() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let a = write(src.path(), "a.txt", b"hello");
        let (addr, h) = serve(dest.path().to_path_buf(), rx(false, None));
        let err = send(
            &addr,
            &id("Laptop"),
            &[a],
            &Tx::default(),
            Duration::from_secs(5),
        )
        .unwrap_err();
        assert!(
            matches!(err, DtpError::Denied(ref m) if m == "Not now."),
            "{err}"
        );
        assert!(matches!(h.join().unwrap(), Err(DtpError::Denied(_))));
        assert_eq!(fs::read_dir(dest.path()).unwrap().count(), 0);
    }

    #[test]
    fn receiver_cancel_removes_the_partial_file() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let a = write(src.path(), "big.bin", &vec![7u8; CHUNK * 8]);
        let (addr, h) = serve(dest.path().to_path_buf(), rx(true, Some(CHUNK as u64)));
        let err = send(
            &addr,
            &id("Laptop"),
            &[a],
            &Tx::default(),
            Duration::from_secs(5),
        )
        .unwrap_err();
        assert!(matches!(h.join().unwrap(), Err(DtpError::Cancelled)));
        assert!(!matches!(err, DtpError::Denied(_)), "{err}");
        assert_eq!(
            fs::read_dir(dest.path()).unwrap().count(),
            0,
            "no partial or final file"
        );
    }

    #[test]
    fn sender_cancel_is_reported_to_the_receiver() {
        let src = tempfile::tempdir().unwrap();
        let dest = tempfile::tempdir().unwrap();
        let a = write(src.path(), "a.bin", &vec![1u8; CHUNK * 2]);
        let (addr, h) = serve(dest.path().to_path_buf(), rx(true, None));
        let tx = Tx::default();
        tx.cancel.store(true, Ordering::SeqCst);
        assert!(matches!(
            send(&addr, &id("L"), &[a], &tx, Duration::from_secs(5)),
            Err(DtpError::Cancelled)
        ));
        assert!(
            matches!(h.join().unwrap(), Err(DtpError::Remote(ref m)) if m.contains("sender cancelled"))
        );
        assert_eq!(fs::read_dir(dest.path()).unwrap().count(), 0);
    }

    #[test]
    fn rejects_a_non_dtp_peer() {
        let dest = tempfile::tempdir().unwrap();
        let (addr, h) = serve(dest.path().to_path_buf(), rx(true, None));
        let mut s = TcpStream::connect(&addr).unwrap();
        write_frame(&mut s, br#"{"magic":"HTTP","v":1,"pub":"00","deviceId":"x","deviceName":"x","deviceType":"x"}"#).unwrap();
        assert!(matches!(h.join().unwrap(), Err(DtpError::Protocol(_))));
    }

    #[test]
    fn rejects_an_all_zero_public_key() {
        let dest = tempfile::tempdir().unwrap();
        let (addr, h) = serve(dest.path().to_path_buf(), rx(true, None));
        let mut s = TcpStream::connect(&addr).unwrap();
        let hello = Hello {
            magic: MAGIC.into(),
            v: VERSION,
            public: "0".repeat(64),
            id: id("Evil"),
        };
        write_frame(&mut s, &serde_json::to_vec(&hello).unwrap()).unwrap();
        assert!(
            matches!(h.join().unwrap(), Err(DtpError::Protocol(ref m)) if m.contains("weak key"))
        );
    }

    #[test]
    fn tampered_frame_fails_authentication() {
        let k = [9u8; 32];
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let mut a = Channel::new(TcpStream::connect(addr).unwrap(), &k, &k);
        let (b_stream, _) = l.accept().unwrap();
        let mut raw = b_stream.try_clone().unwrap();
        let mut b = Channel::new(b_stream, &k, &k);
        a.send(K_CHUNK, b"secret").unwrap();
        let mut frame = read_frame(&mut raw, 1024).unwrap();
        frame[3] ^= 1;
        let (c_stream, d_stream) = {
            let l2 = TcpListener::bind("127.0.0.1:0").unwrap();
            let c = TcpStream::connect(l2.local_addr().unwrap()).unwrap();
            (c, l2.accept().unwrap().0)
        };
        let mut c = c_stream;
        write_frame(&mut c, &frame).unwrap();
        b.stream = d_stream;
        assert!(matches!(b.recv(1024), Err(DtpError::Crypto)));
    }

    #[test]
    fn keys_differ_per_direction_and_code_is_six_digits() {
        let k = derive(&[5u8; 32], &[1u8; 32], &[2u8; 32]);
        assert_ne!(k.c2s, k.s2c);
        assert_eq!(k.code.len(), 6);
        assert!(k.code.chars().all(|c| c.is_ascii_digit()));
        let swapped = derive(&[5u8; 32], &[2u8; 32], &[1u8; 32]);
        assert_ne!(k.c2s, swapped.c2s, "salt binds the key to who sent first");
    }

    #[test]
    fn peer_names_cannot_escape_the_folder() {
        assert_eq!(sanitize_name("../../Windows/evil.dll"), "evil.dll");
        assert_eq!(sanitize_name("..\\..\\boot.ini"), "boot.ini");
        assert_eq!(sanitize_name(".."), "file");
        assert_eq!(sanitize_name(""), "file");
        assert_eq!(sanitize_name("C:\\x\\a<b>|c?.txt"), "abc.txt");
        assert_eq!(sanitize_name("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_name("com1"), "_com1");
        assert_eq!(sanitize_name("report. . "), "report");
        assert_eq!(sanitize_name("tab\tname.txt"), "tabname.txt");
        let long = format!("{}.pdf", "a".repeat(400));
        let s = sanitize_name(&long);
        assert_eq!(s.chars().count(), 200);
        assert!(s.ends_with(".pdf"));
    }
}
