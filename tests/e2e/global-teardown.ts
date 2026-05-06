// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX E2E - Global Teardown
 * ===========================================================================
 */

import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown() {
  console.log('\nDEX E2E Test Teardown...\n');
  
  // Clean up test data
  const testDataPath = path.join(__dirname, '../../test-data');
  if (fs.existsSync(testDataPath)) {
    try {
      fs.rmSync(testDataPath, { recursive: true, force: true });
      console.log('Test data cleaned up');
    } catch (error) {
      console.warn('Could not clean test data:', error);
    }
  }
  
  // Report duration
  const setupTime = parseInt(process.env.E2E_SETUP_TIME || '0', 10);
  if (setupTime) {
    const duration = Math.round((Date.now() - setupTime) / 1000);
    console.log(`Total E2E test duration: ${duration}s`);
  }
  
  console.log('E2E Teardown complete\n');
}

export default globalTeardown;
