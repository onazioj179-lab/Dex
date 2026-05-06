# ===========================================================================
# DEX OS -- Buildroot Package Recipe
# ===========================================================================
# Installs the pre-built DEX Electron application into the root filesystem.
# The Electron binary and app resources are staged from the host build output.
# ===========================================================================

DEX_VERSION = 3.6.0
DEX_SITE = $(BR2_EXTERNAL_DEX_PATH)/app
DEX_SITE_METHOD = local
DEX_LICENSE = Proprietary
DEX_LICENSE_FILES = LICENSE

DEX_DEPENDENCIES = \
	xorg7 \
	mesa3d \
	alsa-lib \
	pulseaudio \
	dbus \
	nss \
	nspr \
	cups \
	at-spi2-core \
	gtk3 \
	libxkbcommon \
	fontconfig \
	pango \
	cairo \
	gdk-pixbuf \
	libnotify \
	nodejs

# ---------------------------------------------------------------------------
# Install DEX to /opt/dex
# ---------------------------------------------------------------------------
define DEX_INSTALL_TARGET_CMDS
	# Create application directory
	mkdir -p $(TARGET_DIR)/opt/dex

	# Copy the packaged Electron app (linux-unpacked output from electron-builder)
	cp -a $(DEX_SITE)/linux-unpacked/* $(TARGET_DIR)/opt/dex/

	# Create symlink for the launcher
	mkdir -p $(TARGET_DIR)/usr/local/bin
	ln -sf /opt/dex/dex $(TARGET_DIR)/usr/local/bin/dex

	# Install systemd service
	mkdir -p $(TARGET_DIR)/etc/systemd/system
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/dex-session.service \
		$(TARGET_DIR)/etc/systemd/system/dex-session.service

	# Install getty auto-login override
	mkdir -p $(TARGET_DIR)/etc/systemd/system/getty@tty1.service.d
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/dex-autologin.conf \
		$(TARGET_DIR)/etc/systemd/system/getty@tty1.service.d/override.conf

	# Install DEX launcher script
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/dex.sh \
		$(TARGET_DIR)/usr/local/bin/dex-session
	chmod 755 $(TARGET_DIR)/usr/local/bin/dex-session

	# Install Xorg config
	mkdir -p $(TARGET_DIR)/etc/X11
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/xorg.conf \
		$(TARGET_DIR)/etc/X11/xorg.conf

	# Install audio config
	mkdir -p $(TARGET_DIR)/etc/pulse
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/audio.conf \
		$(TARGET_DIR)/etc/pulse/default.pa.d/dex.pa

	# Install sysctl tuning
	mkdir -p $(TARGET_DIR)/etc/sysctl.d
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/sysctl.conf \
		$(TARGET_DIR)/etc/sysctl.d/99-dex.conf

	# Install NetworkManager config
	mkdir -p $(TARGET_DIR)/etc/NetworkManager/conf.d
	cp $(BR2_EXTERNAL_DEX_PATH)/../system/network.conf \
		$(TARGET_DIR)/etc/NetworkManager/conf.d/dex.conf

	# Create dex user (non-root, auto-login target)
	grep -q "^dex:" $(TARGET_DIR)/etc/passwd || \
		echo "dex:x:1000:1000:DEX User:/home/dex:/bin/sh" >> $(TARGET_DIR)/etc/passwd
	grep -q "^dex:" $(TARGET_DIR)/etc/group || \
		echo "dex:x:1000:" >> $(TARGET_DIR)/etc/group
	grep -q "^dex:" $(TARGET_DIR)/etc/shadow || \
		echo "dex::19000:0:99999:7:::" >> $(TARGET_DIR)/etc/shadow

	# Add dex user to required groups
	for grp in audio video input render; do \
		sed -i "s/^\($$grp:.*\)/\1,dex/" $(TARGET_DIR)/etc/group 2>/dev/null || true; \
	done

	# Create home and data directories
	mkdir -p $(TARGET_DIR)/home/dex/.config/dex
	mkdir -p $(TARGET_DIR)/home/dex/Documents
	mkdir -p $(TARGET_DIR)/home/dex/Downloads
	mkdir -p $(TARGET_DIR)/home/dex/Media

	# Enable DEX session service
	mkdir -p $(TARGET_DIR)/etc/systemd/system/graphical.target.wants
	ln -sf /etc/systemd/system/dex-session.service \
		$(TARGET_DIR)/etc/systemd/system/graphical.target.wants/dex-session.service
endef

$(eval $(generic-package))
