// =============================================================================
// DEX Tauri — Inner-app sandbox driver (the NATIVE half of DEX_FEATURE_BACKLOG 03).
//
// The renderer/shared layer owns the host-agnostic POLICY
// (src/shared/runtime/{networkPolicy,linuxSandbox,brokeredIpc,sandboxProfile}.ts).
// This Rust module is the per-OS DRIVER that turns those policies into real
// enforcement:
//   - Linux: spawns the inner app under `bwrap` (Bubblewrap) with the
//     capability-derived argv (unprivileged user-namespace jail).
//   - Windows: computes the AppContainer network-capability set to apply via WFP /
//     capability SIDs (the actual filter install needs the Win32 FWP APIs +
//     elevation; that is the one remaining native-API step and is reported, not
//     faked).
//   - Cross-OS: evaluates per-request network + brokered-IPC decisions so the
//     dispatcher can gate live traffic.
//
// The pure decision logic is duplicated here (not bridged) so the native side can
// enforce WITHOUT a renderer round-trip, and a cargo test pins it to the same
// rules as the TS — the two layers must agree.
//
// Channels:
//   sandbox:profile       -> the full SandboxProfile (windows caps + linux argv)
//   sandbox:checkNetwork  -> {allow, reason} for a (caps, host, inbound) request
//   sandbox:checkIpc      -> {allow, reason} for a brokered IPC message
//   sandbox:launchLinux   -> spawn under bwrap (Linux) / report argv (elsewhere)
// =============================================================================

use serde_json::{json, Value};

// ---- capability helpers -----------------------------------------------------

fn caps_of(args: &Value) -> Vec<String> {
    args.get("capabilities")
        .and_then(|c| c.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn has(caps: &[String], c: &str) -> bool {
    caps.iter().any(|x| x == c)
}

// ---- network policy (mirror of networkPolicy.ts) ----------------------------

/// Windows AppContainer network-capability tokens derived from declared caps.
fn windows_network_caps(caps: &[String], inbound_internet: bool) -> Vec<String> {
    let mut out = Vec::new();
    if has(caps, "network") {
        out.push(if inbound_internet { "internetClientServer" } else { "internetClient" }.to_string());
    }
    if has(caps, "network.local") {
        out.push("privateNetworkClientServer".to_string());
    }
    out
}

#[derive(PartialEq, Debug)]
enum ReqKind { Loopback, InternetOut, InternetIn, PrivateOut, PrivateIn }

fn classify_destination(host: &str, inbound: bool) -> ReqKind {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']').to_lowercase();
    if h == "localhost" || h == "::1" || h.starts_with("127.") {
        return ReqKind::Loopback;
    }
    if is_private_host(&h) {
        return if inbound { ReqKind::PrivateIn } else { ReqKind::PrivateOut };
    }
    if inbound { ReqKind::InternetIn } else { ReqKind::InternetOut }
}

fn is_private_host(h: &str) -> bool {
    if h == "0.0.0.0" || h.ends_with(".local") { return true; }
    if h.starts_with("10.") || h.starts_with("192.168.") || h.starts_with("169.254.") { return true; }
    if h.starts_with("fe80:") || h.starts_with("fc") || h.starts_with("fd") { return true; }
    // 172.16.0.0 .. 172.31.255.255
    if let Some(rest) = h.strip_prefix("172.") {
        if let Some(octet) = rest.split('.').next() {
            if let Ok(n) = octet.parse::<u32>() {
                if (16..=31).contains(&n) { return true; }
            }
        }
    }
    false
}

/// Fail-closed network decision. `allow_loopback` is false unless the app is a
/// trusted system app (loopback goes through the broker, not raw sockets).
/// `server_optin` is the app's declared inbound-internet intent: inbound internet
/// needs internetClientServer, which `network` alone does NOT grant (mirrors the
/// TS deriveNetworkPolicy `inboundInternet` option).
fn check_network(caps: &[String], host: &str, inbound: bool, allow_loopback: bool, server_optin: bool) -> (bool, String) {
    let has_internet_client = has(caps, "network");
    let has_internet_server = server_optin && has(caps, "network");
    let has_private = has(caps, "network.local");
    match classify_destination(host, inbound) {
        ReqKind::Loopback => if allow_loopback {
            (true, "loopback permitted".into())
        } else {
            (false, "loopback blocked (use the capability broker, not localhost sockets)".into())
        },
        ReqKind::InternetOut => if has_internet_client { (true, "internetClient".into()) } else { (false, "no internetClient capability".into()) },
        ReqKind::InternetIn => if has_internet_server { (true, "internetClientServer".into()) } else { (false, "no internetClientServer capability".into()) },
        ReqKind::PrivateOut | ReqKind::PrivateIn => if has_private { (true, "privateNetworkClientServer".into()) } else { (false, "no privateNetworkClientServer capability".into()) },
    }
}

// ---- Linux bwrap argv (mirror of linuxSandbox.ts) ---------------------------

const SYSTEM_ROOTS: [&str; 6] = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"];

fn build_bwrap_args(caps: &[String], data_dir: &str, resource_dir: Option<&str>, audio_socket: Option<&str>) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    let push = |a: &mut Vec<String>, s: &str| a.push(s.to_string());

    push(&mut a, "--unshare-all");
    push(&mut a, "--die-with-parent");
    push(&mut a, "--new-session");
    push(&mut a, "--clearenv");

    if has(caps, "network") || has(caps, "network.local") {
        push(&mut a, "--share-net");
        a.push("--ro-bind".into()); a.push("/etc/resolv.conf".into()); a.push("/etc/resolv.conf".into());
        a.push("--ro-bind-try".into()); a.push("/etc/ssl".into()); a.push("/etc/ssl".into());
    }

    for root in SYSTEM_ROOTS {
        a.push("--ro-bind-try".into()); a.push(root.into()); a.push(root.into());
    }
    a.push("--proc".into()); a.push("/proc".into());
    a.push("--dev".into()); a.push("/dev".into());
    a.push("--tmpfs".into()); a.push("/tmp".into());
    a.push("--tmpfs".into()); a.push("/run".into());

    if has(caps, "files.read") {
        if let Some(rd) = resource_dir {
            a.push("--ro-bind".into()); a.push(rd.into()); a.push(rd.into());
        }
    }
    if has(caps, "files.write") {
        a.push("--bind".into()); a.push(data_dir.into()); a.push(data_dir.into());
    } else {
        a.push("--ro-bind-try".into()); a.push(data_dir.into()); a.push(data_dir.into());
    }

    if (has(caps, "audio.out") || has(caps, "audio.in")) && audio_socket.is_some() {
        let s = audio_socket.unwrap();
        a.push("--ro-bind-try".into()); a.push(s.into()); a.push(s.into());
    }
    if has(caps, "gpu") || has(caps, "gpu.compute") {
        a.push("--dev-bind-try".into()); a.push("/dev/dri".into()); a.push("/dev/dri".into());
    }

    a.push("--cap-drop".into()); a.push("ALL".into());
    a.push("--unshare-user".into());
    a
}

// ---- brokered IPC (mirror of brokeredIpc.ts) --------------------------------

fn ipc_required_cap(ns: &str) -> Option<Option<&'static str>> {
    // Outer Option: is the namespace known? Inner: which cap (None = cap-free).
    match ns {
        "clipboard" => Some(Some("clipboard")),
        "files" => Some(Some("files.read")),
        "net" => Some(Some("network")),
        "capture" => Some(Some("capture")),
        "notify" => Some(Some("notify")),
        "storage" => Some(Some("storage")),
        "audio" => Some(Some("audio.out")),
        "gpu" => Some(Some("gpu")),
        "ping" | "log" | "lifecycle" => Some(None),
        _ => None,
    }
}

fn is_write_channel(channel: &str) -> bool {
    let c = channel.to_lowercase();
    c.contains(":write") || c.contains(":create") || c.contains(":delete") || c.contains(":move") || c.contains(":put")
}

fn check_ipc(caps: &[String], to_broker: bool, channel: &str) -> (bool, String) {
    if !to_broker {
        return (false, "direct app-to-app IPC is forbidden; route via the broker".into());
    }
    let ns = channel.split(':').next().unwrap_or("");
    match ipc_required_cap(ns) {
        None => (false, format!("unknown channel namespace \"{}\"", ns)),
        Some(None) => (true, format!("{} is capability-free", ns)),
        Some(Some(_)) if ns == "files" => {
            let needed = if is_write_channel(channel) { "files.write" } else { "files.read" };
            if has(caps, needed) { (true, needed.into()) } else { (false, format!("missing {}", needed)) }
        }
        Some(Some(req)) => {
            if has(caps, req) { (true, req.into()) } else { (false, format!("missing {}", req)) }
        }
    }
}

// ---- channel dispatch -------------------------------------------------------

pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "sandbox:profile" => sandbox_profile(&a0),
        "sandbox:checkNetwork" => {
            let caps = caps_of(&a0);
            let host = a0.get("host").and_then(|h| h.as_str()).unwrap_or("");
            let inbound = a0.get("inbound").and_then(|b| b.as_bool()).unwrap_or(false);
            let allow_loopback = a0.get("allowLoopback").and_then(|b| b.as_bool()).unwrap_or(false);
            let server_optin = a0.get("inboundInternet").and_then(|b| b.as_bool()).unwrap_or(false);
            let (allow, reason) = check_network(&caps, host, inbound, allow_loopback, server_optin);
            json!({ "allow": allow, "reason": reason })
        }
        "sandbox:checkIpc" => {
            let caps = caps_of(&a0);
            let to_broker = a0.get("to").and_then(|t| t.as_str()).map(|s| s == "broker").unwrap_or(false);
            let chan = a0.get("channel").and_then(|c| c.as_str()).unwrap_or("");
            let (allow, reason) = check_ipc(&caps, to_broker, chan);
            json!({ "allow": allow, "reason": reason })
        }
        "sandbox:launchLinux" => launch_linux(&a0),
        _ => Value::Null,
    }
}

fn sandbox_profile(a0: &Value) -> Value {
    let caps = caps_of(a0);
    let data_dir = a0.get("dataDir").and_then(|d| d.as_str()).unwrap_or("/tmp/dex-app");
    let resource_dir = a0.get("resourceDir").and_then(|d| d.as_str());
    let audio_socket = a0.get("audioSocket").and_then(|d| d.as_str());
    let inbound_internet = a0.get("inboundInternet").and_then(|b| b.as_bool()).unwrap_or(false);
    json!({
        "appId": a0.get("appId").and_then(|i| i.as_str()).unwrap_or(""),
        "capabilities": caps.clone(),
        "windowsNetworkCapabilities": windows_network_caps(&caps, inbound_internet),
        "linuxBwrapArgs": build_bwrap_args(&caps, data_dir, resource_dir, audio_socket),
        "ipcMode": "brokered",
    })
}

#[cfg(target_os = "linux")]
fn launch_linux(a0: &Value) -> Value {
    use std::process::Command;
    let caps = caps_of(a0);
    let data_dir = a0.get("dataDir").and_then(|d| d.as_str()).unwrap_or("/tmp/dex-app");
    let resource_dir = a0.get("resourceDir").and_then(|d| d.as_str());
    let audio_socket = a0.get("audioSocket").and_then(|d| d.as_str());
    let cmd: Vec<String> = a0.get("command").and_then(|c| c.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    if cmd.is_empty() {
        return json!({ "ok": false, "reason": "no command to launch" });
    }
    let mut argv = build_bwrap_args(&caps, data_dir, resource_dir, audio_socket);
    argv.push("--".into());
    argv.extend(cmd);
    match Command::new("bwrap").args(&argv).spawn() {
        Ok(child) => json!({ "ok": true, "pid": child.id(), "argv": argv }),
        Err(e) => json!({ "ok": false, "reason": format!("bwrap spawn failed: {}", e), "argv": argv }),
    }
}

#[cfg(not(target_os = "linux"))]
fn launch_linux(a0: &Value) -> Value {
    // Honest degradation: the bwrap jail is Linux-only. Return the argv that WOULD
    // run so the caller can inspect the policy, plus a clear reason.
    let caps = caps_of(a0);
    let data_dir = a0.get("dataDir").and_then(|d| d.as_str()).unwrap_or("/tmp/dex-app");
    let resource_dir = a0.get("resourceDir").and_then(|d| d.as_str());
    let audio_socket = a0.get("audioSocket").and_then(|d| d.as_str());
    let argv = build_bwrap_args(&caps, data_dir, resource_dir, audio_socket);
    json!({ "ok": false, "reason": "bwrap jail is Linux-only on this host", "argv": argv })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn caps(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn network_default_deny() {
        let (a, _) = check_network(&caps(&[]), "api.openai.com", false, false, false);
        assert!(!a);
    }
    #[test]
    fn network_grants_outbound_not_inbound() {
        // 'network' grants outbound internet but NOT inbound without the server opt-in.
        assert!(check_network(&caps(&["network"]), "api.openai.com", false, false, false).0);
        assert!(!check_network(&caps(&["network"]), "api.openai.com", true, false, false).0);
        // With the server opt-in, inbound internet is allowed (internetClientServer).
        assert!(check_network(&caps(&["network"]), "api.openai.com", true, false, true).0);
    }
    #[test]
    fn loopback_denied_by_default() {
        assert!(!check_network(&caps(&["network", "network.local"]), "127.0.0.1", false, false, false).0);
        assert!(check_network(&caps(&["network"]), "localhost", false, true, false).0);
    }
    #[test]
    fn private_classification() {
        assert_eq!(classify_destination("192.168.1.5", false), ReqKind::PrivateOut);
        assert_eq!(classify_destination("172.20.0.1", false), ReqKind::PrivateOut);
        assert_eq!(classify_destination("172.40.0.1", false), ReqKind::InternetOut);
        assert_eq!(classify_destination("printer.local", false), ReqKind::PrivateOut);
    }
    #[test]
    fn windows_caps_derivation() {
        assert_eq!(windows_network_caps(&caps(&["network"]), false), vec!["internetClient"]);
        assert_eq!(windows_network_caps(&caps(&["network"]), true), vec!["internetClientServer"]);
        assert_eq!(windows_network_caps(&caps(&["network.local"]), false), vec!["privateNetworkClientServer"]);
        assert!(windows_network_caps(&caps(&[]), false).is_empty());
    }
    #[test]
    fn bwrap_default_isolation() {
        let a = build_bwrap_args(&caps(&[]), "/d", None, None);
        assert!(a.iter().any(|x| x == "--unshare-all"));
        assert!(a.iter().any(|x| x == "--cap-drop"));
        assert!(!a.iter().any(|x| x == "--share-net"));
    }
    #[test]
    fn bwrap_net_and_write() {
        assert!(build_bwrap_args(&caps(&["network"]), "/d", None, None).iter().any(|x| x == "--share-net"));
        assert!(build_bwrap_args(&caps(&["files.write"]), "/d", None, None).iter().any(|x| x == "--bind"));
        assert!(!build_bwrap_args(&caps(&["files.read"]), "/d", None, None).iter().any(|x| x == "--bind"));
    }
    #[test]
    fn ipc_routing() {
        assert!(!check_ipc(&caps(&["clipboard"]), false, "ping").0); // app-to-app forbidden
        assert!(check_ipc(&caps(&[]), true, "ping").0);              // cap-free
        assert!(check_ipc(&caps(&["clipboard"]), true, "clipboard:write").0);
        assert!(!check_ipc(&caps(&["files.read"]), true, "files:write").0);
        assert!(check_ipc(&caps(&["files.write"]), true, "files:write").0);
        assert!(!check_ipc(&caps(&[]), true, "mystery:do").0);       // unknown ns
    }
}
