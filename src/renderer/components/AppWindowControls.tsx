// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import React, { memo } from 'react';
import DexIcon from './DexIcon';
import { IconButton } from '../ui/Button';

export interface AppWindowControlsProps {
  appName: string;
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

/** Canonical controls used by every floating DEX application window. */
export const AppWindowControls = memo<AppWindowControlsProps>(({
  appName,
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
}) => (
  <div className="dex-window-controls" role="group" aria-label={`${appName} window controls`}>
    <IconButton
      size="xs"
      variant="ghost"
      icon={<DexIcon name="minus" size={12} />}
      ariaLabel={`Minimize ${appName}`}
      title="Minimize"
      onClick={onMinimize}
    />
    <IconButton
      size="xs"
      variant="ghost"
      icon={<DexIcon name={maximized ? 'minimize' : 'maximize'} size={12} />}
      ariaLabel={maximized ? `Restore ${appName}` : `Maximize ${appName}`}
      title={maximized ? 'Restore' : 'Maximize'}
      onClick={onToggleMaximize}
    />
    <IconButton
      size="xs"
      variant="ghost"
      className="dex-window-control-close"
      icon={<DexIcon name="close" size={12} />}
      ariaLabel={`Close ${appName}`}
      title={`Close ${appName}`}
      onClick={onClose}
    />
  </div>
));

AppWindowControls.displayName = 'AppWindowControls';

export default AppWindowControls;
