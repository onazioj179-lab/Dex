# DEX OS

Bare-metal operating system that boots directly into the DEX desktop environment.

Built on a minimal Linux kernel using Buildroot. No traditional desktop environment --
DEX (Electron) is the shell. Same model as ChromeOS and SteamOS.


## Architecture

```
Hardware
  |
  BIOS/UEFI
  |
  GRUB bootloader
  |
  Linux kernel 6.6 (minimal, ~15MB)
  |
  systemd (auto-login, service management)
  |
  Xorg (modesetting driver, no window manager)
  |
  DEX (Electron, kiosk mode, fullscreen)
    |-- React UI (renderer)
    |-- Node.js (main process)
    |-- dex-cpp (C++ kernel: thread pool, mempool, cache, scheduler, profiler, I/O)
    |-- dex-native (Rust: audio, image, video, system, health, files)
```


## Hardware Requirements

| Component | Minimum           | Recommended        |
|-----------|-------------------|--------------------|
| CPU       | x86_64, 2 cores   | x86_64, 4+ cores   |
| RAM       | 4 GB              | 8 GB               |
| Storage   | 8 GB              | 32 GB SSD          |
| GPU       | OpenGL 3.3        | Vulkan-capable      |
| Network   | Ethernet or WiFi  | WiFi (Intel/Realtek)|
| USB       | 1 port (install)  | --                 |


## Directory Structure

```
dex-os/
  buildroot/
    defconfig              Buildroot board configuration
    external.desc          External tree descriptor
    board/dex/
      kernel.config        Linux kernel config fragment
    packages/dex/
      Config.in            Kconfig package entry
      dex.mk               Buildroot package recipe
  boot/
    grub.cfg               GRUB bootloader menu
  system/
    dex-session.service    systemd unit (auto-launch DEX)
    dex-autologin.conf     getty override (no password)
    dex.sh                 Session launcher (Xorg + GPU + Electron)
    network.conf           NetworkManager config
    audio.conf             PulseAudio config
    xorg.conf              Minimal Xorg config
    sysctl.conf            Kernel performance tuning
    fstab.template         Filesystem mount template
  installer/
    install.sh             Disk partitioner + installer
    partition-layout.conf  EFI/root/swap size config
  scripts/
    build-image.sh         Master build script
    make-usb.sh            Flash ISO to USB
    post-build.sh          Buildroot post-build hook
    post-image.sh          Buildroot post-image hook (ISO gen)
```


## Building

### Prerequisites (Linux host)

```
sudo apt install build-essential cpio unzip rsync wget python3 \
    bc libncurses-dev flex bison libssl-dev xorriso
```

### Build the ISO

```
cd dex-os/scripts
chmod +x *.sh
./build-image.sh
```

This will:
1. Download Buildroot 2024.02.3
2. Build the DEX Electron app for Linux x64
3. Compile the Linux kernel with DEX config
4. Build all system packages (Mesa, ALSA, NetworkManager, etc.)
5. Generate a bootable hybrid ISO (EFI + legacy BIOS)

First build takes 30-90 minutes depending on hardware. Subsequent builds are incremental.

Output: `dex-os/output/dex-os-3.6.0-x86_64.iso`


## Installing

### Option A: Boot from USB (live mode)

```
./scripts/make-usb.sh output/dex-os-3.6.0-x86_64.iso /dev/sdX
```

Boot from USB. DEX runs from the USB drive. Remove USB to return to normal.

### Option B: Install to disk

1. Boot from USB
2. Select "Install DEX OS" from the GRUB menu
3. Follow the prompts to select a target disk
4. Reboot after installation completes

Or manually:

```
./installer/install.sh /dev/sda
```


## Boot Sequence

1. BIOS/UEFI initializes hardware
2. GRUB loads kernel + initramfs (~2 seconds)
3. Linux kernel boots, systemd starts (~3 seconds)
4. Xorg starts with modesetting driver (~1 second)
5. dex-session.service launches DEX in kiosk mode (~4 seconds)
6. DEX UI renders fullscreen (~2 seconds)

Total cold boot: approximately 8-12 seconds.


## Kernel Tuning

Applied via `system/sysctl.conf`:

- vm.swappiness = 10 (keep DEX in RAM)
- vm.max_map_count = 262144 (Chromium requirement)
- fs.inotify.max_user_watches = 524288 (file watcher)
- net.ipv4.tcp_fastopen = 3 (faster transfers)
- kernel.shmmax = 2G (shared memory for GPU)


## GPU Support

| Vendor | Driver     | Status         |
|--------|-----------|----------------|
| Intel  | iris      | Full support   |
| AMD    | radeonsi  | Full support   |
| NVIDIA | nouveau   | Basic support  |
| Other  | swrast    | Software fallback |

The session launcher (`dex.sh`) auto-detects the GPU vendor and applies
appropriate Electron flags for hardware acceleration.


## Security

- Non-root user (dex) with minimal permissions
- SSH disabled by default
- systemd security hardening (ProtectSystem, PrivateTmp, NoNewPrivileges)
- File limits and resource caps on the DEX process
- No package manager in the final image (read-only root possible)


## Status

This is the foundation for DEX OS. DEX currently ships as a desktop application
for Windows, macOS, and Linux. The OS image build pipeline is ready for when
the project is prepared to produce bootable images.
