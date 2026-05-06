#!/bin/bash
# ===========================================================================
# DEX OS -- Buildroot Post-Image Script
# ===========================================================================
# Runs after Buildroot creates filesystem images. Generates the final
# bootable hybrid ISO (EFI + legacy BIOS).
# Called by Buildroot with BINARIES_DIR as $1.
# ===========================================================================

set -euo pipefail

BINARIES_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEX_OS_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BOOT_DIR="${DEX_OS_DIR}/boot"

echo "[dex-post-image] Generating bootable ISO..."

# ---------------------------------------------------------------------------
# Create ISO directory structure
# ---------------------------------------------------------------------------
ISO_DIR="${BINARIES_DIR}/iso"
rm -rf "$ISO_DIR"
mkdir -p "${ISO_DIR}/boot/grub"
mkdir -p "${ISO_DIR}/boot/grub/x86_64-efi"
mkdir -p "${ISO_DIR}/boot/grub/i386-pc"
mkdir -p "${ISO_DIR}/EFI/BOOT"

# ---------------------------------------------------------------------------
# Copy kernel and rootfs
# ---------------------------------------------------------------------------
cp "${BINARIES_DIR}/bzImage" "${ISO_DIR}/boot/"

if [ -f "${BINARIES_DIR}/rootfs.cpio.gz" ]; then
    cp "${BINARIES_DIR}/rootfs.cpio.gz" "${ISO_DIR}/boot/initramfs.img"
elif [ -f "${BINARIES_DIR}/rootfs.cpio" ]; then
    gzip -c "${BINARIES_DIR}/rootfs.cpio" > "${ISO_DIR}/boot/initramfs.img"
fi

# ---------------------------------------------------------------------------
# Install GRUB config
# ---------------------------------------------------------------------------
cp "${BOOT_DIR}/grub.cfg" "${ISO_DIR}/boot/grub/grub.cfg"

# ---------------------------------------------------------------------------
# Create EFI boot image
# ---------------------------------------------------------------------------
if [ -f "${BINARIES_DIR}/efi-part/EFI/BOOT/bootx64.efi" ]; then
    cp "${BINARIES_DIR}/efi-part/EFI/BOOT/bootx64.efi" "${ISO_DIR}/EFI/BOOT/"
fi

# ---------------------------------------------------------------------------
# Generate ISO with xorriso (hybrid: EFI + BIOS)
# ---------------------------------------------------------------------------
if command -v xorriso > /dev/null 2>&1; then
    ISO_OUT="${BINARIES_DIR}/dex-os-3.6.0-x86_64.iso"

    xorriso -as mkisofs \
        -o "$ISO_OUT" \
        -isohybrid-mbr "${BINARIES_DIR}/grub-bios.img" \
        -partition_offset 16 \
        -b boot/grub/i386-pc/eltorito.img \
        -no-emul-boot \
        -boot-load-size 4 \
        -boot-info-table \
        --grub2-boot-info \
        -eltorito-alt-boot \
        -e EFI/BOOT/bootx64.efi \
        -no-emul-boot \
        -isohybrid-gpt-basdat \
        -V "DEX_OS_320" \
        "$ISO_DIR"

    echo "[dex-post-image] ISO created: $ISO_OUT"
else
    echo "[dex-post-image] xorriso not found -- skipping ISO generation"
    echo "[dex-post-image] Install with: sudo apt install xorriso"
fi

echo "[dex-post-image] Done."
