// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AppIcon — unified app icon resolver.
 *
 * Order of precedence:
 *   1. PNG bundled in /appicons/<id>.png  (high-fidelity art)
 *   2. SVG glyph from DexIcon              (consistent stroke art)
 *   3. SVG fallback resolved through legacy aliases (e.g. transfers -> share)
 *
 * Never falls back to a single letter — that path was the source of the
 * "blank app icon" bug across the dock and launcher.
 *
 * Use everywhere an app id is rendered: dock, launcher, window header,
 * taskbar, recents, search results.
 */
import React from 'react';
import DexIcon from './DexIcon';

// Eagerly bundle every PNG in /appicons/ as a URL string.
// Vite will fingerprint and inline these as static assets.
const PNG_MODULES = import.meta.glob('../../../appicons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// Build a lookup table keyed by lowercase basename (without extension).
const PNG_BY_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [path, url] of Object.entries(PNG_MODULES)) {
    const m = path.match(/\/([^/]+)\.png$/);
    if (m) map[m[1].toLowerCase()] = url;
  }
  return map;
})();

// Map of app ids whose registered name differs from its PNG basename.
const PNG_ALIAS: Record<string, string> = {
  videoeditor: 'vinx',
  vinxapp: 'vinx',
  imosionapp: 'imosion',
  forgeapp: 'forge',
  nexusapp: 'nexus',
};

// Final svg-icon name for each app id (used when there is no PNG).
const SVG_FOR_APP: Record<string, string> = {
  home: 'home',
  settings: 'settings',
  search: 'search',
  files: 'folder',
  notes: 'note',
  tasks: 'check-square',
  browser: 'globe',
  transfers: 'share',
  calendar: 'calendar',
  workflows: 'workflow',
  gallery: 'image',
  audio: 'music',
  video: 'film',
  power: 'powerapp',
  vault: 'vault',
  calculator: 'calculator',
  passwordgenerator: 'lock',
  code: 'code',
  dexcode: 'code',
  terminal: 'terminal',
  videoeditor: 'videoeditor',
  vinx: 'videoeditor',
  imosion: 'imosion',
  prism: 'prism',
  flux: 'flux',
  forge: 'forge',
  axl: 'axl',
  nexus: 'nexus',
  rewind: 'rewind',
  collabhub: 'collabhub',
  weather: 'cloud',
  recyclebin: 'trash',
  kanban: 'columns',
  timer: 'clock',
  canvas: 'canvas',
};

interface AppIconProps {
  appId: string;
  size?: number;
  /** Optional explicit override (e.g. when caller already has a custom svg name). */
  fallbackIcon?: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  rounded?: boolean;
}

const AppIcon: React.FC<AppIconProps> = ({
  appId,
  size = 24,
  fallbackIcon,
  className,
  style,
  title,
  rounded = true,
}) => {
  const id = (appId || '').toLowerCase();
  const pngKey = PNG_ALIAS[id] || id;
  const png = PNG_BY_ID[pngKey];

  if (png) {
    return (
      <img
        src={png}
        alt={title || appId}
        width={size}
        height={size}
        draggable={false}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: rounded ? Math.round(size * 0.22) : 0,
          flexShrink: 0,
          display: 'inline-block',
          verticalAlign: 'middle',
          ...style,
        }}
      />
    );
  }

  const svgName = fallbackIcon || SVG_FOR_APP[id] || id;
  return (
    <DexIcon
      name={svgName}
      size={size}
      className={className}
      style={style}
      title={title}
    />
  );
};

export default AppIcon;
