#!/bin/bash
# Dex Post-Install Script for Linux

# Create desktop entry
DESKTOP_FILE="/usr/share/applications/dex.desktop"
if [ ! -f "$DESKTOP_FILE" ]; then
    cat > "$DESKTOP_FILE" << 'EOF'
[Desktop Entry]
Name=Dex
Comment=Personal Control Hub for Desktop Automation
Exec=/opt/Dex/dex %U
Icon=dex
Terminal=false
Type=Application
Categories=Utility;System;
StartupNotify=true
StartupWMClass=Dex
EOF
fi

# Set permissions
chmod 755 /opt/Dex/dex 2>/dev/null || true

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database /usr/share/applications 2>/dev/null || true
fi

# Create symlink for CLI access
ln -sf /opt/Dex/dex /usr/local/bin/dex 2>/dev/null || true

echo "Dex installed successfully!"
