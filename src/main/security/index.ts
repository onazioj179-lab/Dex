// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Security Module Exports
// Central export point for all security systems
// ===========================================================================

// Core security
export * from './SecurityCore';
export * from './SecureKeyManager';
export * from './SecureTransferHub';
export * from './PermissionManager';
export * from './IPCValidator';
export * from './NetworkHygieneMonitor';
export * from './DataMigration';

// Q1 Foundation & Trust - Hardening Systems
export * from './AuthHardening';
export * from './VaultHardening';
export * from './SessionHardening';
export * from './Q1Integration';

// Softero Antivirus
export * from './Softero';
export * from './SofteroSignatures';

// Data Encryption
export * from './DataEncryption';
