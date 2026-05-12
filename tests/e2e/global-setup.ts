// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
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
  
  // Ensure the renderer build is up to date (must have dist/renderer/index.html)
  const rendererIndexPath = path.join(__dirname, '../../dist/renderer/index.html');
  if (!fs.existsSync(rendererIndexPath)) {
    console.log('Renderer build missing — building renderer for E2E tests...');
    try {
      execSync('npm run build:renderer', { 
        cwd: path.join(__dirname, '../..'),
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('Renderer build failed');
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
