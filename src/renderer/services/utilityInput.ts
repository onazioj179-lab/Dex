// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useEffect, useRef } from 'react';

export type UtilityTarget = 'calculator' | 'unitconverter' | 'qrcode';
const pending = new Map<UtilityTarget, string>();

export function isUtilityTarget(value: string): value is UtilityTarget {
  return value === 'calculator' || value === 'unitconverter' || value === 'qrcode';
}

export function queueUtilityInput(target: UtilityTarget, value: string) {
  pending.set(target, value);
  window.dispatchEvent(new Event('dex-utility-input-' + target));
}

export function openUtilityInput(target: UtilityTarget, value: string) {
  queueUtilityInput(target, value);
  window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId: target } }));
}

export function useUtilityInput(target: UtilityTarget, receive: (value: string) => void, enabled = true) {
  const handler = useRef(receive);
  handler.current = receive;
  useEffect(() => {
    if (!enabled) return;
    const event = 'dex-utility-input-' + target;
    const read = () => {
      const value = pending.get(target);
      if (value === undefined) return;
      pending.delete(target);
      handler.current(value);
    };
    read();
    window.addEventListener(event, read);
    return () => window.removeEventListener(event, read);
  }, [target, enabled]);
}
