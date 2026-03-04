/**
 * DEX Settings Panel
 * Comprehensive settings UI with categories and preferences
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

type SettingType = 'toggle' | 'select' | 'slider' | 'input' | 'color' | 'keybind' | 'custom';

interface BaseSetting {
  id: string;
  label: string;
  description?: string;
  type: SettingType;
  category: string;
  disabled?: boolean;
  hidden?: boolean;
}

interface ToggleSetting extends BaseSetting {
  type: 'toggle';
  value: boolean;
  onChange: (value: boolean) => void;
}

interface SelectSetting extends BaseSetting {
  type: 'select';
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface SliderSetting extends BaseSetting {
  type: 'slider';
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

interface InputSetting extends BaseSetting {
  type: 'input';
  value: string;
  placeholder?: string;
  inputType?: 'text' | 'number' | 'password' | 'email';
  onChange: (value: string) => void;
}

interface ColorSetting extends BaseSetting {
  type: 'color';
  value: string;
  presets?: string[];
  onChange: (value: string) => void;
}

interface KeybindSetting extends BaseSetting {
  type: 'keybind';
  value: string;
  onChange: (value: string) => void;
}

interface CustomSetting extends BaseSetting {
  type: 'custom';
  render: () => React.ReactNode;
}

type Setting = ToggleSetting | SelectSetting | SliderSetting | InputSetting | ColorSetting | KeybindSetting | CustomSetting;

interface SettingsCategory {
  id: string;
  label: string;
  icon?: React.ReactNode;
  settings: Setting[];
}

interface SettingsPanelProps {
  categories: SettingsCategory[];
  onClose?: () => void;
  title?: string;
}

// ==================== ICONS ====================

const Icons = {
  general: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  appearance: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>,
  privacy: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  notifications: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  storage: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  keyboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M8 12h.001"/><path d="M12 12h.001"/><path d="M16 12h.001"/><path d="M7 16h10"/></svg>,
  about: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ==================== SETTING COMPONENTS ====================

const ToggleControl: React.FC<{ setting: ToggleSetting }> = ({ setting }) => {
  const styles: Record<string, React.CSSProperties> = {
    toggle: {
      width: 44,
      height: 24,
      background: setting.value ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
      borderRadius: 12,
      position: 'relative',
      cursor: setting.disabled ? 'not-allowed' : 'pointer',
      transition: 'background 0.2s',
      opacity: setting.disabled ? 0.5 : 1,
    },
    knob: {
      width: 20,
      height: 20,
      background: '#fff',
      borderRadius: '50%',
      position: 'absolute',
      top: 2,
      left: setting.value ? 22 : 2,
      transition: 'left 0.2s',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    },
  };

  return (
    <div
      style={styles.toggle}
      onClick={() => !setting.disabled && setting.onChange(!setting.value)}
    >
      <div style={styles.knob} />
    </div>
  );
};

const SelectControl: React.FC<{ setting: SelectSetting }> = ({ setting }) => {
  const styles: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 14,
    color: 'var(--color-text-primary)',
    outline: 'none',
    cursor: setting.disabled ? 'not-allowed' : 'pointer',
    opacity: setting.disabled ? 0.5 : 1,
    minWidth: 150,
  };

  return (
    <select
      style={styles}
      value={setting.value}
      onChange={e => setting.onChange(e.target.value)}
      disabled={setting.disabled}
    >
      {setting.options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
};

const SliderControl: React.FC<{ setting: SliderSetting }> = ({ setting }) => {
  const percentage = ((setting.value - setting.min) / (setting.max - setting.min)) * 100;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      opacity: setting.disabled ? 0.5 : 1,
    },
    slider: {
      flex: 1,
      height: 6,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 3,
      position: 'relative',
      cursor: setting.disabled ? 'not-allowed' : 'pointer',
    },
    fill: {
      position: 'absolute',
      left: 0,
      top: 0,
      height: '100%',
      width: `${percentage}%`,
      background: 'var(--color-accent)',
      borderRadius: 3,
    },
    thumb: {
      position: 'absolute',
      left: `${percentage}%`,
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: 16,
      height: 16,
      background: '#fff',
      borderRadius: '50%',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    },
    value: {
      fontSize: 13,
      color: 'var(--color-text-primary)',
      minWidth: 50,
      textAlign: 'right',
    },
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (setting.disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const value = setting.min + percent * (setting.max - setting.min);
    const stepped = Math.round(value / (setting.step || 1)) * (setting.step || 1);
    setting.onChange(Math.max(setting.min, Math.min(setting.max, stepped)));
  };

  return (
    <div style={styles.container}>
      <div style={styles.slider} onClick={handleClick}>
        <div style={styles.fill} />
        <div style={styles.thumb} />
      </div>
      <span style={styles.value}>
        {setting.value}{setting.unit || ''}
      </span>
    </div>
  );
};

const InputControl: React.FC<{ setting: InputSetting }> = ({ setting }) => {
  const styles: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 14,
    color: 'var(--color-text-primary)',
    outline: 'none',
    opacity: setting.disabled ? 0.5 : 1,
    minWidth: 200,
  };

  return (
    <input
      type={setting.inputType || 'text'}
      style={styles}
      value={setting.value}
      placeholder={setting.placeholder}
      onChange={e => setting.onChange(e.target.value)}
      disabled={setting.disabled}
    />
  );
};

const ColorControl: React.FC<{ setting: ColorSetting }> = ({ setting }) => {
  const [showPicker, setShowPicker] = useState(false);

  const defaultPresets = [
    '#007AFF', '#5856D6', '#FF2D55', '#FF3B30', '#FF9500',
    '#FFCC00', '#34C759', '#5AC8FA', '#AF52DE', '#000000',
  ];
  const presets = setting.presets || defaultPresets;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: 8,
      background: setting.value,
      border: '2px solid var(--color-border)',
      cursor: 'pointer',
    },
    picker: {
      position: 'absolute',
      right: 0,
      top: '100%',
      marginTop: 8,
      padding: 12,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      zIndex: 100,
    },
    presets: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 8,
      marginBottom: 12,
    },
    preset: {
      width: 28,
      height: 28,
      borderRadius: 6,
      border: '2px solid transparent',
      cursor: 'pointer',
    },
    input: {
      width: '100%',
      padding: '8px 10px',
      background: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text-primary)',
      outline: 'none',
    },
  };

  return (
    <div style={styles.container}>
      <div
        style={styles.swatch}
        onClick={() => setShowPicker(!showPicker)}
      />
      {showPicker && (
        <div style={styles.picker}>
          <div style={styles.presets}>
            {presets.map(color => (
              <div
                key={color}
                style={{
                  ...styles.preset,
                  background: color,
                  borderColor: setting.value === color ? 'var(--color-accent)' : 'transparent',
                }}
                onClick={() => setting.onChange(color)}
              />
            ))}
          </div>
          <input
            type="text"
            style={styles.input}
            value={setting.value}
            onChange={e => setting.onChange(e.target.value)}
            placeholder="#000000"
          />
        </div>
      )}
    </div>
  );
};

const KeybindControl: React.FC<{ setting: KeybindSetting }> = ({ setting }) => {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      setting.onChange(parts.join('+'));
      setRecording(false);
    }
  }, [setting]);

  React.useEffect(() => {
    if (recording) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [recording, handleKeyDown]);

  const styles: React.CSSProperties = {
    padding: '8px 14px',
    background: recording ? 'var(--color-accent-muted)' : 'var(--color-bg-tertiary)',
    border: `2px solid ${recording ? 'var(--color-accent)' : 'var(--color-border)'}`,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'monospace',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    minWidth: 120,
    textAlign: 'center',
  };

  return (
    <div style={styles} onClick={() => setRecording(true)}>
      {recording ? 'Press keys...' : setting.value || 'Click to set'}
    </div>
  );
};

// ==================== SETTING ROW ====================

const SettingRow: React.FC<{ setting: Setting }> = ({ setting }) => {
  if (setting.hidden) return null;

  const styles: Record<string, React.CSSProperties> = {
    row: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 0',
      borderBottom: '1px solid var(--color-border-light)',
    },
    info: {
      flex: 1,
      marginRight: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text-primary)',
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-secondary)',
      marginTop: 4,
    },
  };

  const renderControl = () => {
    switch (setting.type) {
      case 'toggle':
        return <ToggleControl setting={setting} />;
      case 'select':
        return <SelectControl setting={setting} />;
      case 'slider':
        return <SliderControl setting={setting} />;
      case 'input':
        return <InputControl setting={setting} />;
      case 'color':
        return <ColorControl setting={setting} />;
      case 'keybind':
        return <KeybindControl setting={setting} />;
      case 'custom':
        return setting.render();
      default:
        return null;
    }
  };

  return (
    <div style={styles.row}>
      <div style={styles.info}>
        <div style={styles.label}>{setting.label}</div>
        {setting.description && (
          <div style={styles.description}>{setting.description}</div>
        )}
      </div>
      {renderControl()}
    </div>
  );
};

// ==================== SETTINGS PANEL ====================

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  categories,
  onClose,
  title = 'Settings',
}) => {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);
  const [searchQuery, setSearchQuery] = useState('');

  const activeSettings = categories.find(c => c.id === activeCategory)?.settings || [];
  
  const filteredSettings = searchQuery
    ? categories.flatMap(c => c.settings).filter(s =>
        s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activeSettings;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      height: '100%',
      background: 'var(--color-bg-primary)',
    },
    sidebar: {
      width: 220,
      borderRight: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
    },
    sidebarHeader: {
      padding: 20,
      borderBottom: '1px solid var(--color-border)',
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    nav: {
      flex: 1,
      overflowY: 'auto',
      padding: 12,
    },
    navItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderRadius: 8,
      cursor: 'pointer',
      color: 'var(--color-text-secondary)',
      transition: 'all 0.15s',
      marginBottom: 4,
    },
    navItemActive: {
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-text-primary)',
    },
    navItemLabel: {
      fontSize: 14,
      fontWeight: 500,
    },
    content: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    contentHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px',
      borderBottom: '1px solid var(--color-border)',
    },
    searchInput: {
      padding: '10px 14px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text-primary)',
      outline: 'none',
      width: 300,
    },
    closeBtn: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
    contentBody: {
      flex: 1,
      overflowY: 'auto',
      padding: '0 24px 24px',
    },
    categoryTitle: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginTop: 24,
      marginBottom: 8,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.title}>{title}</div>
        </div>
        <nav style={styles.nav}>
          {categories.map(category => (
            <div
              key={category.id}
              style={{
                ...styles.navItem,
                ...(activeCategory === category.id ? styles.navItemActive : {}),
              }}
              onClick={() => {
                setActiveCategory(category.id);
                setSearchQuery('');
              }}
            >
              {category.icon}
              <span style={styles.navItemLabel}>{category.label}</span>
            </div>
          ))}
        </nav>
      </div>

      <div style={styles.content}>
        <div style={styles.contentHeader}>
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose}>
              {Icons.close}
            </button>
          )}
        </div>
        <div style={styles.contentBody}>
          {searchQuery ? (
            <>
              <div style={styles.categoryTitle}>Search Results</div>
              {filteredSettings.map(setting => (
                <SettingRow key={setting.id} setting={setting} />
              ))}
            </>
          ) : (
            filteredSettings.map(setting => (
              <SettingRow key={setting.id} setting={setting} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== SETTINGS HOOKS ====================

export const useSettings = <T extends Record<string, any>>(
  defaultSettings: T,
  storageKey: string = 'dex-settings'
) => {
  const [settings, setSettingsState] = useState<T>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  });

  const setSetting = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setSettingsState(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, [storageKey]);

  const setSettings = useCallback((newSettings: Partial<T>) => {
    setSettingsState(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, [storageKey]);

  const resetSettings = useCallback(() => {
    setSettingsState(defaultSettings);
    localStorage.removeItem(storageKey);
  }, [defaultSettings, storageKey]);

  return { settings, setSetting, setSettings, resetSettings };
};

export default SettingsPanel;
