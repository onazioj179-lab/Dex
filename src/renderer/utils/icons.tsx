// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX SVG Icon Library
 * Inline SVG icons replacing all emoji usage across the application.
 * Each icon accepts optional size/color/className props.
 */
import React, { memo } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

const defaultSize = 16;
const defaultColor = 'currentColor';

// --- Helper ---------------------------------------------------------------
const icon = (name: string, path: React.ReactNode) =>
  memo(({ size = defaultSize, color = defaultColor, className, style }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {path}
    </svg>
  ));

// --- Media Controls -------------------------------------------------------
export const PlayIcon = icon('PlayIcon',
  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
);
PlayIcon.displayName = 'PlayIcon';

export const PauseIcon = icon('PauseIcon',
  <><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" /></>
);
PauseIcon.displayName = 'PauseIcon';

export const SkipForwardIcon = icon('SkipForwardIcon',
  <><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" /></>
);
SkipForwardIcon.displayName = 'SkipForwardIcon';

export const SkipBackIcon = icon('SkipBackIcon',
  <><polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" /></>
);
SkipBackIcon.displayName = 'SkipBackIcon';

export const StopIcon = icon('StopIcon',
  <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none" />
);
StopIcon.displayName = 'StopIcon';

// --- System / Power ------------------------------------------------------
export const BatteryIcon = icon('BatteryIcon',
  <><rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" /></>
);
BatteryIcon.displayName = 'BatteryIcon';

export const BoltIcon = icon('BoltIcon',
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none" />
);
BoltIcon.displayName = 'BoltIcon';

export const CpuIcon = icon('CpuIcon',
  <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></>
);
CpuIcon.displayName = 'CpuIcon';

export const ThermometerIcon = icon('ThermometerIcon',
  <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
);
ThermometerIcon.displayName = 'ThermometerIcon';

export const HardDriveIcon = icon('HardDriveIcon',
  <><line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" y1="16" x2="6.01" y2="16" /><line x1="10" y1="16" x2="10.01" y2="16" /></>
);
HardDriveIcon.displayName = 'HardDriveIcon';

export const MemoryIcon = icon('MemoryIcon',
  <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01" /><path d="M6 2v4M10 2v4M14 2v4M18 2v4" /></>
);
MemoryIcon.displayName = 'MemoryIcon';

export const GaugeIcon = icon('GaugeIcon',
  <><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 12 19.1 4.9" /><circle cx="12" cy="12" r="2" /></>
);
GaugeIcon.displayName = 'GaugeIcon';

export const RocketIcon = icon('RocketIcon',
  <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>
);
RocketIcon.displayName = 'RocketIcon';

export const SlidersIcon = icon('SlidersIcon',
  <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>
);
SlidersIcon.displayName = 'SlidersIcon';

export const BalanceIcon = icon('BalanceIcon',
  <><path d="M12 3v18" /><path d="M5 8h14" /><path d="M2 14l3-6 3 6" /><path d="M16 14l3-6 3 6" /><circle cx="12" cy="3" r="1" /></>
);
BalanceIcon.displayName = 'BalanceIcon';

export const MuteIcon = icon('MuteIcon',
  <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
);
MuteIcon.displayName = 'MuteIcon';

// --- UI / Navigation ----------------------------------------------------
export const BarChartIcon = icon('BarChartIcon',
  <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>
);
BarChartIcon.displayName = 'BarChartIcon';

export const SettingsIcon = icon('SettingsIcon',
  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>
);
SettingsIcon.displayName = 'SettingsIcon';

export const WarningIcon = icon('WarningIcon',
  <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>
);
WarningIcon.displayName = 'WarningIcon';

export const InfoIcon = icon('InfoIcon',
  <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>
);
InfoIcon.displayName = 'InfoIcon';

export const CheckCircleIcon = icon('CheckCircleIcon',
  <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>
);
CheckCircleIcon.displayName = 'CheckCircleIcon';

export const TrashIcon = icon('TrashIcon',
  <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>
);
TrashIcon.displayName = 'TrashIcon';

export const CleanupIcon = icon('CleanupIcon',
  <><path d="M3 6h18" /><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v2" /><path d="m19 6-.7 11.8a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8L5 6" /><path d="m14 11-4 4" /><path d="m10 11 4 4" /></>
);
CleanupIcon.displayName = 'CleanupIcon';

// --- Actions / Quick Actions ---------------------------------------------
export const PenIcon = icon('PenIcon',
  <><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>
);
PenIcon.displayName = 'PenIcon';

export const CameraIcon = icon('CameraIcon',
  <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>
);
CameraIcon.displayName = 'CameraIcon';

export const TimerIcon = icon('TimerIcon',
  <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M5 3 2 6" /><path d="m22 6-3-3" /><line x1="12" y1="1" x2="12" y2="3" /></>
);
TimerIcon.displayName = 'TimerIcon';

export const LockIcon = icon('LockIcon',
  <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>
);
LockIcon.displayName = 'LockIcon';

export const FolderIcon = icon('FolderIcon',
  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
);
FolderIcon.displayName = 'FolderIcon';

export const FileIcon = icon('FileIcon',
  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>
);
FileIcon.displayName = 'FileIcon';

export const FileTextIcon = icon('FileTextIcon',
  <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>
);
FileTextIcon.displayName = 'FileTextIcon';

export const PackageIcon = icon('PackageIcon',
  <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>
);
PackageIcon.displayName = 'PackageIcon';

export const ImageIcon = icon('ImageIcon',
  <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>
);
ImageIcon.displayName = 'ImageIcon';

export const MusicIcon = icon('MusicIcon',
  <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>
);
MusicIcon.displayName = 'MusicIcon';

export const VideoIcon = icon('VideoIcon',
  <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" /></>
);
VideoIcon.displayName = 'VideoIcon';

export const SpreadsheetIcon = icon('SpreadsheetIcon',
  <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></>
);
SpreadsheetIcon.displayName = 'SpreadsheetIcon';

export const CodeIcon = icon('CodeIcon',
  <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>
);
CodeIcon.displayName = 'CodeIcon';

// --- Games --------------------------------------------------------------
export const TrophyIcon = icon('TrophyIcon',
  <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>
);
TrophyIcon.displayName = 'TrophyIcon';

export const PartyIcon = icon('PartyIcon',
  <><path d="M5.8 11.3 2 22l10.7-3.79" /><path d="M4 3h.01" /><path d="M22 8h.01" /><path d="M15 2h.01" /><path d="M22 20h.01" /><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" /><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17" /><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7" /><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" /></>
);
PartyIcon.displayName = 'PartyIcon';

export const GamepadIcon = icon('GamepadIcon',
  <><line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" /><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" /></>
);
GamepadIcon.displayName = 'GamepadIcon';

export const TargetIcon = icon('TargetIcon',
  <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>
);
TargetIcon.displayName = 'TargetIcon';

export const BombIcon = icon('BombIcon',
  <><circle cx="11" cy="13" r="9" /><path d="M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95" /><path d="M22 2 18 6" /></>
);
BombIcon.displayName = 'BombIcon';

export const LightbulbIcon = icon('LightbulbIcon',
  <><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>
);
LightbulbIcon.displayName = 'LightbulbIcon';

export const FlagIcon = icon('FlagIcon',
  <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>
);
FlagIcon.displayName = 'FlagIcon';

export const CircleIcon = icon('CircleIcon',
  <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
);
CircleIcon.displayName = 'CircleIcon';

// --- Undo/Redo ----------------------------------------------------------
export const UndoIcon = icon('UndoIcon',
  <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>
);
UndoIcon.displayName = 'UndoIcon';

export const RedoIcon = icon('RedoIcon',
  <><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>
);
RedoIcon.displayName = 'RedoIcon';

// --- Weather ------------------------------------------------------------
export const CloudSunIcon = icon('CloudSunIcon',
  <><path d="M12 2v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="M20 12h2" /><path d="m19.07 4.93-1.41 1.41" /><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" /><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" /></>
);
CloudSunIcon.displayName = 'CloudSunIcon';

// --- Tags --------------------------------------------------------------
export const StarIcon = icon('StarIcon',
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
);
StarIcon.displayName = 'StarIcon';

export const BriefcaseIcon = icon('BriefcaseIcon',
  <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>
);
BriefcaseIcon.displayName = 'BriefcaseIcon';

export const HomeIcon = icon('HomeIcon',
  <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>
);
HomeIcon.displayName = 'HomeIcon';

export const ArchiveIcon = icon('ArchiveIcon',
  <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>
);
ArchiveIcon.displayName = 'ArchiveIcon';

export const EyeIcon = icon('EyeIcon',
  <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
);
EyeIcon.displayName = 'EyeIcon';

// --- Chevrons / Arrows --------------------------------------------------
export const ChevronRightIcon = icon('ChevronRightIcon',
  <polyline points="9 18 15 12 9 6" />
);
ChevronRightIcon.displayName = 'ChevronRightIcon';

export const ChevronLeftIcon = icon('ChevronLeftIcon',
  <polyline points="15 18 9 12 15 6" />
);
ChevronLeftIcon.displayName = 'ChevronLeftIcon';

export const ChevronDownIcon = icon('ChevronDownIcon',
  <polyline points="6 9 12 15 18 9" />
);
ChevronDownIcon.displayName = 'ChevronDownIcon';

export const ChevronUpIcon = icon('ChevronUpIcon',
  <polyline points="18 15 12 9 6 15" />
);
ChevronUpIcon.displayName = 'ChevronUpIcon';

// --- YouTube / Link -----------------------------------------------------
export const YoutubeIcon = icon('YoutubeIcon',
  <><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" /></>
);
YoutubeIcon.displayName = 'YoutubeIcon';

// --- Rewind -------------------------------------------------------------
export const RewindIcon = icon('RewindIcon',
  <><polygon points="11 19 2 12 11 5 11 19" /><polygon points="22 19 13 12 22 5 22 19" /></>
);
RewindIcon.displayName = 'RewindIcon';

// --- Sad / Error --------------------------------------------------------
export const FrownIcon = icon('FrownIcon',
  <><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></>
);
FrownIcon.displayName = 'FrownIcon';
