# DEX — Platform Compatibility Matrix

**Date:** 2026-11-01 · **Creator:** Onazi Oj

## What DEX actually is

| Layer | Reality in the repository |
|---|---|
| **DEX shell (shipping)** | A Tauri 2 desktop application: Rust core + React UI in the system WebView. **Windows only** today (`bundle.targets: nsis, msi`). It runs *on* Windows; it is not the operating system. |
| **DEX OS (`dex-os/`)** | A Buildroot Linux image concept: GRUB → Linux 6.6 bzImage → systemd → Xorg → DEX shell in kiosk mode. Build scripts exist; **no image has been built or booted in this work.** |
| Mobile | **No mobile target** (no Android/iOS project, no Tauri mobile config). |
| Boot format | GRUB + separate kernel/initramfs. **No Unified Kernel Image (UKI)**, no systemd-boot/ukify, no Secure Boot signing. |

## Support matrix

| Platform | Arch | Status | Evidence / dependency |
|---|---|---|---|
| Windows 11 (26300 tested) | x64 | **Supported, verified** | Built (MSVC), installed over 6.0.1, starts, tests pass |
| Windows 10 1809+ / 11 | x64 | Expected to work | Same WebView2 + MSVC runtime path; **not tested** on Windows 10 |
| Windows | x86 / ARM64 | Not built | Static WebView2 loader supports them; no bundle target configured |
| WebView2 runtime | Evergreen ≥ current | **Required** | Preflight detects it; missing → consent dialog → Microsoft's page. Installer embeds Microsoft's bootstrapper (needs internet) |
| Linux desktop (Tauri) | x64 | Not built | Tauri on Linux uses WebKitGTK, not WebView2; Windows-specific code (WebView2 preflight, `ms-settings:` links) is `cfg(windows)` or inert |
| DEX OS image (`dex-os/`) | x64 | **Not built / not boot-tested** | Requires Buildroot toolchain + a VM or test hardware. Known risk: `grub.cfg` hardcodes `root=/dev/sda2` (fails on NVMe/other disk layouts) |
| macOS | — | Not supported | No target |
| Android / iOS | — | Not applicable | No mobile project |

## Hardware-dependent features

| Feature | Status |
|---|---|
| Multi-monitor | Window-management code present; **not tested** (single display here) |
| Camera / microphone | Used through WebView2 permission + DEX permission pills (top bar); UKI voice now off when "Enable UKI" is off |
| Location | Off by default; Maps only uses it when enabled |
| Biometrics (Windows Hello) | Auth engine present (Part 1 history); not tested here |
| Gamepad | Games page reads gamepads; not tested (no controller) |
| GPU | WebView2 GPU process in use; no DEX driver code |

## Part 3 section applicability

| Part 3 section | Classification | Reason |
|---|---|---|
| §6 Mobile features (blur slider, EQ, family controls, biometric restart, camera artifacts, touch freezes, stylus, TV profiles) | **NOT APPLICABLE** | No mobile target. A translucency slider already exists on desktop (Appearance › Glass) |
| §7 Mac-style apps (Notes, whiteboards, weather, photos, podcasts, captions) | DEX shell feature | See `DEX_PART3_IMPLEMENTATION_REPORT.md` for per-item status |
| §8 Windows-style (file manager, autoplay, taskbar, privacy, gaming, accessibility) | DEX shell feature / Windows integration | Host-owned items (recovery, BitLocker, VPN, RDP, Sandbox, updates) are **Windows' components**; DEX cannot patch them |
| §8.8 Recovery | Out of scope | DEX must not replace Windows' recovery. DEX has its own crash recovery (boot guard, "Reset DEX data") |
| §9 Linux kernel/drivers | **BLOCKED** | Only relevant to `dex-os/`, which hasn't been built or booted; no driver changes without hardware validation |
| §10 UKI | **NOT APPLICABLE** | DEX OS uses GRUB + bzImage; there is no UKI to audit, sign or roll back |
