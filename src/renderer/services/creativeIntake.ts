// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useEffect, useRef } from 'react';

type CreativeInput = { canvas: string; pixelart: string | File; qrcode: string; 'qrcode-color': string };
const pending: Partial<CreativeInput> = {};

export function sendCreativeInput<K extends keyof CreativeInput>(appId: K, value: CreativeInput[K]) {
  pending[appId] = value;
  window.dispatchEvent(new Event('dex-creative-input-' + appId));
  window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: appId === 'qrcode-color' ? 'qrcode' : appId } }));
}

export function useCreativeInput<K extends keyof CreativeInput>(appId: K, receive: (value: CreativeInput[K]) => void) {
  const handler = useRef(receive);
  handler.current = receive;
  useEffect(() => {
    const event = 'dex-creative-input-' + appId;
    const read = () => {
      const value = pending[appId];
      if (value === undefined) return;
      delete pending[appId];
      handler.current(value);
    };
    read();
    window.addEventListener(event, read);
    return () => window.removeEventListener(event, read);
  }, [appId]);
}
