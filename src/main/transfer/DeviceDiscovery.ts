// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Transfer Protocol -- Device Discovery
 * Discovers nearby DEX devices on the local network using UDP broadcast,
 * monitors network interfaces for direct USB connections (iOS/Android tethering),
 * and maintains a live peer list.
 */

import * as dgram from 'dgram';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import log from 'electron-log';
import { DTP_PORT, DTP_MAGIC } from './DTPProtocol';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCOVERY_PORT = 58433;
const BROADCAST_INTERVAL_MS = 15000;
const PEER_TIMEOUT_MS = 10000;
const ANNOUNCE_PREFIX = Buffer.from('DEX-DISCOVER-V1');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredDevice {
  deviceId: string;
  deviceName: string;
  deviceType: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  address: string;
  port: number;
  connectionType: 'wifi' | 'ethernet' | 'usb' | 'thunderbolt';
  estimatedSpeedMbps: number;
  lastSeen: number;
}

interface AnnouncePacket {
  magic: string;
  version: number;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  dtpPort: number;
}

// ---------------------------------------------------------------------------
// Device Discovery
// ---------------------------------------------------------------------------

export class DeviceDiscovery extends EventEmitter {
  private udpSocket: dgram.Socket | null = null;
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private peers = new Map<string, DiscoveredDevice>();
  private machineId: string;
  private running = false;

  constructor() {
    super();
    this.machineId = this.getMachineId();
  }

  /**
   * Start broadcasting presence and listening for peers.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.udpSocket.on('error', (err) => {
        log.warn('[DeviceDiscovery] Socket error:', err.message);
      });

      this.udpSocket.bind(DISCOVERY_PORT, () => {
        if (this.udpSocket) {
          this.udpSocket.setBroadcast(true);
          log.info(`[DeviceDiscovery] Listening on port ${DISCOVERY_PORT}`);
        }
      });

      // Broadcast presence periodically
      this.broadcastTimer = setInterval(() => {
        this.broadcastPresence();
      }, BROADCAST_INTERVAL_MS);

      // Broadcast immediately
      setTimeout(() => this.broadcastPresence(), 500);

      // Clean up stale peers
      this.cleanupTimer = setInterval(() => {
        this.cleanupStalePeers();
      }, PEER_TIMEOUT_MS);

      log.info('[DeviceDiscovery] Started');
    } catch (err) {
      log.error('[DeviceDiscovery] Failed to start:', err);
      this.running = false;
    }
  }

  /**
   * Stop discovery.
   */
  stop(): void {
    this.running = false;

    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch { /* ignore */ }
      this.udpSocket = null;
    }

    this.peers.clear();
    log.info('[DeviceDiscovery] Stopped');
  }

  /**
   * Get all currently visible peers.
   */
  getPeers(): DiscoveredDevice[] {
    return Array.from(this.peers.values());
  }

  /**
   * Force a refresh by broadcasting immediately.
   */
  refresh(): void {
    this.broadcastPresence();
  }

  // -----------------------------------------------------------------------
  // Broadcasting
  // -----------------------------------------------------------------------

  private broadcastPresence(): void {
    if (!this.udpSocket || !this.running) return;

    const packet: AnnouncePacket = {
      magic: DTP_MAGIC.toString(),
      version: 1,
      deviceId: this.machineId,
      deviceName: os.hostname(),
      deviceType: this.getDeviceType(),
      dtpPort: DTP_PORT,
    };

    const jsonPayload = Buffer.from(JSON.stringify(packet), 'utf8');
    const message = Buffer.concat([ANNOUNCE_PREFIX, jsonPayload]);

    // Broadcast on all network interfaces
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;

      for (const info of iface) {
        if (info.family !== 'IPv4' || info.internal) continue;

        // Calculate broadcast address
        const broadcastAddr = this.getBroadcastAddress(info.address, info.netmask);
        try {
          this.udpSocket.send(message, 0, message.length, DISCOVERY_PORT, broadcastAddr);
        } catch {
          // Interface may be down
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Message Handling
  // -----------------------------------------------------------------------

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // Verify prefix
    if (msg.length < ANNOUNCE_PREFIX.length + 2) return;
    if (!msg.subarray(0, ANNOUNCE_PREFIX.length).equals(ANNOUNCE_PREFIX)) return;

    try {
      const json = msg.subarray(ANNOUNCE_PREFIX.length).toString('utf8');
      const packet: AnnouncePacket = JSON.parse(json);

      // Validate fields
      if (packet.magic !== DTP_MAGIC.toString() || !packet.deviceId || !packet.deviceName) return;

      // Ignore self
      if (packet.deviceId === this.machineId) return;

      const connectionType = this.detectConnectionType(rinfo.address);
      const estimatedSpeed = this.estimateSpeed(connectionType);

      const device: DiscoveredDevice = {
        deviceId: packet.deviceId,
        deviceName: packet.deviceName,
        deviceType: packet.deviceType as DiscoveredDevice['deviceType'],
        address: rinfo.address,
        port: packet.dtpPort || DTP_PORT,
        connectionType,
        estimatedSpeedMbps: estimatedSpeed,
        lastSeen: Date.now(),
      };

      const isNew = !this.peers.has(packet.deviceId);
      this.peers.set(packet.deviceId, device);

      if (isNew) {
        this.emit('device-found', device);
        log.info(`[DeviceDiscovery] Found: ${device.deviceName} (${device.deviceType}) at ${device.address} via ${device.connectionType}`);
      } else {
        this.emit('device-updated', device);
      }
    } catch {
      // Malformed packet
    }
  }

  // -----------------------------------------------------------------------
  // Peer Cleanup
  // -----------------------------------------------------------------------

  private cleanupStalePeers(): void {
    const now = Date.now();
    for (const [id, device] of this.peers) {
      if (now - device.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        this.emit('device-lost', device);
        log.info(`[DeviceDiscovery] Lost: ${device.deviceName}`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Network Utils
  // -----------------------------------------------------------------------

  private detectConnectionType(address: string): DiscoveredDevice['connectionType'] {
    // USB tethered devices often appear on 169.254.x.x or 172.20.10.x (iOS hotspot)
    if (address.startsWith('169.254.')) return 'usb';
    if (address.startsWith('172.20.10.')) return 'usb';

    // Check if we share a high-speed interface with this address
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;

      const lowerName = name.toLowerCase();
      for (const info of iface) {
        if (info.family !== 'IPv4' || info.internal) continue;
        if (!this.sameSubnet(info.address, address, info.netmask)) continue;

        // Thunderbolt bridge
        if (lowerName.includes('thunderbolt') || lowerName.includes('bridge')) {
          return 'thunderbolt';
        }
        // Ethernet
        if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('enp')) {
          return 'ethernet';
        }
      }
    }

    return 'wifi';
  }

  private estimateSpeed(connectionType: DiscoveredDevice['connectionType']): number {
    switch (connectionType) {
      case 'thunderbolt': return 40000;  // 40 Gbps
      case 'ethernet': return 1000;      // 1 Gbps
      case 'usb': return 480;            // USB 2.0 default
      case 'wifi': return 600;           // Wi-Fi 6
      default: return 100;
    }
  }

  private getBroadcastAddress(ip: string, netmask: string): string {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    return ipParts.map((part, i) => (part | (~maskParts[i] & 255))).join('.');
  }

  private sameSubnet(a: string, b: string, mask: string): boolean {
    const ap = a.split('.').map(Number);
    const bp = b.split('.').map(Number);
    const mp = mask.split('.').map(Number);
    return ap.every((v, i) => (v & mp[i]) === (bp[i] & mp[i]));
  }

  private getMachineId(): string {
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name];
        if (iface) {
          for (const info of iface) {
            if (!info.internal && info.mac !== '00:00:00:00:00:00') {
              return crypto.createHash('sha256').update(info.mac + os.hostname()).digest('hex').substring(0, 32);
            }
          }
        }
      }
    } catch { /* fallback */ }
    return crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest('hex').substring(0, 32);
  }

  private getDeviceType(): string {
    switch (process.platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'macos';
      default: return 'linux';
    }
  }
}
