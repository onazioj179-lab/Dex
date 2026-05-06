#!/bin/bash
# ===========================================================================
# DEX OS -- Disk Installer
# ===========================================================================
# Partitions a target disk and installs DEX OS from the live USB.
# Called from the GRUB "Install DEX OS" menu entry (dex.mode=install).
#
# Usage (manual): ./install.sh /dev/sda
#
# Partition layout (GPT):
#   1: EFI System Partition  (512 MB, FAT32)
#   2: Root filesystem       (remaining - swap, ext4)
#   3: Swap                  (2 GB)
# ===========================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[DEX-INSTALL]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[DEX-INSTALL]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[DEX-INSTALL]${NC} $1"; }
log_error() { echo -e "${RED}[DEX-INSTALL]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARTITION_CONF="${SCRIPT_DIR}/partition-layout.conf"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [ $# -lt 1 ]; then
    echo ""
    echo "==========================================="
    echo "  DEX OS Installer"
    echo "==========================================="
    echo ""
    echo "Available disks:"
    lsblk -dpno NAME,SIZE,MODEL | grep -v "loop\|sr\|ram"
    echo ""
    read -p "  Enter target disk (e.g. /dev/sda): " TARGET_DISK
else
    TARGET_DISK="$1"
fi

# ---------------------------------------------------------------------------
# Validate target
# ---------------------------------------------------------------------------
if [ ! -b "$TARGET_DISK" ]; then
    log_error "Device not found: $TARGET_DISK"
    exit 1
fi

# Refuse to install to the USB boot device
BOOT_DEV=$(findmnt -no SOURCE / 2>/dev/null | sed 's/[0-9]*$//' || echo "")
if [ "$TARGET_DISK" = "$BOOT_DEV" ]; then
    log_error "Cannot install to the boot device ($TARGET_DISK)"
    exit 1
fi

DISK_SIZE=$(lsblk -dno SIZE "$TARGET_DISK" 2>/dev/null || echo "unknown")
DISK_MODEL=$(lsblk -dno MODEL "$TARGET_DISK" 2>/dev/null || echo "unknown")

echo ""
echo "==========================================="
echo "  DEX OS Installer"
echo "==========================================="
echo ""
echo "  Target:  $TARGET_DISK ($DISK_SIZE, $DISK_MODEL)"
echo ""
echo -e "  ${YELLOW}WARNING: ALL data on $TARGET_DISK will be erased.${NC}"
echo ""
read -p "  Type 'install' to continue: " CONFIRM

if [ "$CONFIRM" != "install" ]; then
    echo "Aborted."
    exit 0
fi

# ---------------------------------------------------------------------------
# Source partition layout
# ---------------------------------------------------------------------------
EFI_SIZE="512M"
SWAP_SIZE="2G"

if [ -f "$PARTITION_CONF" ]; then
    # shellcheck source=/dev/null
    source "$PARTITION_CONF"
fi

# ---------------------------------------------------------------------------
# Partition the disk (GPT)
# ---------------------------------------------------------------------------
log_info "Partitioning $TARGET_DISK (GPT)..."

parted -s "$TARGET_DISK" mklabel gpt
parted -s "$TARGET_DISK" mkpart "EFI"  fat32 1MiB "$EFI_SIZE"
parted -s "$TARGET_DISK" set 1 esp on
parted -s "$TARGET_DISK" mkpart "root" ext4  "$EFI_SIZE" "-${SWAP_SIZE}"
parted -s "$TARGET_DISK" mkpart "swap" linux-swap "-${SWAP_SIZE}" 100%

# Get partition device names (handles nvme naming: nvme0n1p1 vs sda1)
if echo "$TARGET_DISK" | grep -q "nvme"; then
    EFI_PART="${TARGET_DISK}p1"
    ROOT_PART="${TARGET_DISK}p2"
    SWAP_PART="${TARGET_DISK}p3"
else
    EFI_PART="${TARGET_DISK}1"
    ROOT_PART="${TARGET_DISK}2"
    SWAP_PART="${TARGET_DISK}3"
fi

# ---------------------------------------------------------------------------
# Format partitions
# ---------------------------------------------------------------------------
log_info "Formatting partitions..."
mkfs.vfat -F 32 -n "DEX_EFI" "$EFI_PART"
mkfs.ext4 -L "DEX_ROOT" -F "$ROOT_PART"
mkswap -L "DEX_SWAP" "$SWAP_PART"

# ---------------------------------------------------------------------------
# Mount and copy rootfs
# ---------------------------------------------------------------------------
MOUNT_DIR="/mnt/dex-install"
mkdir -p "$MOUNT_DIR"
mount "$ROOT_PART" "$MOUNT_DIR"
mkdir -p "${MOUNT_DIR}/boot/efi"
mount "$EFI_PART" "${MOUNT_DIR}/boot/efi"

log_info "Copying root filesystem (this may take a few minutes)..."

# Copy from the live rootfs
rsync -aAXH --exclude=/proc --exclude=/sys --exclude=/dev \
    --exclude=/run --exclude=/tmp --exclude=/mnt \
    --exclude=/media --exclude=/lost+found \
    / "$MOUNT_DIR/"

# Create excluded directories
mkdir -p "${MOUNT_DIR}"/{proc,sys,dev,run,tmp,mnt,media}

# ---------------------------------------------------------------------------
# Generate fstab
# ---------------------------------------------------------------------------
log_info "Generating /etc/fstab..."
ROOT_UUID=$(blkid -s UUID -o value "$ROOT_PART")
EFI_UUID=$(blkid -s UUID -o value "$EFI_PART")
SWAP_UUID=$(blkid -s UUID -o value "$SWAP_PART")

TEMPLATE_DIR="$(dirname "$SCRIPT_DIR")/system"
if [ -f "${TEMPLATE_DIR}/fstab.template" ]; then
    sed -e "s/{{ROOT_UUID}}/$ROOT_UUID/g" \
        -e "s/{{EFI_UUID}}/$EFI_UUID/g" \
        -e "s/{{SWAP_UUID}}/$SWAP_UUID/g" \
        "${TEMPLATE_DIR}/fstab.template" > "${MOUNT_DIR}/etc/fstab"
else
    cat > "${MOUNT_DIR}/etc/fstab" << EOF
UUID=$ROOT_UUID  /          ext4  defaults,noatime,discard  0  1
UUID=$EFI_UUID   /boot/efi  vfat  defaults,umask=0077       0  2
UUID=$SWAP_UUID  none       swap  sw                        0  0
tmpfs            /tmp       tmpfs defaults,noatime,size=2G   0  0
EOF
fi

# ---------------------------------------------------------------------------
# Install GRUB bootloader
# ---------------------------------------------------------------------------
log_info "Installing GRUB bootloader..."

# Bind-mount for chroot
mount --bind /dev  "${MOUNT_DIR}/dev"
mount --bind /proc "${MOUNT_DIR}/proc"
mount --bind /sys  "${MOUNT_DIR}/sys"

# Install GRUB for EFI
chroot "$MOUNT_DIR" grub-install \
    --target=x86_64-efi \
    --efi-directory=/boot/efi \
    --bootloader-id=DEX \
    --recheck

# Install GRUB for legacy BIOS (if available)
chroot "$MOUNT_DIR" grub-install \
    --target=i386-pc \
    "$TARGET_DISK" 2>/dev/null || true

# Update GRUB config using our custom grub.cfg
BOOT_CFG_DIR="$(dirname "$SCRIPT_DIR")/boot"
if [ -f "${BOOT_CFG_DIR}/grub.cfg" ]; then
    # Update root= to match actual partition UUID
    sed "s|root=/dev/sda2|root=UUID=$ROOT_UUID|g" \
        "${BOOT_CFG_DIR}/grub.cfg" > "${MOUNT_DIR}/boot/grub/grub.cfg"
else
    chroot "$MOUNT_DIR" grub-mkconfig -o /boot/grub/grub.cfg
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
log_info "Cleaning up..."
umount "${MOUNT_DIR}/sys"  2>/dev/null || true
umount "${MOUNT_DIR}/proc" 2>/dev/null || true
umount "${MOUNT_DIR}/dev"  2>/dev/null || true
umount "${MOUNT_DIR}/boot/efi" 2>/dev/null || true
umount "$MOUNT_DIR" 2>/dev/null || true

sync

echo ""
log_ok "DEX OS installed successfully to $TARGET_DISK"
echo ""
echo "  EFI:  $EFI_PART (${EFI_SIZE})"
echo "  Root: $ROOT_PART (ext4)"
echo "  Swap: $SWAP_PART (${SWAP_SIZE})"
echo ""
echo "  Remove the USB drive and reboot to start DEX OS."
echo ""
