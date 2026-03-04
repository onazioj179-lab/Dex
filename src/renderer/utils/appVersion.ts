const FALLBACK_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';

export const getBundledAppVersion = (): string => FALLBACK_VERSION;

export const getRuntimeAppVersion = async (): Promise<string> => {
  try {
    const runtime = await (window as any)?.dex?.rewind?.getAppVersion?.();
    if (typeof runtime === 'string' && runtime.trim()) return runtime;
  } catch {
    // noop
  }
  return FALLBACK_VERSION;
};
