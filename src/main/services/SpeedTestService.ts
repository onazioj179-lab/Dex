// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wi-Fi / network speed test service.
//
// Strategy (no third-party deps):
//   1. Resolve a small set of latency probes (ping) against a configurable
//      list of fast HTTPS endpoints. Use HEAD requests so we measure RTT
//      without bandwidth cost.
//   2. Pull a payload of known size from a configurable download endpoint
//      to measure throughput. Three sequential 1 MiB chunks; the slowest
//      one is dropped before averaging.
//   3. Optionally upload a small POST body for upload Mbps when an upload
//      endpoint is configured. When not configured we report 0 Mbps up
//      with a "upload skipped" note.
//
// All endpoints are user-configurable via update-server.json's sibling
// `network-speedtest.json` so deployments can point at internal infra.

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import log from 'electron-log';
import {
  aggregateSamples,
  classifySpeed,
  computeJitter,
  type SpeedSample,
  type SpeedTestResult,
} from '../../shared/network/speedTest';

interface SpeedTestConfig {
  pingEndpoints: string[];
  downloadEndpoints: string[];
  uploadEndpoint: string | null;
  /** Bytes to download per sample (default ~1 MiB). */
  downloadBytes: number;
  /** Number of download samples to aggregate. */
  samples: number;
  /** Hard timeout per request, ms. */
  perRequestTimeoutMs: number;
}

const DEFAULT_CONFIG: SpeedTestConfig = {
  pingEndpoints: [
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://1.1.1.1/cdn-cgi/trace',
  ],
  // Cloudflare's public speedtest endpoint takes a `?bytes=N` query.
  downloadEndpoints: ['https://speed.cloudflare.com/__down?bytes='],
  uploadEndpoint: null,
  downloadBytes: 1024 * 1024,
  samples: 3,
  perRequestTimeoutMs: 12_000,
};

function loadConfig(): SpeedTestConfig {
  try {
    const userPath = path.join(app.getPath('userData'), 'network-speedtest.json');
    if (fs.existsSync(userPath)) {
      const parsed = JSON.parse(fs.readFileSync(userPath, 'utf-8'));
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    log.warn('[SpeedTestService] Failed to load config:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function makeRequest(method: 'GET' | 'HEAD' | 'POST', urlStr: string, body: Buffer | null, timeoutMs: number): Promise<{ bytes: number; status: number }> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try { url = new URL(urlStr); } catch { return reject(new Error(`Invalid URL: ${urlStr}`)); }
    const lib = url.protocol === 'http:' ? http : https;
    const options: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'DEX-SpeedTest/1.0',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        ...(body ? { 'Content-Length': String(body.length), 'Content-Type': 'application/octet-stream' } : {}),
      },
      timeout: timeoutMs,
    };
    const req = lib.request(options, (res) => {
      let bytes = 0;
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; });
      res.on('end', () => resolve({ bytes, status: res.statusCode || 0 }));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function measurePing(config: SpeedTestConfig): Promise<{ avg: number; jitter: number; reachable: boolean }> {
  const samples: number[] = [];
  for (const endpoint of config.pingEndpoints) {
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      try {
        await makeRequest('HEAD', endpoint, null, 4000);
        samples.push(Date.now() - start);
      } catch { /* count as missed */ }
    }
  }
  if (samples.length === 0) return { avg: 0, jitter: 0, reachable: false };
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  return { avg, jitter: computeJitter(samples), reachable: true };
}

async function measureDownload(config: SpeedTestConfig): Promise<number> {
  const samples: SpeedSample[] = [];
  for (const base of config.downloadEndpoints) {
    for (let i = 0; i < config.samples; i++) {
      const url = base.endsWith('=') ? `${base}${config.downloadBytes}` : base;
      const start = Date.now();
      try {
        const { bytes } = await makeRequest('GET', url, null, config.perRequestTimeoutMs);
        const duration = Date.now() - start;
        if (bytes > 0 && duration > 0) samples.push({ bytes, durationMs: duration });
      } catch (e) {
        log.warn('[SpeedTestService] download sample failed:', (e as Error).message);
      }
    }
  }
  return aggregateSamples(samples);
}

async function measureUpload(config: SpeedTestConfig): Promise<number> {
  if (!config.uploadEndpoint) return 0;
  const samples: SpeedSample[] = [];
  const payload = Buffer.alloc(config.downloadBytes, 0x55);
  for (let i = 0; i < config.samples; i++) {
    const start = Date.now();
    try {
      await makeRequest('POST', config.uploadEndpoint, payload, config.perRequestTimeoutMs);
      const duration = Date.now() - start;
      if (duration > 0) samples.push({ bytes: payload.length, durationMs: duration });
    } catch (e) {
      log.warn('[SpeedTestService] upload sample failed:', (e as Error).message);
    }
  }
  return aggregateSamples(samples);
}

export async function runSpeedTest(): Promise<SpeedTestResult> {
  const config = loadConfig();
  const ping = await measurePing(config);
  if (!ping.reachable) {
    return {
      downloadMbps: 0,
      uploadMbps: 0,
      pingMs: 0,
      jitterMs: 0,
      quality: 'offline',
      timestamp: new Date().toISOString(),
      server: 'unreachable',
    };
  }
  const downloadMbps = await measureDownload(config);
  const uploadMbps = await measureUpload(config);
  return {
    downloadMbps,
    uploadMbps,
    pingMs: ping.avg,
    jitterMs: ping.jitter,
    quality: classifySpeed(downloadMbps),
    timestamp: new Date().toISOString(),
    server: config.downloadEndpoints[0] || 'cloudflare',
  };
}

let registered = false;

export function registerSpeedTestIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle('network:speedtest:run', async () => {
    try {
      return await runSpeedTest();
    } catch (e) {
      const error = (e as Error).message;
      log.error('[SpeedTestService] run failed:', error);
      return {
        downloadMbps: 0,
        uploadMbps: 0,
        pingMs: 0,
        jitterMs: 0,
        quality: 'offline',
        timestamp: new Date().toISOString(),
        server: 'error',
        error,
      };
    }
  });
}
