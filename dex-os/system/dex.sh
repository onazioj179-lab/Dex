#!/bin/sh
# ===========================================================================
# DEX OS -- Session Launcher
# ===========================================================================
# Starts Xorg (if not running), configures GPU, and launches DEX in kiosk
# mode. Called by dex-session.service as the 'dex' user.
# ===========================================================================

set -e

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
export HOME=/home/dex
export DISPLAY=:0
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"

# Ensure runtime dir exists
mkdir -p "$XDG_RUNTIME_DIR"
chmod 0700 "$XDG_RUNTIME_DIR"

# ---------------------------------------------------------------------------
# GPU detection and flags
# ---------------------------------------------------------------------------
GPU_FLAGS=""

# Detect GPU vendor
if lspci 2>/dev/null | grep -qi "VGA.*Intel"; then
    GPU_FLAGS="--enable-features=VaapiVideoDecoder --use-gl=desktop"
elif lspci 2>/dev/null | grep -qi "VGA.*AMD\|VGA.*ATI\|VGA.*Radeon"; then
    GPU_FLAGS="--enable-features=VaapiVideoDecoder --use-gl=desktop"
elif lspci 2>/dev/null | grep -qi "VGA.*NVIDIA"; then
    GPU_FLAGS="--use-gl=desktop"
else
    # Software rendering fallback
    GPU_FLAGS="--disable-gpu-compositing"
fi

# ---------------------------------------------------------------------------
# Start Xorg if not already running
# ---------------------------------------------------------------------------
if ! pgrep -x Xorg > /dev/null 2>&1; then
    /usr/bin/Xorg "$DISPLAY" vt1 -nolisten tcp -noreset -keeptty &
    XORG_PID=$!

    # Wait for X to be ready (max 10 seconds)
    TRIES=0
    while ! xdpyinfo -display "$DISPLAY" > /dev/null 2>&1; do
        TRIES=$((TRIES + 1))
        if [ "$TRIES" -ge 50 ]; then
            echo "[dex-session] ERROR: Xorg failed to start after 10 seconds"
            exit 1
        fi
        sleep 0.2
    done
fi

# ---------------------------------------------------------------------------
# Disable screen blanking and power saving
# ---------------------------------------------------------------------------
xset -dpms 2>/dev/null || true
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true

# ---------------------------------------------------------------------------
# Hide cursor after 3 seconds of inactivity
# ---------------------------------------------------------------------------
if command -v unclutter > /dev/null 2>&1; then
    unclutter -idle 3 -root &
fi

# ---------------------------------------------------------------------------
# PulseAudio
# ---------------------------------------------------------------------------
if ! pgrep -x pulseaudio > /dev/null 2>&1; then
    pulseaudio --start --daemonize=yes 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Launch DEX in kiosk mode
# ---------------------------------------------------------------------------
DEX_BINARY="/opt/dex/dex"

if [ ! -x "$DEX_BINARY" ]; then
    echo "[dex-session] ERROR: DEX binary not found at $DEX_BINARY"
    exit 1
fi

echo "[dex-session] Starting DEX OS v7.0.1"
export DEX_KIOSK=1
exec "$DEX_BINARY"
