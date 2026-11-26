// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Single source of truth for the Settings page section list.
//
// Lives in its own icon-free, React-free module so lightweight surfaces (the
// command palette, Spotlight) can offer "jump to a Settings page" results
// WITHOUT importing the multi-thousand-line Settings.tsx bundle. Settings.tsx
// consumes this same list and attaches its own icons, so the sidebar order and
// these deep-link targets can never drift apart.

export interface SettingsSectionMeta {
  /** Stable section id — the contextId delivered via dex-spotlight-navigate. */
  id: string;
  /** Display name (matches the Settings sidebar label). */
  name: string;
  /** Extra synonyms so a search box can match a section by intent. */
  keywords?: string;
}

export interface SettingsCategoryMeta {
  id: string;
  label: string;
  sectionIds: readonly string[];
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { id: 'general', name: 'General' },
  { id: 'appearance', name: 'Appearance', keywords: 'theme dark light wallpaper accent color glass' },
  { id: 'applications', name: 'Applications', keywords: 'app preferences browser notes defaults' },
  { id: 'shell', name: 'Shell & Dock', keywords: 'dock launcher bar taskbar menu' },
  { id: 'sound', name: 'Audio', keywords: 'sound volume output input speaker mixer' },
  { id: 'display', name: 'Display', keywords: 'screen monitor resolution brightness scaling night shift' },
  { id: 'notifications', name: 'Notifications', keywords: 'alerts banners do not disturb dnd focus' },
  { id: 'privacy', name: 'Privacy & Security', keywords: 'security firewall encryption password pin biometric vpn malware lock' },
  { id: 'network', name: 'Network', keywords: 'wifi wi-fi ethernet proxy vpn connection internet' },
  { id: 'performance', name: 'Performance', keywords: 'speed power tier battery throttle gpu cpu' },
  { id: 'systemMonitor', name: 'System Monitor', keywords: 'activity processes memory ram usage stats' },
  { id: 'accessibility', name: 'Accessibility', keywords: 'a11y contrast reduce motion text size voice over' },
  { id: 'window', name: 'Window Management', keywords: 'windows tiling layout arrange' },
  { id: 'snap', name: 'Frame Snapping', keywords: 'snap zones fancyzones tiling magnetism' },
  { id: 'permissions', name: 'Permissions', keywords: 'access camera mic location files grant' },
  { id: 'creator', name: 'Creator Access', keywords: 'developer creator unlock advanced' },
  { id: 'keyboard', name: 'Keyboard Shortcuts', keywords: 'hotkeys shortcuts keybindings keys' },
  { id: 'files', name: 'Files', keywords: 'finder explorer storage default folder' },
  { id: 'storage', name: 'Storage & Data', keywords: 'disk space cache clear data usage' },
  { id: 'browser', name: 'Browser', keywords: 'web search engine homepage bookmarks' },
  { id: 'uki', name: 'UKI & Memory', keywords: 'ai assistant voice memory recall wake word intelligence' },
  { id: 'aiproviders', name: 'AI Providers', keywords: 'ai artificial intelligence model api key openai anthropic claude gpt llm smart router' },
  { id: 'creativeapps', name: 'Creative Suite', keywords: 'prism flux forge axl imosion video editor creative apps' },
  { id: 'plugins', name: 'Plugin Marketplace', keywords: 'plugin extension addon marketplace install developer' },
  { id: 'developer', name: 'Developer', keywords: 'developer api sdk plugin debug diagnostics prompt console advanced build' },
  { id: 'nexus', name: 'Nexus Biometrics', keywords: 'biometric face fingerprint identity nexus' },
  { id: 'updates', name: 'Updates', keywords: 'update upgrade version release channel' },
  { id: 'account', name: 'Account', keywords: 'profile sign in subscription plan billing pro' },
  { id: 'about', name: 'About', keywords: 'version license credits info' },
];

/** Canonical OS-level information architecture used by Settings navigation. */
export const SETTINGS_CATEGORIES: SettingsCategoryMeta[] = [
  { id: 'system', label: 'System', sectionIds: ['general', 'shell', 'sound', 'display', 'window', 'snap'] },
  { id: 'appearance', label: 'Appearance & Personalization', sectionIds: ['appearance'] },
  { id: 'applications', label: 'Applications', sectionIds: ['applications'] },
  { id: 'network-devices', label: 'Network & Devices', sectionIds: ['network', 'permissions'] },
  { id: 'storage', label: 'Storage', sectionIds: ['storage', 'files', 'browser'] },
  { id: 'security-privacy', label: 'Security & Privacy', sectionIds: ['privacy', 'nexus'] },
  { id: 'notifications', label: 'Notifications', sectionIds: ['notifications'] },
  { id: 'performance-power', label: 'Performance & Power', sectionIds: ['performance', 'systemMonitor'] },
  { id: 'updates', label: 'Updates', sectionIds: ['updates'] },
  { id: 'accessibility', label: 'Accessibility', sectionIds: ['accessibility', 'keyboard'] },
  { id: 'uki', label: 'UKI', sectionIds: ['uki', 'aiproviders'] },
  { id: 'developers', label: 'Developers & Labs', sectionIds: ['developer', 'plugins', 'creator', 'creativeapps'] },
  { id: 'account', label: 'Account & Information', sectionIds: ['account', 'about'] },
];
