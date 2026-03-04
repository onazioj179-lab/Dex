#!/bin/bash
# Dex Post-Uninstall Script for Linux

# Remove desktop entry
rm -f /usr/share/applications/dex.desktop 2>/dev/null || true

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database /usr/share/applications 2>/dev/null || true
fi

# Remove symlink
rm -f /usr/local/bin/dex 2>/dev/null || true

# Clean up user config (optional - only if user requests full uninstall)
# We DO NOT delete user data by default to preserve their settings
# User can manually remove: rm -rf ~/.config/dex

echo "Dex uninstalled. User data preserved in ~/.config/dex"
