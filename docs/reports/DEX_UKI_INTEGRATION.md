# DEX: Unified Kernel Image (UKI) Integration

**Date:** 2026-11-01 · **Creator:** Onazi Oj

> Naming note: in this codebase **UKI is also the assistant's name**. This document is about the Linux boot artifact (Unified Kernel Image) in `dex-os/`. The assistant is a userspace feature and is documented in `DEX_AI_ARCHITECTURE.md`.

## Current boot path (`dex-os/`)

| Item | Finding | Evidence |
|---|---|---|
| Boot artifact | **GRUB + separate `bzImage` + `initramfs.img`**. No Unified Kernel Image. No `ukify`, `systemd-stub` or `.efi` kernel bundle | `dex-os/boot/grub.cfg` |
| Bootloader | GRUB for EFI and legacy BIOS, installed by `installer/install.sh` (`grub-install`) | `install.sh:178-196` |
| Root device (installed system) | Installer rewrites `root=/dev/sda2` to `root=UUID=<root>`; the initramfs resolves it | `install.sh:192-194` |
| Root device (live image) | Hard-coded `root=/dev/sda2`. Fails when the USB stick is not the first SATA device (e.g. a laptop with an internal SATA disk, so the USB is `sdb`) | `grub.cfg:20,34,44` |
| Secure Boot | No signing configuration. GRUB and the kernel are unsigned | no `sbsign`/`pesign`/keys in tree |
| Rollback | No A/B or previous-kernel entry. There is one Normal, one Recovery and one Install entry | `grub.cfg` |
| Recovery | "DEX OS (Recovery)" boots `rescue.target` with a shell. It does not need DEX or the assistant | `grub.cfg:33-38` |
| Shell service | `dex-session.service` starts DEX after `graphical.target`, restart-on-failure, `MemoryMax=80%`, `CPUQuota=90%` | `dex-os/system/dex-session.service` |
| Build / boot test | **Not built or booted in this environment** (no Buildroot toolchain or VM here) | — |

## Assistant and boot

The assistant is **not** part of the boot path and must not be:

- No model is loaded at boot. UKI starts with the DEX shell (userspace) and only calls a model when you send a request.
- DEX boots and works with the assistant disabled, with no provider, offline, or with Ollama missing or corrupted (requests then degrade to the local intent engine).
- Recovery does not involve the assistant at all.
- Nothing in DEX disables Secure Boot, touches firmware, or handles signing keys.

## Status against the Part 4 UKI checklist

| Requirement | Status | Why / next action |
|---|---|---|
| UKI generation | **NOT APPLICABLE today** | No UKI is built. Adopting one is a design change (systemd-boot or GRUB chainload + `ukify`) and needs owner approval because it is boot-critical |
| Kernel / initramfs compatibility | NOT TESTED | Image not built here |
| Bootloader entries | Reviewed | Live entries use `/dev/sda2`; proposed fix below |
| Secure Boot policy / signing | **MISSING** | Needs the owner's signing keys (never generated or stored by an agent) |
| Rollback | **MISSING** | Proposed: keep the previous kernel and initramfs plus a "previous" GRUB entry |
| Recovery behaviour | Present | Recovery entry exists and does not depend on DEX |
| Boot diagnostics | Partial | Recovery uses `loglevel=7`. No persistent boot log export |
| Update integration | MISSING | No kernel update path |
| AI user-session service, on-demand start, restart, limits | Partial | The assistant runs inside `dex-session.service`, which has restart and resource limits. There is no separate assistant service, and none is needed while the assistant lives in the shell process |

## Proposed changes (not applied: boot-critical, need owner approval)

1. Live image: replace `root=/dev/sda2` with `root=LABEL=DEX_ROOT`, or with `root=PARTUUID=` written at image build time. Give the rootfs that label in `post-image.sh`.
2. Add a "DEX OS (previous kernel)" entry and keep the prior `bzImage` and `initramfs.img` on update.
3. If a UKI is wanted: build `dex-linux.efi` with `ukify` (kernel + initramfs + cmdline), sign it with the owner's db key off-machine, and keep the GRUB entry as a fallback until the UKI boots on real hardware.
