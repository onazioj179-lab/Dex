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
DEX_OS_DIR="$(dirname "$SCRIPT_DIR")"
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
else
    echo "[dex-post-image] Missing rootfs.cpio.gz or rootfs.cpio; cannot create a boot image" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Install GRUB config
# ---------------------------------------------------------------------------
cp "${BOOT_DIR}/grub.cfg" "${ISO_DIR}/boot/grub/grub.cfg"

# Opt-in UKI build. Keep the existing kernel/initrd and recovery entries intact.
# Explicit deployment-specific cmdline avoids baking /dev/sda2 into new UKIs.
if [[ "${DEX_BUILD_UKI:-0}" == 1 ]]; then
    : "${DEX_UKI_CMDLINE_FILE:?Set the deployment kernel command-line file}"
    : "${DEX_UKI_OS_RELEASE:?Set the generated target os-release file}"
    : "${DEX_UKI_KERNEL_VERSION:?Set the actual kernel version}"
    : "${DEX_RELEASE_VERSION:?Set the release version (target: 7.0.1)}"
    UKI_OUT="${BINARIES_DIR}/uki/dex-${DEX_RELEASE_VERSION}.efi"
    bash "${SCRIPT_DIR}/build-uki.sh" "${BINARIES_DIR}/bzImage" \
        "${ISO_DIR}/boot/initramfs.img" "$DEX_UKI_CMDLINE_FILE" \
        "$DEX_UKI_OS_RELEASE" "$DEX_UKI_KERNEL_VERSION" "$UKI_OUT"
    mkdir -p "${ISO_DIR}/EFI/Linux"
    cp "$UKI_OUT" "${ISO_DIR}/EFI/Linux/dex.efi"
    cat >> "${ISO_DIR}/boot/grub/grub.cfg" <<'GRUB_UKI'

if [ "$grub_platform" = "efi" ]; then
    menuentry "DEX OS (Unified Kernel Image)" --class os {
        chainloader /EFI/Linux/dex.efi
    }
fi
GRUB_UKI
fi

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
    ISO_OUT="${BINARIES_DIR}/dex-os-7.0.1-x86_64.iso"

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
        -V "DEX_OS_701" \
        "$ISO_DIR"

    echo "[dex-post-image] ISO created: $ISO_OUT"
else
    echo "[dex-post-image] xorriso not found -- skipping ISO generation"
    echo "[dex-post-image] Install with: sudo apt install xorriso"
fi

echo "[dex-post-image] Done."
