// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Forge reliability tests (2026 fixes-first)
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  classifyExportFailure,
  buildExportRecoveryPlan,
  nextRetryAt,
  type SmartQueueOptions,
  type QueueJob,
} from '../../src/renderer/DEXAPPLICATIONS/forge/ForgeFeatures';

const smart: SmartQueueOptions = {
  priorityRules: [],
  retryCount: 3,
  retryDelay: 30,
  notifications: {
    onJobComplete: false,
    onJobError: true,
    onQueueComplete: true,
    soundEnabled: false,
    desktopNotifications: false,
  },
  autoResume: true,
};

const baseJob: Pick<QueueJob, 'id' | 'preset'> = {
  id: 'job-1',
  preset: {
    id: 'p',
    name: 'H264 Test',
    category: 'video',
    format: 'mp4',
    description: 'test',
    builtIn: true,
    settings: {
      videoCodec: 'h264',
      videoBitrate: 8000,
      resolution: { width: 1920, height: 1080 },
    },
  },
};

describe('forge reliability', () => {
  it('classifies common failure kinds', () => {
    expect(classifyExportFailure('GPU driver timeout')).toBe('device-lost');
    expect(classifyExportFailure('Out of memory while encoding')).toBe('oom');
    expect(classifyExportFailure('unknown encoder xyz')).toBe('unsupported-codec');
    expect(classifyExportFailure('something else')).toBe('unknown');
  });

  it('builds non-destructive recovery attempts with fallback/degradation', () => {
    const plan = buildExportRecoveryPlan(baseJob, smart, {
      platform: 'win32',
      gpuVendor: 'nvidia',
    }, 'timeout');

    expect(plan.nonDestructive).toBe(true);
    expect(plan.attempts).toHaveLength(4); // first + 3 retries
    expect(plan.attempts[0]!.bitrateScale).toBe(1);
    expect(plan.attempts[2]!.resolutionScale).toBeLessThanOrEqual(0.75);
    expect(plan.attempts[3]!.resolutionScale).toBeLessThanOrEqual(0.5);
  });

  it('computes linear retry schedule', () => {
    const t = nextRetryAt(1_000, 30, 2);
    expect(t).toBe(61_000);
  });
});
