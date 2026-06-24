// =============================================================================
// DEX Tauri — GPU workload priority (the NATIVE half of DEX_FEATURE_BACKLOG 06).
//
// A DEX "Focus / Game Mode" skews GPU scheduling toward the foreground workload.
// Both desktop graphics APIs expose explicit per-queue priority (3-vote verified):
//   - Direct3D 12  D3D12_COMMAND_QUEUE_PRIORITY: NORMAL=0, HIGH=100,
//                  GLOBAL_REALTIME=10000  (realtime requires a privileged app +
//                  driver preemption; creation FAILS, no silent downgrade)
//   - Vulkan       VK_KHR_global_priority: LOW / MEDIUM(default) / HIGH / REALTIME
//                  (realtime can be denied to non-privileged callers)
//
// This module maps a DEX priority LEVEL to those concrete API enumerants (pure +
// cargo-tested), so the renderer can request a tier and the native GPU layer can
// apply it. The ACTUAL queue creation needs a live D3D12/Vulkan device + the
// privilege bit; `gpu-priority:apply` reports that honestly rather than faking it
// (a Tauri/WebView app can't reach the realtime queue without a native escape
// hatch — flagged as the one remaining native-API step).
//
// Channels:
//   gpu-priority:map     -> {d3d12, d3d12Value, vulkan, privileged} for a level
//   gpu-priority:levels  -> the ordered DEX levels
//   gpu-priority:apply   -> honest degrade (needs native GPU device + privilege)
// =============================================================================

use serde_json::{json, Value};

/// DEX priority levels, lowest to highest.
const LEVELS: [&str; 4] = ["background", "normal", "high", "realtime"];

struct Mapping {
    d3d12_name: &'static str,
    d3d12_value: i64,
    vulkan: &'static str,
    privileged: bool,
}

/// Map a DEX level to the D3D12 + Vulkan priority enumerants.
fn map_level(level: &str) -> Mapping {
    match level {
        // D3D12 has no below-normal queue priority; map to NORMAL but use Vulkan LOW.
        "background" => Mapping { d3d12_name: "NORMAL", d3d12_value: 0, vulkan: "LOW", privileged: false },
        "high" => Mapping { d3d12_name: "HIGH", d3d12_value: 100, vulkan: "HIGH", privileged: false },
        "realtime" => Mapping { d3d12_name: "GLOBAL_REALTIME", d3d12_value: 10000, vulkan: "REALTIME", privileged: true },
        // "normal" and any unknown fall back to the safe default.
        _ => Mapping { d3d12_name: "NORMAL", d3d12_value: 0, vulkan: "MEDIUM", privileged: false },
    }
}

fn level_of(args: &Value) -> String {
    args.get("level")
        .and_then(|l| l.as_str())
        .unwrap_or("normal")
        .to_string()
}

pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "gpu-priority:levels" => json!(LEVELS),
        "gpu-priority:map" => {
            let level = level_of(&a0);
            let m = map_level(&level);
            json!({
                "level": level,
                "d3d12": m.d3d12_name,
                "d3d12Value": m.d3d12_value,
                "vulkan": m.vulkan,
                "privileged": m.privileged,
            })
        }
        "gpu-priority:apply" => {
            // Honest degradation: applying a queue priority needs a live D3D12 /
            // Vulkan device + (for realtime) elevation, which a Tauri/WebView shell
            // cannot reach without a dedicated native GPU layer. Return the mapping
            // that WOULD be applied so the caller sees the intended policy.
            let level = level_of(&a0);
            let m = map_level(&level);
            json!({
                "ok": false,
                "reason": "GPU queue priority requires a native D3D12/Vulkan device (and elevation for realtime); not reachable from the WebView layer",
                "intended": { "level": level, "d3d12": m.d3d12_name, "vulkan": m.vulkan, "privileged": m.privileged },
            })
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_are_ordered_low_to_high() {
        assert_eq!(LEVELS, ["background", "normal", "high", "realtime"]);
    }
    #[test]
    fn d3d12_values_match_the_spec_enum() {
        assert_eq!(map_level("normal").d3d12_value, 0);
        assert_eq!(map_level("high").d3d12_value, 100);
        assert_eq!(map_level("realtime").d3d12_value, 10000);
    }
    #[test]
    fn vulkan_names_match() {
        assert_eq!(map_level("background").vulkan, "LOW");
        assert_eq!(map_level("normal").vulkan, "MEDIUM");
        assert_eq!(map_level("high").vulkan, "HIGH");
        assert_eq!(map_level("realtime").vulkan, "REALTIME");
    }
    #[test]
    fn only_realtime_is_privileged() {
        assert!(!map_level("normal").privileged);
        assert!(!map_level("high").privileged);
        assert!(map_level("realtime").privileged);
    }
    #[test]
    fn unknown_level_falls_back_to_normal() {
        let m = map_level("bogus");
        assert_eq!(m.d3d12_value, 0);
        assert_eq!(m.vulkan, "MEDIUM");
    }
}
