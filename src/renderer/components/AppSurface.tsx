// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef } from 'react';
import type { WindowBounds } from '../../shared/shell/windowLayout';
import { cancelWindowSnap, playWindowSnap } from '../shell/windowSnapMotion';
import { useAppPreferences } from '../store/appPreferences';
import { AppAppearanceContext, type AppAppearanceAttributes } from '../utils/appAppearanceContext';

export function AppSurface({ appId, bounds, children, ...props }: ComponentPropsWithoutRef<'div'> & {
  appId: string;
  bounds?: WindowBounds;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const theme = useAppPreferences(state => state.apps[appId]?.windowTheme);
  const reduce = useAppPreferences(state => state.apps[appId]?.appMotion === 'reduced');
  const attributes = useMemo<AppAppearanceAttributes>(() => {
    const override = theme === 'light' || theme === 'dark' ? theme : undefined;
    return {
      'data-theme': override,
      'data-app-theme': override,
      'data-app-motion': reduce ? 'reduced' : undefined,
    };
  }, [theme, reduce]);

  useLayoutEffect(() => {
    if (bounds && surface.current) playWindowSnap(surface.current, bounds, reduce);
  }, [bounds, reduce]);
  useLayoutEffect(() => {
    const element = surface.current;
    return () => { if (element) cancelWindowSnap(element); };
  }, []);

  return (
    <AppAppearanceContext.Provider value={attributes}>
      <div {...props} {...attributes} ref={surface}>{children}</div>
    </AppAppearanceContext.Provider>
  );
}
