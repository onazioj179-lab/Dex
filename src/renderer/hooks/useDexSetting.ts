// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Read one Settings value (localStorage `dex-settings`) and re-render when the
// Settings page saves (`dex-settings-changed`) or another window writes it.
//
import { useEffect, useState } from 'react';

export function readDexSetting<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem('dex-settings') || '{}')[key];
    return v === undefined ? fallback : (v as T);
  } catch {
    return fallback;
  }
}

export function useDexSetting<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(() => readDexSetting(key, fallback));
  useEffect(() => {
    const sync = () => setValue(readDexSetting(key, fallback));
    window.addEventListener('dex-settings-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dex-settings-changed', sync);
      window.removeEventListener('storage', sync);
    };
    // fallback is a literal at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}
