#!/bin/bash
# ===========================================================================
# DEX OS -- Master Image Build Script
# ===========================================================================
# Builds the complete DEX OS bootable ISO using Buildroot.
# Prerequisites:
#   - Linux host (Ubuntu 22.04+ or similar)
#   - ~15GB free disk space
#   - Internet connection (first build downloads sources)
#   - Build tools: gcc, g++, make, patch, cpio, unzip, rsync, wget, python3
# ===========================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEX_OS_DIR="$(dirname "$SCRIPT_DIR")"
DEX_ROOT="$(dirname "$DEX_OS_DIR")"
BUILDROOT_VERSION="2024.02.3"
BUILDROOT_URL="https://buildroot.org/downloads/buildroot-${BUILDROOT_VERSION}.tar.gz"
BUILD_DIR="${DEX_OS_DIR}/build"
BUILDROOT_DIR="${BUILD_DIR}/buildroot-${BUILDROOT_VERSION}"
OUTPUT_DIR="${DEX_OS_DIR}/output"

# ---------------------------------------------------------------------------
# Colors (no emojis)
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[DEX-OS]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[DEX-OS]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[DEX-OS]${NC} $1"; }
log_error() { echo -e "${RED}[DEX-OS]${NC} $1"; }

# ---------------------------------------------------------------------------
# Step 1: Check host dependencies
# ---------------------------------------------------------------------------
check_dependencies() {
    log_info "Checking host build dependencies..."
    local missing=()
    for cmd in gcc g++ make patch cpio unzip rsync wget python3 which sed; do
        if ! command -v "$cmd" > /dev/null 2>&1; then
            missing+=("$cmd")
        fi
    done
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing tools: ${missing[*]}"
        log_error "Install with: sudo apt install build-essential cpio unzip rsync wget python3"
        exit 1
    fi
    log_ok "All build dependencies found."
}

# ---------------------------------------------------------------------------
# Step 2: Download Buildroot
# ---------------------------------------------------------------------------
download_buildroot() {
    if [ -d "$BUILDROOT_DIR" ]; then
        log_info "Buildroot already downloaded at $BUILDROOT_DIR"
        return
    fi
    log_info "Downloading Buildroot ${BUILDROOT_VERSION}..."
    mkdir -p "$BUILD_DIR"
    wget -q --show-progress -O "${BUILD_DIR}/buildroot.tar.gz" "$BUILDROOT_URL"
    log_info "Extracting Buildroot..."
    tar -xzf "${BUILD_DIR}/buildroot.tar.gz" -C "$BUILD_DIR"
    rm -f "${BUILD_DIR}/buildroot.tar.gz"
    log_ok "Buildroot extracted to $BUILDROOT_DIR"
}

# ---------------------------------------------------------------------------
# Step 3: Stage the target-compatible Tauri executable
# ---------------------------------------------------------------------------
build_dex_app() {
    : "${DEX_LINUX_APP:?Set DEX_LINUX_APP to the target-compatible Tauri Linux executable}"
    [[ -f "$DEX_LINUX_APP" ]] || { log_error "Missing Tauri Linux executable"; exit 1; }
    command -v readelf >/dev/null || { log_error "Missing dependency: readelf"; exit 1; }
    readelf -h "$DEX_LINUX_APP" | grep -q 'ELF64' || { log_error "Expected an ELF64 executable"; exit 1; }
    readelf -h "$DEX_LINUX_APP" | grep -q 'X86-64' || { log_error "Expected an x86_64 executable"; exit 1; }
    local APP_STAGE="${DEX_OS_DIR}/buildroot/app"
    install -D -m 755 "$DEX_LINUX_APP" "$APP_STAGE/dex"
    cp "${DEX_ROOT}/LICENSE" "$APP_STAGE/LICENSE"
    log_ok "Tauri executable staged; runtime ABI compatibility requires a target boot test."
}

# ---------------------------------------------------------------------------
# Step 4: Configure and build with Buildroot
# ---------------------------------------------------------------------------
build_image() {
    log_info "Configuring Buildroot with DEX defconfig..."
    cd "$BUILDROOT_DIR"

    # Use DEX OS as an external tree
    make BR2_EXTERNAL="${DEX_OS_DIR}/buildroot" BR2_DEFCONFIG="${DEX_OS_DIR}/buildroot/defconfig" defconfig


    log_info "Starting Buildroot build (this takes 30-90 minutes on first run)..."
    make -j"$(nproc)"

    log_ok "Buildroot build complete."
}

# ---------------------------------------------------------------------------
# Step 5: Package the ISO
# ---------------------------------------------------------------------------
package_iso() {
    log_info "Packaging bootable ISO..."
    mkdir -p "$OUTPUT_DIR"

    local ISO_FILE="${OUTPUT_DIR}/dex-os-7.0.1-x86_64.iso"

    # Buildroot generates the ISO if BR2_TARGET_ROOTFS_ISO9660=y
    if [ -f "${BUILDROOT_DIR}/output/images/rootfs.iso9660" ]; then
        cp "${BUILDROOT_DIR}/output/images/rootfs.iso9660" "$ISO_FILE"
    elif [ -f "${BUILDROOT_DIR}/output/images/disk.img" ]; then
        cp "${BUILDROOT_DIR}/output/images/disk.img" "${OUTPUT_DIR}/dex-os-7.0.1-x86_64.img"
        log_ok "Disk image: ${OUTPUT_DIR}/dex-os-7.0.1-x86_64.img"
    fi

    # Copy kernel and rootfs for reference
    if [ -f "${BUILDROOT_DIR}/output/images/bzImage" ]; then
        cp "${BUILDROOT_DIR}/output/images/bzImage" "${OUTPUT_DIR}/"
    fi

    if [ -f "$ISO_FILE" ]; then
        local SIZE
        SIZE=$(du -h "$ISO_FILE" | cut -f1)
        log_ok "ISO ready: $ISO_FILE ($SIZE)"
    fi

    if [[ ! -s "$ISO_FILE" && ! -s "${OUTPUT_DIR}/dex-os-7.0.1-x86_64.img" ]]; then
        log_error "No boot image was generated"; exit 1
    fi
    log_ok "Build artifacts in: $OUTPUT_DIR"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo ""
    echo "==========================================="
    echo "  DEX OS Image Builder v7.0.1"
    echo "==========================================="
    echo ""

    check_dependencies
    download_buildroot
    build_dex_app
    build_image
    package_iso

    echo ""
    log_ok "DEX OS build complete."
    echo ""
    echo "  ISO:   ${OUTPUT_DIR}/dex-os-7.0.1-x86_64.iso"
    echo "  Flash: sudo dd if=<iso> of=/dev/sdX bs=4M status=progress"
    echo "  Or:    ./make-usb.sh <iso> /dev/sdX"
    echo ""
}

main "$@"
