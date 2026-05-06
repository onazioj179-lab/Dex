// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Auto-Fill Controller
// Smart background auto-fill service
// ===========================================================================

import { ipcMain, BrowserWindow, safeStorage } from 'electron';
import Store from 'electron-store';
import { Logger } from '../utils/Logger';
import crypto from 'crypto';

const log = new Logger();

// ===========================================================================
// TYPES
// ===========================================================================

interface SavedPassword {
  id: string;
  domain: string;
  username: string;
  password: string;  // Encrypted
  createdAt: number;
  updatedAt: number;
  lastUsed?: number;
}

interface SavedAddress {
  id: string;
  label: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  createdAt: number;
}

interface SavedCard {
  id: string;
  label: string;
  lastFour: string;
  cardData: string;  // Encrypted
  expiryMonth: number;
  expiryYear: number;
  createdAt: number;
}

interface AutoFillSettings {
  enabled: boolean;
  savePasswords: boolean;
  saveAddresses: boolean;
  saveCards: boolean;
  autoFillForms: boolean;
  smartSuggestions: boolean;
}

interface FormFieldSuggestion {
  field: string;
  value: string;
  type: 'password' | 'address' | 'card' | 'text';
  confidence: number;
}

// ===========================================================================
// STORE
// ===========================================================================

const autoFillStore = new Store<{
  passwords: SavedPassword[];
  addresses: SavedAddress[];
  cards: SavedCard[];
  settings: AutoFillSettings;
  formHistory: Record<string, string[]>;  // field name -> recent values
}>({
  name: 'dex-autofill',
  encryptionKey: 'dex-autofill-secure-key',
  defaults: {
    passwords: [],
    addresses: [],
    cards: [],
    settings: {
      enabled: true,
      savePasswords: true,
      saveAddresses: true,
      saveCards: false,
      autoFillForms: true,
      smartSuggestions: true,
    },
    formHistory: {},
  },
});

// ===========================================================================
// ENCRYPTION HELPERS
// ===========================================================================

function encryptData(data: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(data);
      return encrypted.toString('base64');
    }
  } catch (err: any) {
    log.warn('[AutoFill] Encryption failed, using basic obfuscation:', err.message);
  }
  // Fallback to basic obfuscation
  return Buffer.from(data).toString('base64');
}

function decryptData(encryptedData: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encryptedData, 'base64');
      return safeStorage.decryptString(buffer);
    }
  } catch (err: any) {
    log.warn('[AutoFill] Decryption failed, attempting base64 fallback:', err.message);
  }
  // Fallback
  return Buffer.from(encryptedData, 'base64').toString('utf-8');
}

// ===========================================================================
// CONTROLLER CLASS
// ===========================================================================

class AutoFillControllerClass {
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    log.info('[AutoFill] Initializing background auto-fill service...');

    // -------------------------------------------------------------------------
    // SETTINGS
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:getSettings', async () => {
      return autoFillStore.get('settings');
    });

    ipcMain.handle('autofill:updateSettings', async (_, updates: Partial<AutoFillSettings>) => {
      const current = autoFillStore.get('settings');
      autoFillStore.set('settings', { ...current, ...updates });
      return autoFillStore.get('settings');
    });

    // -------------------------------------------------------------------------
    // PASSWORDS
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:savePassword', async (_, domain: string, username: string, password: string) => {
      if (!domain || typeof domain !== 'string' || domain.length > 2048) return null;
      if (!username || typeof username !== 'string' || username.length > 512) return null;
      if (!password || typeof password !== 'string' || password.length > 10000) return null;
      const settings = autoFillStore.get('settings');
      if (!settings.savePasswords) return null;

      const passwords = autoFillStore.get('passwords');
      const existing = passwords.find(p => p.domain === domain && p.username === username);

      if (existing) {
        existing.password = encryptData(password);
        existing.updatedAt = Date.now();
        autoFillStore.set('passwords', passwords);
        return existing.id;
      }

      const newPassword: SavedPassword = {
        id: crypto.randomUUID(),
        domain,
        username,
        password: encryptData(password),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      autoFillStore.set('passwords', [...passwords, newPassword]);
      log.info(`[AutoFill] Saved password for ${domain}`);
      return newPassword.id;
    });

    ipcMain.handle('autofill:getPasswords', async (_, domain?: string) => {
      const passwords = autoFillStore.get('passwords');
      const filtered = domain && domain.length > 0
        ? passwords.filter(p => p.domain.includes(domain))
        : passwords;
      
      // Return without decrypted passwords
      return filtered.map(p => ({
        id: p.id,
        domain: p.domain,
        username: p.username,
        createdAt: p.createdAt,
        lastUsed: p.lastUsed,
      }));
    });

    ipcMain.handle('autofill:getPassword', async (_, id: string) => {
      const passwords = autoFillStore.get('passwords');
      const found = passwords.find(p => p.id === id);
      if (!found) return null;

      // Update last used
      found.lastUsed = Date.now();
      autoFillStore.set('passwords', passwords);

      return {
        ...found,
        password: decryptData(found.password),
      };
    });

    ipcMain.handle('autofill:deletePassword', async (_, id: string) => {
      const passwords = autoFillStore.get('passwords');
      autoFillStore.set('passwords', passwords.filter(p => p.id !== id));
      return true;
    });

    // -------------------------------------------------------------------------
    // ADDRESSES
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:saveAddress', async (_, address: Omit<SavedAddress, 'id' | 'createdAt'>) => {
      const settings = autoFillStore.get('settings');
      if (!settings.saveAddresses) return null;

      const addresses = autoFillStore.get('addresses');
      const newAddress: SavedAddress = {
        ...address,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };

      autoFillStore.set('addresses', [...addresses, newAddress]);
      log.info('[AutoFill] Saved new address');
      return newAddress.id;
    });

    ipcMain.handle('autofill:getAddresses', async () => {
      return autoFillStore.get('addresses');
    });

    ipcMain.handle('autofill:deleteAddress', async (_, id: string) => {
      const addresses = autoFillStore.get('addresses');
      autoFillStore.set('addresses', addresses.filter(a => a.id !== id));
      return true;
    });

    // -------------------------------------------------------------------------
    // CARDS (Extra secure)
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:saveCard', async (_, cardData: { 
      label: string;
      number: string;
      expiryMonth: number;
      expiryYear: number;
      cvv: string;
    }) => {
      const settings = autoFillStore.get('settings');
      if (!settings.saveCards) return null;

      const cards = autoFillStore.get('cards');
      const lastFour = cardData.number.slice(-4);
      
      const newCard: SavedCard = {
        id: crypto.randomUUID(),
        label: cardData.label,
        lastFour,
        cardData: encryptData(JSON.stringify({
          number: cardData.number,
          cvv: cardData.cvv,
        })),
        expiryMonth: cardData.expiryMonth,
        expiryYear: cardData.expiryYear,
        createdAt: Date.now(),
      };

      autoFillStore.set('cards', [...cards, newCard]);
      log.info(`[AutoFill] Saved card ending in ${lastFour}`);
      return newCard.id;
    });

    ipcMain.handle('autofill:getCards', async () => {
      const cards = autoFillStore.get('cards');
      // Return without sensitive data
      return cards.map(c => ({
        id: c.id,
        label: c.label,
        lastFour: c.lastFour,
        expiryMonth: c.expiryMonth,
        expiryYear: c.expiryYear,
      }));
    });

    ipcMain.handle('autofill:deleteCard', async (_, id: string) => {
      const cards = autoFillStore.get('cards');
      autoFillStore.set('cards', cards.filter(c => c.id !== id));
      return true;
    });

    // -------------------------------------------------------------------------
    // SMART SUGGESTIONS
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:getSuggestions', async (_, context: {
      domain: string;
      fieldName: string;
      fieldType: string;
    }): Promise<FormFieldSuggestion[]> => {
      const settings = autoFillStore.get('settings');
      if (!settings.enabled || !settings.smartSuggestions) return [];

      const suggestions: FormFieldSuggestion[] = [];
      const { domain, fieldName, fieldType } = context;
      const lowerField = fieldName.toLowerCase();

      // Password suggestions
      if (fieldType === 'password' || lowerField.includes('password')) {
        const passwords = autoFillStore.get('passwords');
        const matching = passwords.filter(p => domain.includes(p.domain));
        for (const pw of matching) {
          suggestions.push({
            field: 'password',
            value: pw.username,
            type: 'password',
            confidence: 0.9,
          });
        }
      }

      // Username/email suggestions
      if (lowerField.includes('email') || lowerField.includes('user')) {
        const passwords = autoFillStore.get('passwords');
        const usernames = [...new Set(passwords.map(p => p.username))];
        for (const username of usernames.slice(0, 3)) {
          suggestions.push({
            field: 'email',
            value: username,
            type: 'text',
            confidence: 0.8,
          });
        }
      }

      // Address suggestions
      if (lowerField.includes('address') || lowerField.includes('street')) {
        const addresses = autoFillStore.get('addresses');
        for (const addr of addresses.slice(0, 3)) {
          suggestions.push({
            field: 'address',
            value: addr.street,
            type: 'address',
            confidence: 0.85,
          });
        }
      }

      // Name suggestions
      if (lowerField.includes('name') && !lowerField.includes('user')) {
        const addresses = autoFillStore.get('addresses');
        const names = [...new Set(addresses.map(a => a.name))];
        for (const name of names.slice(0, 3)) {
          suggestions.push({
            field: 'name',
            value: name,
            type: 'text',
            confidence: 0.75,
          });
        }
      }

      // Form history
      const formHistory = autoFillStore.get('formHistory');
      const historyKey = `${domain}:${fieldName}`;
      if (formHistory[historyKey]) {
        for (const value of formHistory[historyKey].slice(0, 3)) {
          suggestions.push({
            field: fieldName,
            value,
            type: 'text',
            confidence: 0.6,
          });
        }
      }

      return suggestions.sort((a, b) => b.confidence - a.confidence);
    });

    ipcMain.handle('autofill:saveFormValue', async (_, domain: string, fieldName: string, value: string) => {
      if (!value || value.length < 2) return;
      
      const formHistory = autoFillStore.get('formHistory');
      const key = `${domain}:${fieldName}`;
      
      const existing = formHistory[key] || [];
      // Keep unique, max 10 values
      const updated = [value, ...existing.filter(v => v !== value)].slice(0, 10);
      
      formHistory[key] = updated;
      autoFillStore.set('formHistory', formHistory);
    });

    // -------------------------------------------------------------------------
    // AUTO-FILL TRIGGER (Background)
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:autoFillForm', async (_, domain: string) => {
      const settings = autoFillStore.get('settings');
      if (!settings.enabled || !settings.autoFillForms) return null;

      // Get matching credentials
      const passwords = autoFillStore.get('passwords');
      const matching = passwords.find(p => domain.includes(p.domain));
      
      if (matching) {
        return {
          username: matching.username,
          password: decryptData(matching.password),
        };
      }

      return null;
    });

    // -------------------------------------------------------------------------
    // CLEAR ALL DATA
    // -------------------------------------------------------------------------

    ipcMain.handle('autofill:clearAll', async () => {
      autoFillStore.set('passwords', []);
      autoFillStore.set('addresses', []);
      autoFillStore.set('cards', []);
      autoFillStore.set('formHistory', {});
      log.info('[AutoFill] All data cleared');
      return true;
    });

    this.initialized = true;
    log.info('[AutoFill] Background service initialized');
  }

  // Get stats
  getStats() {
    return {
      passwords: autoFillStore.get('passwords').length,
      addresses: autoFillStore.get('addresses').length,
      cards: autoFillStore.get('cards').length,
    };
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const AutoFillController = new AutoFillControllerClass();
export default AutoFillController;
