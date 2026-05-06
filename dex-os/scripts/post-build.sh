#!/bin/bash
# ===========================================================================
# DEX OS -- Buildroot Post-Build Script
# ===========================================================================
# Runs after Buildroot builds the root filesystem, before image creation.
# Applies system-level configuration to the target rootfs.
# Called by Buildroot with TARGET_DIR as $1.
# ===========================================================================

set -euo pipefail

TARGET_DIR="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYSTEM_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")/system"

echo "[dex-post-build] Applying DEX OS system configuration..."

# ---------------------------------------------------------------------------
# Set default systemd target to graphical
# ---------------------------------------------------------------------------
ln -sf /lib/systemd/system/graphical.target \
    "${TARGET_DIR}/etc/systemd/system/default.target"

# ---------------------------------------------------------------------------
# Set hostname
# ---------------------------------------------------------------------------
echo "dex" > "${TARGET_DIR}/etc/hostname"
cat > "${TARGET_DIR}/etc/hosts" << 'EOF'
127.0.0.1   localhost dex
::1         localhost dex
EOF

# ---------------------------------------------------------------------------
# OS release info
# ---------------------------------------------------------------------------
cat > "${TARGET_DIR}/etc/os-release" << 'EOF'
NAME="DEX OS"
VERSION="3.6.0"
ID=dex
VERSION_ID=3.6.0
PRETTY_NAME="DEX OS 3.6.0"
HOME_URL="https://github.com/onazioj/dex"
BUG_REPORT_URL="https://github.com/onazioj/dex/issues"
EOF

# ---------------------------------------------------------------------------
# Machine info (for hostnamectl)
# ---------------------------------------------------------------------------
cat > "${TARGET_DIR}/etc/machine-info" << 'EOF'
PRETTY_HOSTNAME="DEX"
ICON_NAME=computer
CHASSIS=desktop
EOF

# ---------------------------------------------------------------------------
# Set timezone to UTC by default
# ---------------------------------------------------------------------------
ln -sf /usr/share/zoneinfo/UTC "${TARGET_DIR}/etc/localtime"
echo "UTC" > "${TARGET_DIR}/etc/timezone"

# ---------------------------------------------------------------------------
# Locale
# ---------------------------------------------------------------------------
echo "LANG=en_US.UTF-8" > "${TARGET_DIR}/etc/locale.conf"

# ---------------------------------------------------------------------------
# SSH disabled by default (security)
# ---------------------------------------------------------------------------
rm -f "${TARGET_DIR}/etc/systemd/system/multi-user.target.wants/sshd.service" 2>/dev/null || true

echo "[dex-post-build] System configuration applied."
