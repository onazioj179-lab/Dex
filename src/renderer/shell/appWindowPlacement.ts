// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { cascadeWindow, fitWindowToWorkspace, type WindowBounds } from '../../shared/shell/windowLayout';
import { preferredWindowSize, shouldOpenMaximized } from '../store/appPreferences';

export const DEFAULT_APP_WINDOW_MIN_SIZE = { w: 360, h: 280 };

export function appOpeningBounds(
  appId: string,
  workspace: WindowBounds,
  occupied: Iterable<WindowBounds>,
  defaults?: { w: number; h: number; maximized?: boolean },
  minimum = DEFAULT_APP_WINDOW_MIN_SIZE,
  maximizeByDefault = false,
): WindowBounds {
  const custom = preferredWindowSize(appId);
  if (shouldOpenMaximized(appId) || (!custom && (maximizeByDefault || defaults?.maximized))) return workspace;
  const requested = custom ?? defaults ?? {
    w: Math.min(900, Math.max(480, Math.round(workspace.w * 0.6))),
    h: Math.min(640, Math.max(380, Math.round(workspace.h * 0.7))),
  };
  const fitted = fitWindowToWorkspace({
    w: Math.max(requested.w, minimum.w),
    h: Math.max(requested.h, minimum.h),
  }, workspace);
  return cascadeWindow({ ...fitted, y: workspace.y + 8 }, occupied, workspace);
}
