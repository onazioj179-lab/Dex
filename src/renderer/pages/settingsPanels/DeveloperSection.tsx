// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX 5.5 — Developer section (search-first Settings).
//
// This is a lightweight discoverability SHELL. It invents no new settings:
// it surfaces EXISTING controls that developers reach for, and jumps to the
// section that actually owns each one. The brief calls for an AI / Privacy /
// Developer / Plugin grouping; AI/Privacy/Plugin already exist as their own
// sections, so this fills the only gap (a single Developer landing) without
// duplicating or changing any setting's behavior.
//

import React from 'react';

interface DeveloperSectionProps {
  /** Jump to another settings section (host-provided setActiveSection). */
  onNavigate: (sectionId: string) => void;
  /** Shared style map from Settings.tsx so visuals stay identical. */
  styles: Record<string, React.CSSProperties>;
}

interface DevLink {
  section: string;
  title: string;
  desc: string;
}

const DEV_LINKS: DevLink[] = [
  { section: 'aiproviders', title: 'AI Providers', desc: 'Models, API keys, and the smart router used by DEX intelligence.' },
  { section: 'plugins', title: 'Plugin Marketplace', desc: 'Browse, install, and manage plugins and extensions.' },
  { section: 'uki', title: 'UKI & Memory', desc: 'Assistant behavior, recall mode, and the local memory archive.' },
  { section: 'keyboard', title: 'Keyboard Shortcuts', desc: 'Global shortcuts and the command-palette bindings.' },
  { section: 'performance', title: 'Performance', desc: 'Hardware tier, GPU rendering, cache, and resource reservation.' },
  { section: 'systemMonitor', title: 'System Monitor', desc: 'Live processes, CPU and memory usage, and diagnostics.' },
];

const DeveloperSection: React.FC<DeveloperSectionProps> = ({ onNavigate, styles }) => {
  const linkRow = (link: DevLink) => (
    <button
      key={link.section}
      type="button"
      onClick={() => onNavigate(link.section)}
      aria-label={`Open ${link.title} settings`}
      style={{
        ...styles.settingRow,
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--color-border-subtle)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={styles.settingInfo}>
        <span style={styles.settingLabel}>{link.title}</span>
        <span style={styles.settingDesc}>{link.desc}</span>
      </span>
      <span aria-hidden style={{ color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </button>
  );

  return (
    <div style={styles.settingsContent}>
      <h3 style={styles.sectionTitleFirst}>Developer</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
        Everything for building on DEX in one place. These open the existing
        sections that own each capability.
      </p>

      <h3 style={styles.sectionTitle}>Build & Extend</h3>
      {DEV_LINKS.slice(0, 3).map(linkRow)}

      <h3 style={styles.sectionTitle}>Tools & Diagnostics</h3>
      {DEV_LINKS.slice(3).map(linkRow)}

      <h3 style={styles.sectionTitle}>Telemetry</h3>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
        Diagnostics and usage reporting are controlled by{' '}
        <button
          type="button"
          onClick={() => onNavigate('general')}
          style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >
          Send Analytics
        </button>{' '}
        (General) and{' '}
        <button
          type="button"
          onClick={() => onNavigate('privacy')}
          style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >
          Crash Reports
        </button>{' '}
        (Privacy &amp; Security). No new toggles are introduced here.
      </p>
    </div>
  );
};

DeveloperSection.displayName = 'DeveloperSection';
export default DeveloperSection;
