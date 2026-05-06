#!/bin/bash
# ===========================================================================
# DEX OS -- Flash ISO to USB Drive
# ===========================================================================
# Usage: ./make-usb.sh <iso-file> <device>
# Example: ./make-usb.sh ../output/dex-os-3.6.0-x86_64.iso /dev/sdb
#
# WARNING: This will ERASE all data on the target device.
# ===========================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Validate arguments
# ---------------------------------------------------------------------------
if [ $# -lt 2 ]; then
    echo "Usage: $0 <iso-file> <device>"
    echo "Example: $0 ../output/dex-os-3.6.0-x86_64.iso /dev/sdb"
    exit 1
fi

ISO_FILE="$1"
DEVICE="$2"

if [ ! -f "$ISO_FILE" ]; then
    echo -e "${RED}[ERROR]${NC} ISO file not found: $ISO_FILE"
    exit 1
fi

if [ ! -b "$DEVICE" ]; then
    echo -e "${RED}[ERROR]${NC} Device not found or not a block device: $DEVICE"
    exit 1
fi

# Safety: refuse to write to mounted devices or /dev/sda (likely system disk)
if [ "$DEVICE" = "/dev/sda" ] || [ "$DEVICE" = "/dev/nvme0n1" ]; then
    echo -e "${RED}[ERROR]${NC} Refusing to write to $DEVICE (likely system disk)"
    echo "If you are sure, use dd manually."
    exit 1
fi

if mount | grep -q "$DEVICE"; then
    echo -e "${RED}[ERROR]${NC} Device $DEVICE has mounted partitions. Unmount first:"
    mount | grep "$DEVICE"
    exit 1
fi

# ---------------------------------------------------------------------------
# Confirm
# ---------------------------------------------------------------------------
ISO_SIZE=$(du -h "$ISO_FILE" | cut -f1)
DEV_SIZE=$(lsblk -dno SIZE "$DEVICE" 2>/dev/null || echo "unknown")

echo ""
echo "==========================================="
echo "  DEX OS USB Flasher"
echo "==========================================="
echo ""
echo "  Source:  $ISO_FILE ($ISO_SIZE)"
echo "  Target:  $DEVICE ($DEV_SIZE)"
echo ""
echo -e "  ${YELLOW}WARNING: ALL data on $DEVICE will be erased.${NC}"
echo ""
read -p "  Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# ---------------------------------------------------------------------------
# Flash
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}[DEX-OS]${NC} Flashing $ISO_FILE to $DEVICE..."

sudo dd if="$ISO_FILE" of="$DEVICE" bs=4M status=progress conv=fsync

sync

echo ""
echo -e "${GREEN}[DEX-OS]${NC} Flash complete. You can now boot from $DEVICE."
echo ""
