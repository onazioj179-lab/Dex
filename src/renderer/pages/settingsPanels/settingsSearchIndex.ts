// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX 5.5 — Search-first Settings index.
//
// A flat catalog of every individual setting in Settings.tsx so the search box
// can find any control in seconds. Each entry maps a user-visible control to
// the section it lives in, plus extra keywords/synonyms for fuzzy matching.
//
// This file is DATA ONLY. It changes nothing about what any setting does — it
// only powers discoverability. Labels/descriptions mirror the strings already
// rendered in Settings.tsx; the `label` is used as the scroll-target lookup
// (matched against the `data-setting-search` attribute on rendered rows).
//

export interface SettingIndexEntry {
  /** The exact control label as rendered in Settings.tsx (used for scroll-to). */
  label: string;
  /** The id of the section this control lives in (matches SECTIONS ids). */
  section: string;
  /** Short description, mirrors the rendered helper text where available. */
  desc?: string;
  /** Extra search terms / synonyms not present in the label or description. */
  keywords?: string;
}

// Order roughly follows the sidebar so grouped results read naturally.
export const SETTINGS_INDEX: SettingIndexEntry[] = [
  // ---------------- General ----------------
  { label: 'Launch at Login', section: 'general', desc: 'Automatically start DEX when you log in', keywords: 'startup boot autostart' },
  { label: 'Check for Updates', section: 'general', desc: 'Automatically check for app updates', keywords: 'upgrade version' },
  { label: 'Restore Last Session', section: 'general', desc: 'Reopen apps from your last session', keywords: 'reopen resume' },
  { label: 'Auto-Save', section: 'general', desc: 'Automatically save your work periodically', keywords: 'autosave persist' },
  { label: 'Send Analytics', section: 'general', desc: 'Help improve DEX by sending anonymous usage data', keywords: 'telemetry usage privacy data' },
  { label: 'Reset All Settings to Defaults', section: 'general', desc: 'Restore every setting to its default value', keywords: 'reset factory defaults clear' },

  // ---------------- Appearance ----------------
  { label: 'Appearance', section: 'appearance', desc: 'Switch between dark and light mode', keywords: 'theme dark light auto mode color scheme' },
  { label: 'Accent Color', section: 'appearance', desc: 'Pick the highlight color used across DEX', keywords: 'theme tint highlight color' },
  { label: 'Hero Themes', section: 'appearance', desc: 'One-tap accent presets: Dark Knight, Omnitrix, Nanite', keywords: 'theme preset batman ben 10 generator rex yellow green orange accent hero' },
  { label: 'Font Scale', section: 'appearance', desc: 'Adjust text size across the app', keywords: 'text size zoom larger smaller font' },
  { label: 'Reduce Motion', section: 'appearance', desc: 'Minimize animated effects', keywords: 'animation accessibility' },
  { label: 'Glass', section: 'appearance', desc: 'Off, Reduced, Normal, or Liquid translucency', keywords: 'transparency blur liquid material glassmorphism' },
  { label: 'Reduce Transparency', section: 'appearance', desc: 'Force solid surfaces over translucency', keywords: 'opacity solid accessibility' },
  { label: 'Background Tint', section: 'appearance', desc: 'Allow wallpaper color to show through windows', keywords: 'wallpaper material frosted solid glass tint' },
  { label: 'Blur Intensity', section: 'appearance', desc: 'Blur amount behind glass surfaces', keywords: 'glass background blur' },
  { label: 'Glass Opacity', section: 'appearance', desc: 'Transparency of glass surfaces', keywords: 'transparency alpha' },
  { label: 'Window Button Style', section: 'appearance', desc: 'System (Windows) or traffic light (macOS) buttons', keywords: 'controls traffic lights close minimize maximize titlebar' },
  { label: 'Stage Manager', section: 'appearance', desc: 'Show running apps as thumbnails for quick switching', keywords: 'multitasking windows switcher' },

  // ---------------- Shell & Dock ----------------
  { label: 'Edge', section: 'shell', desc: 'Pin the dock to any side of the display', keywords: 'dock position bottom left right top taskbar' },
  { label: 'Preset', section: 'shell', desc: 'Dock size: compact, regular, large, or floating', keywords: 'dock size compact floating taskbar' },
  { label: 'Mode', section: 'shell', desc: 'How transparent shell windows and overlays are', keywords: 'liquid glass transparency dock' },

  // ---------------- Sound ----------------
  { label: 'Master Volume', section: 'sound', desc: 'System-wide volume level', keywords: 'audio loudness' },
  { label: 'Alert Volume', section: 'sound', desc: 'Volume for system alerts and notifications', keywords: 'audio notification' },
  { label: 'Balance', section: 'sound', desc: 'Left/Right audio balance', keywords: 'audio stereo pan' },
  { label: 'Output Device', section: 'sound', desc: 'Sound output device', keywords: 'speakers headphones bluetooth audio' },
  { label: 'Input Device', section: 'sound', desc: 'Sound input device', keywords: 'microphone mic audio' },
  { label: 'Spatial Audio', section: 'sound', desc: 'Enable immersive 3D audio experience', keywords: '3d surround dolby' },
  { label: 'Profile', section: 'sound', desc: 'Spatial audio tracking mode', keywords: 'head tracking spatial audio' },
  { label: 'Enhanced Dialogue', section: 'sound', desc: 'Boost voice clarity in media', keywords: 'voice speech clarity' },
  { label: 'Bypass Audio Effects', section: 'sound', desc: 'Creative apps get raw unprocessed audio', keywords: 'axl vinx imosion flux raw' },
  { label: 'Auto-Play Media', section: 'sound', desc: 'Automatically play media in apps', keywords: 'autoplay video' },

  // ---------------- Display ----------------
  { label: 'Resolution', section: 'display', desc: 'Display resolution', keywords: 'screen 4k qhd hd pixels' },
  { label: 'UI Scaling', section: 'display', desc: 'Scale interface elements', keywords: 'dpi zoom scale display' },
  { label: 'Blur Intensity', section: 'display', desc: 'Background blur strength for glass effects', keywords: 'glass material' },
  { label: 'Glass Opacity', section: 'display', desc: 'Transparency level of glass surfaces', keywords: 'transparency material' },
  { label: 'Adaptive Brightness', section: 'display', desc: 'Adjust brightness based on ambient light', keywords: 'auto brightness ambient' },
  { label: 'True Tone', section: 'display', desc: 'Adjust display warmth to ambient lighting', keywords: 'truetone color temperature' },
  { label: 'Night Shift', section: 'display', desc: 'Reduce blue light in the evening', keywords: 'blue light warmth sleep night mode' },
  { label: 'Warmth', section: 'display', desc: 'Color temperature for Night Shift', keywords: 'night shift temperature' },
  { label: 'Refresh Rate', section: 'display', desc: 'Display update frequency', keywords: 'hz promotion adaptive 120 60' },
  { label: 'HDR Content', section: 'display', desc: 'Enable High Dynamic Range when available', keywords: 'high dynamic range' },

  // ---------------- Notifications ----------------
  { label: 'Allow Notifications', section: 'notifications', desc: 'Show notifications from DEX', keywords: 'alerts banners' },
  { label: 'Sound', section: 'notifications', desc: 'Play sound for notifications', keywords: 'audio chime' },
  { label: 'Badge App Icon', section: 'notifications', desc: 'Show notification count on dock icon', keywords: 'badge count dock' },
  { label: 'Do Not Disturb', section: 'notifications', desc: 'Silence all notifications', keywords: 'dnd focus quiet mute' },

  // ---------------- Privacy & Security ----------------
  { label: 'Fingerprint / Windows Hello', section: 'privacy', desc: 'Use fingerprint or face to unlock DEX', keywords: 'biometric face unlock authentication hello' },
  { label: 'PIN Code', section: 'privacy', desc: 'Use a 4-8 digit PIN to unlock', keywords: 'passcode lock authentication' },
  { label: 'Password', section: 'privacy', desc: 'Use a password to unlock', keywords: 'authentication lock credential' },
  { label: 'Auto-Lock Timer', section: 'privacy', desc: 'Lock DEX after inactivity', keywords: 'idle lock timeout security' },
  { label: 'Recovery Codes', section: 'privacy', desc: 'Backup codes if you forget PIN or password', keywords: 'backup recovery codes' },
  { label: 'Location Services', section: 'privacy', desc: 'Allow DEX to access your location', keywords: 'gps location privacy' },
  { label: 'How DEX protects you', section: 'privacy', desc: 'Lock screen, vault encryption and Windows Security', keywords: 'security firewall antivirus malware defender protection vault encryption' },
  { label: 'Crash reports', section: 'privacy', desc: 'Kept on this device; nothing is sent', keywords: 'crash telemetry analytics diagnostics data' },
  { label: 'Storage used by DEX', section: 'storage', desc: 'Measured disk usage by category', keywords: 'disk space usage size data storage' },
  { label: 'Clear caches', section: 'storage', desc: 'Free web engine cache and logs; your data is kept', keywords: 'cache clear cleanup free space storage' },
  { label: 'Clear All Data', section: 'privacy', desc: 'Delete all your data', keywords: 'wipe erase reset danger' },

  // ---------------- Network ----------------
  { label: 'Network Mode', section: 'network', desc: 'Full, local-only, or disabled networking', keywords: 'offline local online connectivity' },
  { label: 'Wi-Fi', section: 'network', desc: 'Connect to wireless networks', keywords: 'wifi wireless network' },
  { label: 'Preferred Network', section: 'network', desc: 'Default network to connect to', keywords: 'wifi ssid' },
  { label: 'Frequency Band', section: 'network', desc: 'Preferred Wi-Fi frequency', keywords: 'wifi 2.4ghz 5ghz 6ghz band' },
  { label: 'Bluetooth', section: 'network', desc: 'Enable Bluetooth connectivity', keywords: 'bluetooth wireless pairing' },
  { label: 'Bluetooth Mode', section: 'network', desc: 'Bluetooth power/range mode', keywords: 'ble classic bluetooth' },
  { label: 'Discoverable', section: 'network', desc: 'Allow other devices to find this computer', keywords: 'bluetooth visibility' },
  { label: 'Network Access', section: 'network', desc: 'Allow DEX to access the internet', keywords: 'internet online connectivity' },
  { label: 'IPv6', section: 'network', desc: 'Enable IPv6 networking', keywords: 'ip address protocol' },
  { label: 'Network Monitor', section: 'network', desc: 'Track real-time network activity', keywords: 'bandwidth traffic monitor' },
  { label: 'DNS over HTTPS', section: 'network', desc: 'Encrypt DNS queries for privacy', keywords: 'doh dns privacy security' },
  { label: 'Bandwidth Optimization', section: 'network', desc: 'Optimize network usage for better performance', keywords: 'data saver bandwidth' },
  { label: 'Allow WebGL', section: 'network', desc: 'Enable GPU-accelerated graphics in web content', keywords: 'webgl gpu graphics web' },
  { label: 'Allow JavaScript', section: 'network', desc: 'Enable JavaScript execution in web content', keywords: 'javascript js web scripting' },

  // ---------------- Performance ----------------
  { label: 'Daily Auto-Optimize', section: 'performance', desc: 'Re-detect hardware and optimize each day', keywords: 'tier hardware optimize performance' },
  { label: 'Hardware Acceleration', section: 'performance', desc: 'Use GPU for rendering and compositing', keywords: 'gpu acceleration graphics' },
  { label: 'GPU Rendering', section: 'performance', desc: 'Offload UI rendering to the graphics card', keywords: 'gpu graphics performance' },
  { label: 'Performance Mode', section: 'performance', desc: 'System-wide performance tier', keywords: 'power balanced battery performance' },
  { label: 'Low Power Mode', section: 'performance', desc: 'Reduce animations and background activity to save battery', keywords: 'battery power saver' },
  { label: 'CPU Priority', section: 'performance', desc: 'Process priority for DEX', keywords: 'cpu priority performance' },
  { label: 'Memory Optimization', section: 'performance', desc: 'Automatically free unused memory', keywords: 'ram memory cleanup' },
  { label: 'RAM Limit', section: 'performance', desc: 'Maximum RAM usage', keywords: 'memory ram limit' },
  { label: 'Preload Apps', section: 'performance', desc: 'Pre-load frequently used apps for faster launch', keywords: 'startup preload speed' },
  { label: 'Background Boost', section: 'performance', desc: 'Allow background apps extra resources when idle', keywords: 'background performance' },
  { label: 'Predictive Pre-warm', section: 'performance', desc: 'Pre-warm the next likely app while idle', keywords: 'prewarm predictive performance' },

  // ---------------- System Monitor ----------------
  { label: 'System Monitor', section: 'systemMonitor', desc: 'View live processes, CPU and memory usage', keywords: 'task manager processes cpu memory activity monitor' },

  // ---------------- Accessibility ----------------
  { label: 'Increase Contrast', section: 'accessibility', desc: 'Enhance visual distinction between UI elements', keywords: 'high contrast vision accessibility' },
  { label: 'Larger Text', section: 'accessibility', desc: 'Use larger text size throughout the interface', keywords: 'text size vision accessibility' },
  { label: 'Reduce Transparency', section: 'accessibility', desc: 'Use solid backgrounds instead of translucent surfaces', keywords: 'opacity accessibility' },
  { label: 'Letter Spacing', section: 'accessibility', desc: 'Space between characters (WCAG 1.4.12)', keywords: 'tracking text spacing wcag' },
  { label: 'Line Height', section: 'accessibility', desc: 'Spacing between lines of text (WCAG 1.4.12)', keywords: 'leading text spacing wcag' },
  { label: 'Word Spacing', section: 'accessibility', desc: 'Space between words (WCAG 1.4.12)', keywords: 'text spacing wcag' },
  { label: 'Screen Reader', section: 'accessibility', desc: 'Enable screen reader support and ARIA announcements', keywords: 'aria voiceover narrator accessibility' },
  { label: 'Reduce Motion', section: 'accessibility', desc: 'Minimize animations and motion effects', keywords: 'animation accessibility' },

  // ---------------- Window Management ----------------
  { label: 'Snap Windows', section: 'window', desc: 'Snap windows to screen edges and zones when dragging', keywords: 'snapping tiling layout window' },
  { label: 'Animate Resizing', section: 'window', desc: 'Smooth animation when resizing or snapping windows', keywords: 'animation window' },
  { label: 'Remember Positions', section: 'window', desc: 'Restore window positions when reopening apps', keywords: 'restore window position' },
  { label: 'Window Shadows', section: 'window', desc: 'Show drop shadows behind floating windows', keywords: 'shadow window' },
  { label: 'App Tab Bar', section: 'window', desc: 'Show running app tabs above the content area', keywords: 'tabs window' },
  { label: 'Double-Click Title Bar', section: 'window', desc: 'Action when double-clicking a window title bar', keywords: 'titlebar maximize minimize window' },
  { label: 'Window Button Style', section: 'window', desc: 'Choose the style of window control buttons', keywords: 'controls traffic lights window' },
  { label: 'Max Floating Windows', section: 'window', desc: 'Maximum number of floating windows at once', keywords: 'limit window floating' },

  // ---------------- Frame Snapping ----------------
  { label: 'Frame Snapping', section: 'snap', desc: 'Drag-snap toggle, gutter, and layout zones', keywords: 'snap layout tiling zones gutter window' },

  // ---------------- Permissions ----------------
  { label: 'Permissions', section: 'permissions', desc: 'Per-grant app permissions, revoke and auto-disable', keywords: 'permission grant revoke privacy access camera microphone' },
  { label: 'UKI Assistant Access', section: 'permissions', desc: 'See and control exactly what the UKI assistant may access', keywords: 'ai assistant uki capability screen read file write shell clipboard network grant revoke permission allow' },

  // ---------------- Creator Access ----------------
  { label: 'Creator Access', section: 'creator', desc: 'Owner-only Creative Full Access unlock', keywords: 'owner creator unlock signature' },

  // ---------------- Keyboard Shortcuts ----------------
  { label: 'Enable Global Shortcuts', section: 'keyboard', desc: 'Allow keyboard shortcuts throughout the app', keywords: 'hotkeys keybindings shortcuts' },
  { label: 'Command Palette', section: 'keyboard', desc: 'Open the command palette', keywords: 'shortcut hotkey palette' },
  { label: 'Quick Search', section: 'keyboard', desc: 'Focus the search bar', keywords: 'shortcut hotkey search' },
  { label: 'Screenshot', section: 'keyboard', desc: 'Capture a screenshot', keywords: 'shortcut hotkey capture' },

  // ---------------- Files ----------------
  { label: 'Show Hidden Files', section: 'files', desc: 'Display hidden files and folders', keywords: 'dotfiles hidden files' },
  { label: 'Confirm Delete', section: 'files', desc: 'Ask for confirmation before deleting files', keywords: 'trash delete files' },
  { label: 'Default View', section: 'files', desc: 'Default file view mode', keywords: 'list grid column files' },
  { label: 'Sort By', section: 'files', desc: 'Default file sort order', keywords: 'sort name date size type files' },
  { label: 'Thumbnail Size', section: 'files', desc: 'Size of file thumbnails in grid view', keywords: 'thumbnail preview files' },
  { label: 'Index Folders', section: 'files', desc: 'Index folder contents for faster search', keywords: 'index search files' },
  { label: 'Watch for Changes', section: 'files', desc: 'Automatically detect file changes on disk', keywords: 'watch monitor files' },
  { label: 'Max Storage', section: 'files', desc: 'Maximum storage DEX can use for cache and data', keywords: 'storage limit disk files' },

  // ---------------- Storage & Data ----------------

  // ---------------- Browser ----------------
  { label: 'Block Trackers', section: 'browser', desc: 'Block cross-site trackers and fingerprinting', keywords: 'privacy trackers browser' },
  { label: 'Block Ads', section: 'browser', desc: 'Block advertisements and popups', keywords: 'adblock ads browser' },
  { label: 'Fingerprint Protection', section: 'browser', desc: 'Prevent browser fingerprint tracking', keywords: 'privacy fingerprint browser' },
  { label: 'Do Not Track', section: 'browser', desc: 'Send Do Not Track header with requests', keywords: 'privacy dnt browser' },
  { label: 'Block Third-Party Cookies', section: 'browser', desc: 'Prevent cross-site cookie tracking', keywords: 'cookies privacy browser' },
  { label: 'Force HTTPS', section: 'browser', desc: 'Automatically upgrade connections to HTTPS', keywords: 'https security browser' },
  { label: 'Clear on Exit', section: 'browser', desc: 'Clear browsing data when DEX closes', keywords: 'history privacy browser' },
  { label: 'Tor Mode', section: 'browser', desc: 'Route traffic through the Tor network for privacy', keywords: 'tor anonymity privacy browser' },
  { label: 'Search Engine', section: 'browser', desc: 'Default search engine for the browser', keywords: 'duckduckgo google bing brave search browser' },
  { label: 'Download Speed Limit', section: 'browser', desc: 'Maximum download speed', keywords: 'download bandwidth browser' },
  { label: 'Parallel Downloads', section: 'browser', desc: 'Maximum simultaneous download connections', keywords: 'download connections browser' },

  // ---------------- UKI & Memory ----------------
  { label: 'Enable UKI', section: 'uki', desc: 'Activate the UKI voice assistant', keywords: 'assistant ai voice uki' },
  { label: 'Show Transcript', section: 'uki', desc: 'Display speech transcription during conversations', keywords: 'transcript uki voice' },
  { label: 'Personality', section: 'uki', desc: "UKI's conversational style", keywords: 'tone casual formal uki ai' },
  { label: 'Wake Word Detection', section: 'uki', desc: 'Activate UKI by saying the wake phrase', keywords: 'wake word hands-free uki voice' },
  { label: 'Wake Phrase', section: 'uki', desc: 'The phrase to activate UKI hands-free', keywords: 'wake word uki voice' },
  { label: 'Memory Recording', section: 'uki', desc: 'Allow UKI to remember conversations and learn', keywords: 'memory ai uki recall privacy' },
  { label: 'Recall Mode', section: 'uki', desc: 'How UKI uses stored memories', keywords: 'memory recall uki ai' },
  { label: 'Retention Period', section: 'uki', desc: 'How long to keep memory records', keywords: 'memory retention uki' },
  { label: 'Archive Size Limit', section: 'uki', desc: 'Maximum disk space for the memory archive', keywords: 'memory storage uki' },
  { label: 'Auto Cleanup', section: 'uki', desc: 'Automatically remove expired memory records', keywords: 'memory cleanup uki' },

  // ---------------- AI Providers ----------------
  { label: 'AI Providers', section: 'aiproviders', desc: 'Configure AI models, API keys, and routing', keywords: 'ai artificial intelligence openai anthropic claude gpt model api key llm provider smart router' },

  // ---------------- Creative Suite ----------------
  { label: 'Creative Suite', section: 'creativeapps', desc: 'Per-app profiles for the DEX creative apps', keywords: 'prism flux forge axl imosion video editor creative' },

  // ---------------- Plugin Marketplace ----------------
  { label: 'Plugin Marketplace', section: 'plugins', desc: 'Browse, install, and manage plugins and extensions', keywords: 'plugin extension addon marketplace install developer' },

  // ---------------- Nexus Biometrics ----------------
  { label: 'Nexus Biometrics', section: 'nexus', desc: 'Biometric enrollment and identity', keywords: 'biometric face fingerprint nexus identity' },

  // ---------------- Developer ----------------
  { label: 'Developer', section: 'developer', desc: 'AI providers, plugins, prompt testing, and diagnostics', keywords: 'developer api plugin sdk debug diagnostics prompt console advanced' },

  // ---------------- Updates ----------------
  { label: 'Updates', section: 'updates', desc: 'Check for and install DEX updates', keywords: 'update upgrade version channel beta' },

  // ---------------- Account ----------------
  { label: 'Account', section: 'account', desc: 'Manage your DEX account and plan', keywords: 'account profile plan subscription billing sign in' },

  // ---------------- About ----------------
  { label: 'About', section: 'about', desc: 'Version, license, and legal information', keywords: 'version license legal credits about' },
];
