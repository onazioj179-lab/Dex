// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Encryption Controller
// Phase 16: Data Encryption & Secure Creative Space
// IPC handlers for encryption management in renderer
// ===========================================================================

import { ipcMain } from 'electron';
import { encryptionService, EncryptionConfig } from '../core/EncryptionService';
import log from 'electron-log';
import { IPCCrypto } from '../security/IPCCrypto';

// ===========================================================================
// IPC HANDLERS
// ===========================================================================

class EncryptionControllerClass {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Get encryption status
    ipcMain.handle('encryption:getStatus', () => {
      return encryptionService.getStatus();
    });

    // Get encryption config
    ipcMain.handle('encryption:getConfig', () => {
      return encryptionService.getConfig();
    });

    // Update encryption config
    ipcMain.handle('encryption:updateConfig', async (_, updates: Partial<EncryptionConfig>) => {
      return encryptionService.updateConfig(updates);
    });

    // Initialize with password
    ipcMain.handle('encryption:initWithPassword', async (_, sealed: any) => {
      try {
        const password = IPCCrypto.open(sealed);
        const success = await encryptionService.initializeWithPassword(password);
        return { success };
      } catch (error: any) {
        log.error('[EncryptionController] Init with password failed:', error);
        return { success: false, error: error.message };
      }
    });

    // Initialize with system key
    ipcMain.handle('encryption:initWithSystemKey', async () => {
      try {
        const success = await encryptionService.initializeWithSystemKey();
        return { success };
      } catch (error: any) {
        log.error('[EncryptionController] Init with system key failed:', error);
        return { success: false, error: error.message };
      }
    });

    // Unlock with password
    ipcMain.handle('encryption:unlock', async (_, sealed: any) => {
      try {
        const password = IPCCrypto.open(sealed);
        const success = await encryptionService.unlock(password);
        return { success };
      } catch (error: any) {
        log.error('[EncryptionController] Unlock failed:', error);
        return { success: false, error: error.message };
      }
    });

    // Lock encryption
    ipcMain.handle('encryption:lock', async () => {
      encryptionService.lock();
      return { success: true };
    });

    // Disable encryption
    ipcMain.handle('encryption:disable', async () => {
      try {
        const success = await encryptionService.disable();
        return { success };
      } catch (error: any) {
        log.error('[EncryptionController] Disable failed:', error);
        return { success: false, error: error.message };
      }
    });

    // Check if data is encrypted
    ipcMain.handle('encryption:isEncrypted', (_, data: any) => {
      return encryptionService.isEncrypted(data);
    });

    // Manual encrypt (for testing/debugging)
    ipcMain.handle('encryption:encrypt', async (_, data: string) => {
      const encrypted = encryptionService.encrypt(data);
      if (!encrypted) {
        return { success: false, error: 'Encryption failed or not available' };
      }
      return { success: true, data: encrypted };
    });

    // Manual decrypt (for testing/debugging)
    ipcMain.handle('encryption:decrypt', async (_, data: any) => {
      try {
        const decrypted = encryptionService.decryptIfEncrypted(data);
        return { success: true, data: decrypted };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }
}

// Export singleton
export const encryptionController = new EncryptionControllerClass();
