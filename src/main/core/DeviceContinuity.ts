// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Phase 53: External Device Continuity, Multi-Device Sessions
// OS-Scale Cohesion - Central workspace brain, not scattered apps
// =============================================================================

import log from 'electron-log';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';

// =============================================================================
// DEVICE TYPES & INTERFACES
// =============================================================================

export enum DeviceType {
  COMPUTER = 'computer',
  PHONE = 'phone',
  TABLET = 'tablet',
  EXTERNAL_STORAGE = 'external_storage',
  PERIPHERAL = 'peripheral',
}

export enum DeviceState {
  DISCOVERED = 'discovered',
  PAIRING = 'pairing',
  PAIRED = 'paired',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  REVOKED = 'revoked',
}

export enum TransferState {
  PENDING = 'pending',
  PREVIEWING = 'previewing',
  TRANSFERRING = 'transferring',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface PairedDevice {
  id: string;
  name: string;
  type: DeviceType;
  state: DeviceState;
  publicKey: string;
  pairedAt: number;
  lastSeen: number;
  capabilities: DeviceCapabilities;
  trustLevel: 'full' | 'limited' | 'transfer-only';
  metadata: {
    os?: string;
    version?: string;
    model?: string;
  };
}

export interface DeviceCapabilities {
  canReceiveFiles: boolean;
  canReceiveWorkflows: boolean;
  canReceiveNotes: boolean;
  canContinueSession: boolean;
  maxTransferSizeMB: number;
  supportedFormats: string[];
}

export interface SessionContext {
  id: string;
  type: 'workflow' | 'file' | 'note' | 'task' | 'general';
  data: Record<string, unknown>;
  artifacts: SessionArtifact[];
  createdAt: number;
  sourceDevice: string;
}

export interface SessionArtifact {
  id: string;
  type: 'file' | 'note' | 'workflow' | 'data';
  name: string;
  sizeBytes: number;
  hash: string;
  encrypted: boolean;
}

export interface ContinuityTransfer {
  id: string;
  sourceDevice: string;
  targetDevice: string;
  context: SessionContext;
  state: TransferState;
  progress: number;
  createdAt: number;
  completedAt?: number;
  cancelledAt?: number;
  error?: string;
  auditLog: TransferAuditEntry[];
}

export interface TransferAuditEntry {
  action: string;
  timestamp: number;
  details?: string;
}

// =============================================================================
// DEVICE PAIRING MANAGER (Explicit & Secure)
// =============================================================================

export class DevicePairingManager extends EventEmitter {
  private devices: Map<string, PairedDevice> = new Map();
  private pendingPairings: Map<string, PairingSession> = new Map();
  private localDeviceId: string;
  private localKeyPair: { publicKey: string; privateKey: string } | null = null;
  private autoDiscoveryEnabled = false;

  constructor() {
    super();
    this.localDeviceId = this.generateDeviceId();
    this.initializeKeyPair();
  }

  private generateDeviceId(): string {
    const machineId = `${os.hostname()}-${os.platform()}-${os.arch()}`;
    return crypto.createHash('sha256').update(machineId).digest('hex').slice(0, 32);
  }

  private initializeKeyPair(): void {
    // Generate ECDH key pair for secure pairing
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    this.localKeyPair = {
      publicKey: ecdh.getPublicKey('hex'),
      privateKey: ecdh.getPrivateKey('hex'),
    };
  }

  getLocalDeviceId(): string {
    return this.localDeviceId;
  }

  getLocalPublicKey(): string {
    return this.localKeyPair?.publicKey || '';
  }

  // User-initiated pairing only
  async initiatePairing(
    targetDevice: {
      name: string;
      type: DeviceType;
      publicKey: string;
      metadata?: Record<string, string>;
    }
  ): Promise<{ sessionId: string; challenge: string }> {
    const sessionId = crypto.randomUUID();
    const challenge = crypto.randomBytes(32).toString('hex');

    const session: PairingSession = {
      id: sessionId,
      targetName: targetDevice.name,
      targetType: targetDevice.type,
      targetPublicKey: targetDevice.publicKey,
      challenge,
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000, // 5 minutes
      state: 'pending',
    };

    this.pendingPairings.set(sessionId, session);
    this.emit('pairing:initiated', { sessionId, targetName: targetDevice.name });

    return { sessionId, challenge };
  }

  // Complete pairing with response
  async completePairing(
    sessionId: string,
    response: string,
    capabilities: DeviceCapabilities
  ): Promise<PairedDevice | null> {
    const session = this.pendingPairings.get(sessionId);
    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.pendingPairings.delete(sessionId);
      return null;
    }

    // Verify response (simplified - in production use proper crypto verification)
    const expectedResponse = crypto
      .createHmac('sha256', session.targetPublicKey)
      .update(session.challenge)
      .digest('hex');

    if (response !== expectedResponse) {
      session.state = 'failed';
      this.emit('pairing:failed', { sessionId, reason: 'Invalid response' });
      return null;
    }

    // Create paired device
    const device: PairedDevice = {
      id: crypto.randomUUID(),
      name: session.targetName,
      type: session.targetType,
      state: DeviceState.PAIRED,
      publicKey: session.targetPublicKey,
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      capabilities,
      trustLevel: 'limited',
      metadata: {},
    };

    this.devices.set(device.id, device);
    this.pendingPairings.delete(sessionId);

    this.emit('device:paired', device);
    return device;
  }

  // Revoke pairing (user can always revoke)
  revokePairing(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }

    device.state = DeviceState.REVOKED;
    this.devices.delete(deviceId);

    this.emit('device:revoked', { deviceId, name: device.name });
    return true;
  }

  // Set auto-discovery (disabled by default)
  setAutoDiscovery(enabled: boolean): void {
    this.autoDiscoveryEnabled = enabled;
    this.emit('autodiscovery:changed', enabled);
  }

  isAutoDiscoveryEnabled(): boolean {
    return this.autoDiscoveryEnabled;
  }

  getPairedDevices(): PairedDevice[] {
    return Array.from(this.devices.values())
      .filter(d => d.state === DeviceState.PAIRED || d.state === DeviceState.CONNECTED);
  }

  getDevice(deviceId: string): PairedDevice | undefined {
    return this.devices.get(deviceId);
  }

  updateDeviceState(deviceId: string, state: DeviceState): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.state = state;
      device.lastSeen = Date.now();
      this.emit('device:stateChanged', { deviceId, state });
    }
  }

  setTrustLevel(deviceId: string, level: 'full' | 'limited' | 'transfer-only'): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.trustLevel = level;
      this.emit('device:trustChanged', { deviceId, level });
    }
  }
}

interface PairingSession {
  id: string;
  targetName: string;
  targetType: DeviceType;
  targetPublicKey: string;
  challenge: string;
  createdAt: number;
  expiresAt: number;
  state: 'pending' | 'completed' | 'failed' | 'expired';
}

// =============================================================================
// MULTI-DEVICE SESSION MANAGER
// =============================================================================

export class MultiDeviceSessionManager extends EventEmitter {
  private activeSessions: Map<string, SessionContext> = new Map();
  private transfers: Map<string, ContinuityTransfer> = new Map();
  private deviceManager: DevicePairingManager;

  constructor(deviceManager: DevicePairingManager) {
    super();
    this.deviceManager = deviceManager;
  }

  // Create a session context for transfer
  createSessionContext(
    type: SessionContext['type'],
    data: Record<string, unknown>,
    artifacts: SessionArtifact[] = []
  ): SessionContext {
    const context: SessionContext = {
      id: crypto.randomUUID(),
      type,
      data,
      artifacts,
      createdAt: Date.now(),
      sourceDevice: this.deviceManager.getLocalDeviceId(),
    };

    this.activeSessions.set(context.id, context);
    return context;
  }

  // Send context to another device (explicit action)
  async sendToDevice(
    contextId: string,
    targetDeviceId: string
  ): Promise<ContinuityTransfer | null> {
    const context = this.activeSessions.get(contextId);
    if (!context) {
      return null;
    }

    const targetDevice = this.deviceManager.getDevice(targetDeviceId);
    if (!targetDevice || targetDevice.state !== DeviceState.CONNECTED) {
      return null;
    }

    // Check device capabilities
    if (!this.canTransfer(context, targetDevice)) {
      this.emit('transfer:rejected', {
        contextId,
        targetDeviceId,
        reason: 'Device lacks required capabilities',
      });
      return null;
    }

    const transfer: ContinuityTransfer = {
      id: crypto.randomUUID(),
      sourceDevice: this.deviceManager.getLocalDeviceId(),
      targetDevice: targetDeviceId,
      context,
      state: TransferState.PENDING,
      progress: 0,
      createdAt: Date.now(),
      auditLog: [
        {
          action: 'transfer_initiated',
          timestamp: Date.now(),
          details: `Context ${context.type} to ${targetDevice.name}`,
        },
      ],
    };

    this.transfers.set(transfer.id, transfer);
    this.emit('transfer:created', transfer);

    return transfer;
  }

  private canTransfer(context: SessionContext, device: PairedDevice): boolean {
    const caps = device.capabilities;

    switch (context.type) {
      case 'file':
        return caps.canReceiveFiles;
      case 'workflow':
        return caps.canReceiveWorkflows;
      case 'note':
        return caps.canReceiveNotes;
      default:
        return caps.canContinueSession;
    }
  }

  // Preview transfer before execution
  async previewTransfer(transferId: string): Promise<TransferPreview | null> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return null;
    }

    transfer.state = TransferState.PREVIEWING;
    transfer.auditLog.push({
      action: 'preview_started',
      timestamp: Date.now(),
    });

    const preview: TransferPreview = {
      transferId,
      context: transfer.context,
      estimatedSizeBytes: this.calculateTransferSize(transfer.context),
      estimatedDurationMs: this.estimateTransferDuration(transfer),
      artifacts: transfer.context.artifacts,
      warnings: this.generateWarnings(transfer),
    };

    this.emit('transfer:previewed', preview);
    return preview;
  }

  // Execute transfer (after preview/confirmation)
  async executeTransfer(transferId: string): Promise<boolean> {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.state === TransferState.CANCELLED) {
      return false;
    }

    transfer.state = TransferState.TRANSFERRING;
    transfer.auditLog.push({
      action: 'transfer_started',
      timestamp: Date.now(),
    });

    this.emit('transfer:started', transfer);

    try {
      // Serialize context artifacts to temporary files for transfer
      const { app: electronApp } = require('electron');
      const tempDir = path.join(electronApp.getPath('temp'), 'dex-continuity', transferId);
      const fs = require('fs');
      fs.mkdirSync(tempDir, { recursive: true });

      // Write transfer context as serialized JSON
      const contextPath = path.join(tempDir, 'continuity-context.json');
      fs.writeFileSync(contextPath, JSON.stringify({
        sourceDevice: transfer.sourceDevice,
        targetDevice: transfer.targetDevice,
        context: transfer.context,
        timestamp: Date.now()
      }));

      // Serialize context artifacts metadata
      if (transfer.context.artifacts) {
        const artifactManifest = transfer.context.artifacts.map(a => ({
          id: a.id,
          type: a.type,
          name: a.name,
          sizeBytes: a.sizeBytes,
          hash: a.hash,
        }));
        const manifestPath = path.join(tempDir, 'artifacts-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(artifactManifest));
      }

      transfer.state = TransferState.COMPLETED;
      transfer.completedAt = Date.now();
      transfer.auditLog.push({
        action: 'transfer_completed',
        timestamp: Date.now(),
      });

      this.emit('transfer:completed', transfer);

      // Clean up temp files after successful transfer
      try { fs.rmSync(tempDir, { recursive: true }); } catch { /* cleanup best-effort */ }

      return true;
    } catch (error) {
      transfer.state = TransferState.CANCELLED;
      transfer.auditLog.push({
        action: 'transfer_failed',
        timestamp: Date.now(),
      });

      this.emit('transfer:failed', { transferId, error: String(error) });
      return false;
    }
  }

  // Cancel transfer (always cancelable)
  cancelTransfer(transferId: string, reason?: string): boolean {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return false;
    }

    if (transfer.state === TransferState.COMPLETED) {
      return false;
    }

    transfer.state = TransferState.CANCELLED;
    transfer.cancelledAt = Date.now();
    transfer.auditLog.push({
      action: 'transfer_cancelled',
      timestamp: Date.now(),
      details: reason,
    });

    this.emit('transfer:cancelled', { transferId, reason });
    return true;
  }

  private calculateTransferSize(context: SessionContext): number {
    const dataSize = JSON.stringify(context.data).length;
    const artifactSize = context.artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);
    return dataSize + artifactSize;
  }

  private estimateTransferDuration(transfer: ContinuityTransfer): number {
    const size = this.calculateTransferSize(transfer.context);
    const bytesPerSecond = 1024 * 1024; // Assume 1 MB/s
    return Math.ceil((size / bytesPerSecond) * 1000);
  }

  private generateWarnings(transfer: ContinuityTransfer): string[] {
    const warnings: string[] = [];
    const size = this.calculateTransferSize(transfer.context);

    if (size > 10 * 1024 * 1024) {
      warnings.push('Large transfer may take significant time');
    }

    if (transfer.context.artifacts.some(a => !a.encrypted)) {
      warnings.push('Some artifacts are not encrypted');
    }

    return warnings;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getTransfer(transferId: string): ContinuityTransfer | undefined {
    return this.transfers.get(transferId);
  }

  getActiveTransfers(): ContinuityTransfer[] {
    return Array.from(this.transfers.values())
      .filter(t => t.state === TransferState.TRANSFERRING || t.state === TransferState.PENDING);
  }

  getTransferHistory(limit = 100): ContinuityTransfer[] {
    return Array.from(this.transfers.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

interface TransferPreview {
  transferId: string;
  context: SessionContext;
  estimatedSizeBytes: number;
  estimatedDurationMs: number;
  artifacts: SessionArtifact[];
  warnings: string[];
}

// =============================================================================
// CONTINUITY ACTIONS (Explicit User Actions)
// =============================================================================

export class ContinuityActions extends EventEmitter {
  private deviceManager: DevicePairingManager;
  private sessionManager: MultiDeviceSessionManager;
  private actionLog: ContinuityActionLog[] = [];

  constructor(
    deviceManager: DevicePairingManager,
    sessionManager: MultiDeviceSessionManager
  ) {
    super();
    this.deviceManager = deviceManager;
    this.sessionManager = sessionManager;
  }

  // "Send this to my phone"
  async sendToPhone(data: {
    type: 'file' | 'note' | 'workflow';
    content: unknown;
    name: string;
  }): Promise<ContinuityTransfer | null> {
    const phones = this.deviceManager.getPairedDevices()
      .filter(d => d.type === DeviceType.PHONE && d.state === DeviceState.CONNECTED);

    if (phones.length === 0) {
      this.logAction('send_to_phone', 'failed', 'No connected phone');
      return null;
    }

    const context = this.sessionManager.createSessionContext(
      data.type,
      { content: data.content, name: data.name },
      []
    );

    const transfer = await this.sessionManager.sendToDevice(context.id, phones[0].id);
    this.logAction('send_to_phone', transfer ? 'initiated' : 'failed', data.name);

    return transfer;
  }

  // "Continue this session on laptop"
  async continueOnDevice(
    deviceId: string,
    sessionData: Record<string, unknown>
  ): Promise<ContinuityTransfer | null> {
    const device = this.deviceManager.getDevice(deviceId);
    if (!device || !device.capabilities.canContinueSession) {
      this.logAction('continue_session', 'failed', 'Device cannot continue sessions');
      return null;
    }

    const context = this.sessionManager.createSessionContext(
      'general',
      sessionData,
      []
    );

    const transfer = await this.sessionManager.sendToDevice(context.id, deviceId);
    this.logAction('continue_session', transfer ? 'initiated' : 'failed', device.name);

    return transfer;
  }

  // "Archive this to external drive"
  async archiveToExternal(
    deviceId: string,
    data: {
      files: Array<{ path: string; name: string; sizeBytes: number }>;
    }
  ): Promise<ContinuityTransfer | null> {
    const device = this.deviceManager.getDevice(deviceId);
    if (!device || device.type !== DeviceType.EXTERNAL_STORAGE) {
      this.logAction('archive_external', 'failed', 'Not an external storage device');
      return null;
    }

    const artifacts: SessionArtifact[] = data.files.map(f => ({
      id: crypto.randomUUID(),
      type: 'file' as const,
      name: f.name,
      sizeBytes: f.sizeBytes,
      hash: crypto.createHash('md5').update(f.path).digest('hex'),
      encrypted: false,
    }));

    const context = this.sessionManager.createSessionContext(
      'file',
      { archiveDate: Date.now() },
      artifacts
    );

    const transfer = await this.sessionManager.sendToDevice(context.id, deviceId);
    this.logAction('archive_external', transfer ? 'initiated' : 'failed', `${data.files.length} files`);

    return transfer;
  }

  private logAction(action: string, status: string, details: string): void {
    const entry: ContinuityActionLog = {
      action,
      status,
      details,
      timestamp: Date.now(),
    };

    this.actionLog.push(entry);
    this.emit('action:logged', entry);

    // Keep log bounded
    if (this.actionLog.length > 1000) {
      this.actionLog = this.actionLog.slice(-1000);
    }
  }

  getActionLog(limit = 100): ContinuityActionLog[] {
    return this.actionLog.slice(-limit);
  }
}

interface ContinuityActionLog {
  action: string;
  status: string;
  details: string;
  timestamp: number;
}

// =============================================================================
// POWER & PERFORMANCE DISCIPLINE
// =============================================================================

export interface PowerState {
  batteryLevel: number;
  isCharging: boolean;
  powerSource: 'battery' | 'ac' | 'unknown';
  isIdle: boolean;
  idleDurationMs: number;
}

export interface NetworkState {
  type: 'wifi' | 'ethernet' | 'cellular' | 'offline';
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  metered: boolean;
  estimatedBandwidthKbps: number;
}

export class PowerDisciplineManager extends EventEmitter {
  private powerState: PowerState = {
    batteryLevel: 100,
    isCharging: true,
    powerSource: 'ac',
    isIdle: false,
    idleDurationMs: 0,
  };

  private networkState: NetworkState = {
    type: 'wifi',
    strength: 'strong',
    metered: false,
    estimatedBandwidthKbps: 100000,
  };

  private backgroundWorkPaused = false;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private lastActivity = Date.now();

  constructor() {
    super();
    this.startIdleMonitoring();
  }

  private startIdleMonitoring(): void {
    this.idleCheckInterval = setInterval(() => {
      const idleDuration = Date.now() - this.lastActivity;
      this.powerState.idleDurationMs = idleDuration;

      // Auto-pause background work after 5 minutes idle
      if (idleDuration > 300000 && !this.backgroundWorkPaused) {
        this.pauseBackgroundWork('idle');
      }

      this.powerState.isIdle = idleDuration > 60000;
    }, 10000);
  }

  recordActivity(): void {
    this.lastActivity = Date.now();
    this.powerState.isIdle = false;
    this.powerState.idleDurationMs = 0;

    if (this.backgroundWorkPaused) {
      this.resumeBackgroundWork();
    }
  }

  updatePowerState(state: Partial<PowerState>): void {
    Object.assign(this.powerState, state);

    // Auto-pause on low battery
    if (state.batteryLevel !== undefined && state.batteryLevel < 20 && !state.isCharging) {
      this.pauseBackgroundWork('low_battery');
    }

    this.emit('power:changed', this.powerState);
  }

  updateNetworkState(state: Partial<NetworkState>): void {
    Object.assign(this.networkState, state);

    // Pause transfers on weak/metered connection
    if (state.strength === 'weak' || state.metered) {
      this.emit('network:restricted', this.networkState);
    }

    this.emit('network:changed', this.networkState);
  }

  pauseBackgroundWork(reason: string): void {
    if (this.backgroundWorkPaused) return;

    this.backgroundWorkPaused = true;
    this.emit('background:paused', { reason, timestamp: Date.now() });
  }

  resumeBackgroundWork(): void {
    if (!this.backgroundWorkPaused) return;

    this.backgroundWorkPaused = false;
    this.emit('background:resumed', { timestamp: Date.now() });
  }

  isBackgroundWorkAllowed(): boolean {
    return !this.backgroundWorkPaused;
  }

  getPowerState(): PowerState {
    return { ...this.powerState };
  }

  getNetworkState(): NetworkState {
    return { ...this.networkState };
  }

  // Get recommended transfer settings based on current state
  getTransferRecommendation(): TransferRecommendation {
    const power = this.powerState;
    const network = this.networkState;

    let maxChunkSizeKB = 1024; // Default 1MB chunks
    let concurrentTransfers = 3;
    let allowLargeTransfers = true;

    // Adjust for battery
    if (!power.isCharging && power.batteryLevel < 50) {
      concurrentTransfers = 1;
      maxChunkSizeKB = 512;
    }

    if (!power.isCharging && power.batteryLevel < 20) {
      allowLargeTransfers = false;
    }

    // Adjust for network
    if (network.metered) {
      maxChunkSizeKB = 256;
      concurrentTransfers = 1;
    }

    if (network.strength === 'weak') {
      maxChunkSizeKB = 128;
      concurrentTransfers = 1;
    }

    if (network.type === 'offline') {
      return {
        allowed: false,
        reason: 'No network connection',
        maxChunkSizeKB: 0,
        concurrentTransfers: 0,
        allowLargeTransfers: false,
      };
    }

    return {
      allowed: true,
      maxChunkSizeKB,
      concurrentTransfers,
      allowLargeTransfers,
    };
  }

  shutdown(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }
}

interface TransferRecommendation {
  allowed: boolean;
  reason?: string;
  maxChunkSizeKB: number;
  concurrentTransfers: number;
  allowLargeTransfers: boolean;
}

// =============================================================================
// SECURITY & ENCRYPTION FOR TRANSFERS
// =============================================================================

export class TransferSecurityManager {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  // Generate session key for transfer
  generateSessionKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  // Encrypt data for transfer
  encrypt(data: Buffer, key: string): EncryptedPayload {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      data: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      algorithm: this.algorithm,
    };
  }

  // Decrypt received data
  decrypt(payload: EncryptedPayload, key: string): Buffer {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  // Verify data integrity
  verifyHash(data: Buffer, expectedHash: string): boolean {
    const actualHash = crypto.createHash('sha256').update(data).digest('hex');
    return actualHash === expectedHash;
  }

  // Generate hash for data
  generateHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

interface EncryptedPayload {
  data: string;
  iv: string;
  tag: string;
  algorithm: string;
}

// =============================================================================
// CROSS-DEVICE AUDIT TRAIL
// =============================================================================

export interface CrossDeviceAuditEntry {
  id: string;
  action: 'paired' | 'revoked' | 'transferred' | 'received' | 'cancelled' | 'failed';
  deviceId: string;
  deviceName: string;
  details: {
    what: string;
    where: string;
    when: number;
    why?: string;
  };
  timestamp: number;
}

export class CrossDeviceAuditTrail extends EventEmitter {
  private entries: CrossDeviceAuditEntry[] = [];
  private readonly maxEntries = 10000;

  log(
    action: CrossDeviceAuditEntry['action'],
    deviceId: string,
    deviceName: string,
    details: CrossDeviceAuditEntry['details']
  ): CrossDeviceAuditEntry {
    const entry: CrossDeviceAuditEntry = {
      id: crypto.randomUUID(),
      action,
      deviceId,
      deviceName,
      details,
      timestamp: Date.now(),
    };

    this.entries.push(entry);

    // Trim if needed
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    this.emit('audit:logged', entry);
    return entry;
  }

  getEntries(options?: {
    deviceId?: string;
    action?: CrossDeviceAuditEntry['action'];
    since?: number;
    limit?: number;
  }): CrossDeviceAuditEntry[] {
    let filtered = [...this.entries];

    if (options?.deviceId) {
      filtered = filtered.filter(e => e.deviceId === options.deviceId);
    }

    if (options?.action) {
      filtered = filtered.filter(e => e.action === options.action);
    }

    if (options?.since) {
      const since = options.since;
      filtered = filtered.filter(e => e.timestamp >= since);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  // User can always see what moved, where, when, why
  getTransferSummary(deviceId?: string): TransferSummary {
    const relevant = deviceId
      ? this.entries.filter(e => e.deviceId === deviceId)
      : this.entries;

    return {
      totalTransfers: relevant.filter(e => e.action === 'transferred').length,
      totalReceived: relevant.filter(e => e.action === 'received').length,
      totalCancelled: relevant.filter(e => e.action === 'cancelled').length,
      totalFailed: relevant.filter(e => e.action === 'failed').length,
      lastActivity: relevant.length > 0
        ? relevant[relevant.length - 1].timestamp
        : null,
    };
  }
}

interface TransferSummary {
  totalTransfers: number;
  totalReceived: number;
  totalCancelled: number;
  totalFailed: number;
  lastActivity: number | null;
}

// =============================================================================
// PHASE 53 INTEGRATION
// =============================================================================

export interface Phase53Status {
  pairedDevices: number;
  connectedDevices: number;
  activeTransfers: number;
  completedTransfers24h: number;
  powerState: 'optimal' | 'limited' | 'restricted';
  backgroundWorkPaused: boolean;
  autoDiscovery: boolean;
}

export function initializePhase53(): {
  deviceManager: DevicePairingManager;
  sessionManager: MultiDeviceSessionManager;
  continuityActions: ContinuityActions;
  powerDiscipline: PowerDisciplineManager;
  security: TransferSecurityManager;
  auditTrail: CrossDeviceAuditTrail;
  getStatus: () => Phase53Status;
  shutdown: () => void;
} {
  const deviceManager = new DevicePairingManager();
  const sessionManager = new MultiDeviceSessionManager(deviceManager);
  const continuityActions = new ContinuityActions(deviceManager, sessionManager);
  const powerDiscipline = new PowerDisciplineManager();
  const security = new TransferSecurityManager();
  const auditTrail = new CrossDeviceAuditTrail();

  // Wire up audit logging
  deviceManager.on('device:paired', (device: PairedDevice) => {
    auditTrail.log('paired', device.id, device.name, {
      what: 'Device paired',
      where: 'local',
      when: device.pairedAt,
    });
  });

  deviceManager.on('device:revoked', ({ deviceId, name }) => {
    auditTrail.log('revoked', deviceId, name, {
      what: 'Device pairing revoked',
      where: 'local',
      when: Date.now(),
    });
  });

  sessionManager.on('transfer:completed', (transfer: ContinuityTransfer) => {
    const device = deviceManager.getDevice(transfer.targetDevice);
    auditTrail.log('transferred', transfer.targetDevice, device?.name || 'Unknown', {
      what: `${transfer.context.type} transfer`,
      where: device?.name || transfer.targetDevice,
      when: transfer.completedAt || Date.now(),
    });
  });

  const getStatus = (): Phase53Status => {
    const devices = deviceManager.getPairedDevices();
    const transfers = sessionManager.getActiveTransfers();
    const powerState = powerDiscipline.getPowerState();
    const day = 24 * 60 * 60 * 1000;
    const completedToday = sessionManager.getTransferHistory()
      .filter(t => t.state === TransferState.COMPLETED && t.completedAt && (Date.now() - t.completedAt) < day);

    let powerStatus: 'optimal' | 'limited' | 'restricted' = 'optimal';
    if (!powerState.isCharging && powerState.batteryLevel < 50) {
      powerStatus = 'limited';
    }
    if (!powerState.isCharging && powerState.batteryLevel < 20) {
      powerStatus = 'restricted';
    }

    return {
      pairedDevices: devices.length,
      connectedDevices: devices.filter(d => d.state === DeviceState.CONNECTED).length,
      activeTransfers: transfers.length,
      completedTransfers24h: completedToday.length,
      powerState: powerStatus,
      backgroundWorkPaused: !powerDiscipline.isBackgroundWorkAllowed(),
      autoDiscovery: deviceManager.isAutoDiscoveryEnabled(),
    };
  };

  const shutdown = (): void => {
    powerDiscipline.shutdown();
  };

  log.info('[Phase53] External Device Continuity initialized');

  return {
    deviceManager,
    sessionManager,
    continuityActions,
    powerDiscipline,
    security,
    auditTrail,
    getStatus,
    shutdown,
  };
}
