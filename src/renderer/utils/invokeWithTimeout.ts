// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX -- invokeWithTimeout
 * Wraps every ipcRenderer.invoke call with:
 * 1. A configurable timeout (default 10s)
 * 2. One automatic retry after timeout
 * 3. Structured error logging
 *
 * Usage: import { invokeWithTimeout } from './invokeWithTimeout';
 *        const result = await invokeWithTimeout('channel-name', arg1, arg2);
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Invoke an IPC channel with automatic timeout and retry.
 * Never use ipcRenderer.invoke directly -- always use this wrapper.
 */
export async function invokeWithTimeout<T = unknown>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const dex = (window as any).dex;
  if (!dex?.invoke) {
    throw new Error(`[invokeWithTimeout] IPC not available for channel: ${channel}`);
  }

  const attempt = async (timeoutMs: number): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`[invokeWithTimeout] Timeout after ${timeoutMs}ms on channel: ${channel}`));
        }
      }, timeoutMs);

      (dex.invoke(channel, ...args) as Promise<T>).then(
        (result) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(result);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(error);
          }
        },
      );
    });
  };

  try {
    return await attempt(DEFAULT_TIMEOUT_MS);
  } catch (firstError) {
    // One automatic retry
    try {
      return await attempt(DEFAULT_TIMEOUT_MS);
    } catch (retryError) {
      console.error(`[invokeWithTimeout] Failed after retry on channel: ${channel}`, retryError);
      throw retryError;
    }
  }
}

/**
 * Invoke with a custom timeout. For time-sensitive operations
 * that need shorter or longer timeouts than the default 10s.
 */
export async function invokeWithCustomTimeout<T = unknown>(
  channel: string,
  timeoutMs: number,
  ...args: unknown[]
): Promise<T> {
  const dex = (window as any).dex;
  if (!dex?.invoke) {
    throw new Error(`[invokeWithTimeout] IPC not available for channel: ${channel}`);
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`[invokeWithTimeout] Timeout after ${timeoutMs}ms on channel: ${channel}`));
      }
    }, timeoutMs);

    (dex.invoke(channel, ...args) as Promise<T>).then(
      (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}
