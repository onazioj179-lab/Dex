// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - Global Setup
 * ===========================================================================
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function globalSetup() {
  console.log('\nDEX E2E Test Setup Starting...\n');
  
  // Ensure build is up to date
  const distPath = path.join(__dirname, '../../dist');
  if (!fs.existsSync(distPath)) {
    console.log('Building DEX for E2E tests...');
    try {
      execSync('npm run build', { 
        cwd: path.join(__dirname, '../..'),
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('Build failed');
      throw error;
    }
  }
  
  // Create test data directory
  const testDataPath = path.join(__dirname, '../../test-data');
  if (!fs.existsSync(testDataPath)) {
    fs.mkdirSync(testDataPath, { recursive: true });
  }
  
  // Store setup timestamp
  process.env.E2E_SETUP_TIME = Date.now().toString();
  
  console.log('E2E Setup complete\n');
}

export default globalSetup;
