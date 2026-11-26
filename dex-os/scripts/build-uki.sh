#!/bin/bash
# DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
# Build an x86_64 UKI in a build directory. Never writes an ESP or firmware.
set -euo pipefail

fail() { echo "[dex-uki] $*" >&2; exit 1; }
[[ $# == 6 ]] || fail "Usage: build-uki.sh KERNEL INITRD CMDLINE_FILE OS_RELEASE KERNEL_VERSION OUTPUT.efi"
kernel=$1 initrd=$2 cmdline=$3 os_release=$4 kernel_version=$5 output=$6
for input in "$kernel" "$initrd" "$cmdline" "$os_release"; do
    [[ -s "$input" ]] || fail "Missing or empty build input: $input"
done
[[ -n "$kernel_version" ]] || fail "Kernel version is required"
[[ ! -e "$output" ]] || fail "Refusing to overwrite existing artifact: $output"
[[ -n "${DEX_UKI_STUB:-}" && -s "$DEX_UKI_STUB" ]] || fail "Set DEX_UKI_STUB to a pinned linuxx64.efi.stub"
for tool in ukify objdump sha256sum mktemp; do
    command -v "$tool" >/dev/null || fail "Missing dependency: $tool"
done

# Signing material is supplied by the build environment, never a repository default.
signing=()
if [[ -n "${DEX_UKI_SIGNING_KEY:-}" || -n "${DEX_UKI_SIGNING_CERT:-}" ]]; then
    [[ -s "${DEX_UKI_SIGNING_KEY:-}" && -s "${DEX_UKI_SIGNING_CERT:-}" ]] || fail "Signing requires both key and certificate"
    command -v sbverify >/dev/null || fail "Missing dependency: sbverify"
    signing=(--secureboot-private-key="$DEX_UKI_SIGNING_KEY" --secureboot-certificate="$DEX_UKI_SIGNING_CERT" --signtool=sbsign)
    command -v sbsign >/dev/null || fail "Missing dependency: sbsign"
fi

mkdir -p "$(dirname "$output")"
work=$(mktemp -d "$(dirname "$output")/.dex-uki.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
ukify build --linux="$kernel" --initrd="$initrd" --cmdline="@$cmdline" \
    --os-release="@$os_release" --uname="$kernel_version" --efi-arch=x64 \
    --stub="$DEX_UKI_STUB" "${signing[@]}" --output="$work/dex.efi"
objdump -f "$work/dex.efi" | grep -q 'pei-x86-64' || fail "UKI is not x86_64 PE/COFF"
sections=$(objdump -h "$work/dex.efi")
for section in .linux .initrd .cmdline .osrel .uname; do
    awk -v name="$section" '$2 == name && $3 !~ /^0+$/ { found=1 } END { exit !found }' <<< "$sections" || fail "Missing or empty section: $section"
done
ukify inspect "$work/dex.efi"
if ((${#signing[@]})); then
    sbverify --cert "$DEX_UKI_SIGNING_CERT" "$work/dex.efi"
else
    echo "[dex-uki] Unsigned artifact: Secure Boot trust has NOT been verified."
fi
# Hard link fails if another build created the destination in the meantime.
ln "$work/dex.efi" "$output"
sha256sum "$output"
echo "[dex-uki] Artifact verified; firmware boot, recovery and rollback still require separate validation."
