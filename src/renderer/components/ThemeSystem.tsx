/**
 * DEX Theme System
 * Comprehensive theming with light/dark modes and custom themes
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

type ThemeMode = 'light' | 'dark' | 'system';
type AccentColor = 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan';

interface ThemeColors {
  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  bgOverlay: string;
  
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  
  // Accent
  accent: string;
  accentHover: string;
  accentMuted: string;
  
  // Borders
  border: string;
  borderLight: string;
  
  // Status
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // Shadows
  shadow: string;
  shadowStrong: string;
}

interface Theme {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  colors: ThemeColors;
}

interface ThemeContextType {
  theme: Theme;
  mode: ThemeMode;
  accent: AccentColor;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  setCustomTheme: (theme: Theme) => void;
  themes: Theme[];
  addCustomTheme: (theme: Omit<Theme, 'id'>) => void;
  removeCustomTheme: (id: string) => void;
}

// ==================== ACCENT COLORS ====================

const ACCENT_COLORS: Record<AccentColor, { light: string; dark: string; hover: string; muted: string }> = {
  blue: { light: '#007AFF', dark: '#0A84FF', hover: '#0051FF', muted: '#007AFF30' },
  purple: { light: '#5856D6', dark: '#BF5AF2', hover: '#4040C0', muted: '#5856D630' },
  pink: { light: '#FF2D55', dark: '#FF375F', hover: '#D61F44', muted: '#FF2D5530' },
  red: { light: '#FF3B30', dark: '#FF453A', hover: '#D6291E', muted: '#FF3B3030' },
  orange: { light: '#FF9500', dark: '#FF9F0A', hover: '#D67F00', muted: '#FF950030' },
  yellow: { light: '#FFCC00', dark: '#FFD60A', hover: '#D6AB00', muted: '#FFCC0030' },
  green: { light: '#34C759', dark: '#30D158', hover: '#28A647', muted: '#34C75930' },
  teal: { light: '#5AC8FA', dark: '#64D2FF', hover: '#40B0E0', muted: '#5AC8FA30' },
  cyan: { light: '#32ADE6', dark: '#5AC8FA', hover: '#2898CC', muted: '#32ADE630' },
};

// ==================== DEFAULT THEMES ====================

const createLightTheme = (accent: AccentColor): Theme => ({
  id: 'light',
  name: 'Light',
  mode: 'light',
  colors: {
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F5F5F7',
    bgTertiary: '#EBEBF0',
    bgElevated: '#FFFFFF',
    bgOverlay: 'rgba(0, 0, 0, 0.4)',
    textPrimary: '#1D1D1F',
    textSecondary: '#6E6E73',
    textMuted: '#8E8E93',
    textInverse: '#FFFFFF',
    accent: ACCENT_COLORS[accent].light,
    accentHover: ACCENT_COLORS[accent].hover,
    accentMuted: ACCENT_COLORS[accent].muted,
    border: '#D1D1D6',
    borderLight: '#E5E5EA',
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',
    shadow: 'rgba(0, 0, 0, 0.1)',
    shadowStrong: 'rgba(0, 0, 0, 0.2)',
  },
});

const createDarkTheme = (accent: AccentColor): Theme => ({
  id: 'dark',
  name: 'Dark',
  mode: 'dark',
  colors: {
    bgPrimary: '#1C1C1E',
    bgSecondary: '#2C2C2E',
    bgTertiary: '#3A3A3C',
    bgElevated: '#2C2C2E',
    bgOverlay: 'rgba(0, 0, 0, 0.6)',
    textPrimary: '#FFFFFF',
    textSecondary: '#AEAEB2',
    textMuted: '#636366',
    textInverse: '#1D1D1F',
    accent: ACCENT_COLORS[accent].dark,
    accentHover: ACCENT_COLORS[accent].hover,
    accentMuted: ACCENT_COLORS[accent].muted,
    border: '#38383A',
    borderLight: '#48484A',
    success: '#30D158',
    warning: '#FF9F0A',
    error: '#FF453A',
    info: '#0A84FF',
    shadow: 'rgba(0, 0, 0, 0.3)',
    shadowStrong: 'rgba(0, 0, 0, 0.5)',
  },
});

// ==================== PRESET THEMES ====================

const PRESET_THEMES: Theme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    colors: {
      bgPrimary: '#0D1117',
      bgSecondary: '#161B22',
      bgTertiary: '#21262D',
      bgElevated: '#1F2428',
      bgOverlay: 'rgba(0, 0, 0, 0.7)',
      textPrimary: '#E6EDF3',
      textSecondary: '#8B949E',
      textMuted: '#6E7681',
      textInverse: '#0D1117',
      accent: '#58A6FF',
      accentHover: '#388BFD',
      accentMuted: '#58A6FF30',
      border: '#30363D',
      borderLight: '#3D444D',
      success: '#3FB950',
      warning: '#D29922',
      error: '#F85149',
      info: '#58A6FF',
      shadow: 'rgba(0, 0, 0, 0.4)',
      shadowStrong: 'rgba(0, 0, 0, 0.6)',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    mode: 'dark',
    colors: {
      bgPrimary: '#1A1423',
      bgSecondary: '#251B2E',
      bgTertiary: '#2F2339',
      bgElevated: '#2A1F33',
      bgOverlay: 'rgba(0, 0, 0, 0.65)',
      textPrimary: '#F5E6FF',
      textSecondary: '#B8A6C9',
      textMuted: '#8B7A9E',
      textInverse: '#1A1423',
      accent: '#FF6B9D',
      accentHover: '#FF4785',
      accentMuted: '#FF6B9D30',
      border: '#3D2F4A',
      borderLight: '#4A3A59',
      success: '#7AE582',
      warning: '#FFB347',
      error: '#FF6B6B',
      info: '#7BB3FF',
      shadow: 'rgba(0, 0, 0, 0.35)',
      shadowStrong: 'rgba(0, 0, 0, 0.55)',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    colors: {
      bgPrimary: '#0F1A14',
      bgSecondary: '#162419',
      bgTertiary: '#1D2E21',
      bgElevated: '#1A281D',
      bgOverlay: 'rgba(0, 0, 0, 0.6)',
      textPrimary: '#E8F5E9',
      textSecondary: '#A5C4AC',
      textMuted: '#7A9980',
      textInverse: '#0F1A14',
      accent: '#4ADE80',
      accentHover: '#22C55E',
      accentMuted: '#4ADE8030',
      border: '#2D4A34',
      borderLight: '#3A5C42',
      success: '#4ADE80',
      warning: '#FACC15',
      error: '#FB7185',
      info: '#38BDF8',
      shadow: 'rgba(0, 0, 0, 0.35)',
      shadowStrong: 'rgba(0, 0, 0, 0.5)',
    },
  },
  {
    id: 'cream',
    name: 'Cream',
    mode: 'light',
    colors: {
      bgPrimary: '#FDF8F3',
      bgSecondary: '#F5EDE4',
      bgTertiary: '#EBE1D6',
      bgElevated: '#FFFFFF',
      bgOverlay: 'rgba(0, 0, 0, 0.35)',
      textPrimary: '#3D3328',
      textSecondary: '#6B5D4D',
      textMuted: '#9A8B78',
      textInverse: '#FDF8F3',
      accent: '#B35C21',
      accentHover: '#944A18',
      accentMuted: '#B35C2130',
      border: '#D9CFC2',
      borderLight: '#E8DFD4',
      success: '#5F8A4A',
      warning: '#C47F17',
      error: '#C44536',
      info: '#2D6A91',
      shadow: 'rgba(61, 51, 40, 0.08)',
      shadowStrong: 'rgba(61, 51, 40, 0.16)',
    },
  },
];

// ==================== CONTEXT ====================

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// ==================== APPLY THEME CSS ====================

const applyThemeCSS = (theme: Theme) => {
  const root = document.documentElement;
  const { colors } = theme;

  // Set CSS variables
  root.style.setProperty('--color-bg-primary', colors.bgPrimary);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--color-bg-elevated', colors.bgElevated);
  root.style.setProperty('--color-bg-overlay', colors.bgOverlay);
  
  root.style.setProperty('--color-text-primary', colors.textPrimary);
  root.style.setProperty('--color-text-secondary', colors.textSecondary);
  root.style.setProperty('--color-text-muted', colors.textMuted);
  root.style.setProperty('--color-text-inverse', colors.textInverse);
  
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-accent-hover', colors.accentHover);
  root.style.setProperty('--color-accent-muted', colors.accentMuted);
  
  root.style.setProperty('--color-border', colors.border);
  root.style.setProperty('--color-border-light', colors.borderLight);
  
  root.style.setProperty('--color-success', colors.success);
  root.style.setProperty('--color-warning', colors.warning);
  root.style.setProperty('--color-error', colors.error);
  root.style.setProperty('--color-info', colors.info);
  
  root.style.setProperty('--shadow', colors.shadow);
  root.style.setProperty('--shadow-strong', colors.shadowStrong);

  // Set color scheme for browser chrome
  root.style.colorScheme = theme.mode;
};

// ==================== THEME PROVIDER ====================

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
  defaultAccent?: AccentColor;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultMode = 'system',
  defaultAccent = 'blue',
}) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('dex-theme-mode');
    return (stored as ThemeMode) || defaultMode;
  });

  const [accent, setAccentState] = useState<AccentColor>(() => {
    const stored = localStorage.getItem('dex-accent-color');
    return (stored as AccentColor) || defaultAccent;
  });

  const [customThemes, setCustomThemes] = useState<Theme[]>(() => {
    const stored = localStorage.getItem('dex-custom-themes');
    return stored ? JSON.parse(stored) : [];
  });

  const [customTheme, setCustomThemeState] = useState<Theme | null>(() => {
    const storedId = localStorage.getItem('dex-custom-theme-id');
    if (storedId) {
      const stored = localStorage.getItem('dex-custom-themes');
      const themes = stored ? JSON.parse(stored) : [];
      return themes.find((t: Theme) => t.id === storedId) || null;
    }
    return null;
  });

  // Detect system preference
  const [systemMode, setSystemMode] = useState<'light' | 'dark'>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Compute effective theme
  const theme = useMemo(() => {
    if (customTheme) return customTheme;
    
    const effectiveMode = mode === 'system' ? systemMode : mode;
    return effectiveMode === 'dark' ? createDarkTheme(accent) : createLightTheme(accent);
  }, [mode, systemMode, accent, customTheme]);

  // Apply theme when it changes
  useEffect(() => {
    applyThemeCSS(theme);
  }, [theme]);

  // Save preferences
  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    setCustomThemeState(null);
    localStorage.setItem('dex-theme-mode', newMode);
    localStorage.removeItem('dex-custom-theme-id');
  }, []);

  const setAccent = useCallback((newAccent: AccentColor) => {
    setAccentState(newAccent);
    localStorage.setItem('dex-accent-color', newAccent);
  }, []);

  const setCustomTheme = useCallback((newTheme: Theme) => {
    setCustomThemeState(newTheme);
    localStorage.setItem('dex-custom-theme-id', newTheme.id);
  }, []);

  const addCustomTheme = useCallback((themeData: Omit<Theme, 'id'>) => {
    const newTheme: Theme = {
      ...themeData,
      id: `custom-${Date.now()}`,
    };
    setCustomThemes(prev => {
      const updated = [...prev, newTheme];
      localStorage.setItem('dex-custom-themes', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeCustomTheme = useCallback((id: string) => {
    setCustomThemes(prev => {
      const updated = prev.filter(t => t.id !== id);
      localStorage.setItem('dex-custom-themes', JSON.stringify(updated));
      return updated;
    });
    if (customTheme?.id === id) {
      setCustomThemeState(null);
      localStorage.removeItem('dex-custom-theme-id');
    }
  }, [customTheme]);

  const themes = useMemo(() => [
    createLightTheme(accent),
    createDarkTheme(accent),
    ...PRESET_THEMES,
    ...customThemes,
  ], [accent, customThemes]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        accent,
        setMode,
        setAccent,
        setCustomTheme,
        themes,
        addCustomTheme,
        removeCustomTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

// ==================== THEME SELECTOR COMPONENT ====================

interface ThemeSelectorProps {
  showModeToggle?: boolean;
  showAccentPicker?: boolean;
  showThemeList?: boolean;
  compact?: boolean;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  showModeToggle = true,
  showAccentPicker = true,
  showThemeList = true,
  compact = false,
}) => {
  const { mode, setMode, accent, setAccent, themes, theme, setCustomTheme } = useTheme();

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: compact ? 12 : 20,
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    label: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    modeToggle: {
      display: 'flex',
      gap: 4,
      padding: 4,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 10,
    },
    modeBtn: {
      flex: 1,
      padding: '8px 16px',
      background: 'transparent',
      border: 'none',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      color: 'var(--color-text-secondary)',
      transition: 'all 0.2s',
    },
    modeBtnActive: {
      background: 'var(--color-bg-elevated)',
      color: 'var(--color-text-primary)',
      boxShadow: '0 2px 6px var(--shadow)',
    },
    accentGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(9, 1fr)',
      gap: 8,
    },
    accentBtn: {
      width: compact ? 24 : 32,
      height: compact ? 24 : 32,
      borderRadius: '50%',
      border: '2px solid transparent',
      cursor: 'pointer',
      transition: 'transform 0.15s, border-color 0.15s',
    },
    themeGrid: {
      display: 'grid',
      gridTemplateColumns: compact ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
      gap: 8,
    },
    themeBtn: {
      padding: compact ? 8 : 12,
      background: 'var(--color-bg-tertiary)',
      border: '2px solid transparent',
      borderRadius: 10,
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'border-color 0.2s, transform 0.15s',
    },
    themeBtnActive: {
      borderColor: 'var(--color-accent)',
    },
    themePreview: {
      display: 'flex',
      gap: 4,
      marginBottom: 8,
    },
    themeColor: {
      width: compact ? 16 : 20,
      height: compact ? 16 : 20,
      borderRadius: 4,
    },
    themeName: {
      fontSize: compact ? 11 : 13,
      fontWeight: 500,
      color: 'var(--color-text-primary)',
    },
  };

  const modeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { 
      value: 'light', 
      label: 'Light',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    },
    { 
      value: 'dark', 
      label: 'Dark',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    },
    { 
      value: 'system', 
      label: 'Auto',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    },
  ];

  return (
    <div style={styles.container}>
      {showModeToggle && (
        <div style={styles.section}>
          <span style={styles.label}>Appearance</span>
          <div style={styles.modeToggle}>
            {modeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                style={{
                  ...styles.modeBtn,
                  ...(mode === opt.value ? styles.modeBtnActive : {}),
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAccentPicker && (
        <div style={styles.section}>
          <span style={styles.label}>Accent Color</span>
          <div style={styles.accentGrid}>
            {(Object.keys(ACCENT_COLORS) as AccentColor[]).map(color => (
              <button
                key={color}
                onClick={() => setAccent(color)}
                style={{
                  ...styles.accentBtn,
                  background: ACCENT_COLORS[color].light,
                  borderColor: accent === color ? 'var(--color-text-primary)' : 'transparent',
                  transform: accent === color ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showThemeList && (
        <div style={styles.section}>
          <span style={styles.label}>Themes</span>
          <div style={styles.themeGrid}>
            {themes.slice(2).map(t => (
              <button
                key={t.id}
                onClick={() => setCustomTheme(t)}
                style={{
                  ...styles.themeBtn,
                  ...(theme.id === t.id ? styles.themeBtnActive : {}),
                }}
              >
                <div style={styles.themePreview}>
                  <div style={{ ...styles.themeColor, background: t.colors.bgPrimary }} />
                  <div style={{ ...styles.themeColor, background: t.colors.accent }} />
                  <div style={{ ...styles.themeColor, background: t.colors.textPrimary }} />
                </div>
                <span style={styles.themeName}>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== QUICK TOGGLE COMPONENT ====================

export const ThemeQuickToggle: React.FC<{ size?: number }> = ({ size = 36 }) => {
  const { theme, mode, setMode } = useTheme();

  const toggle = () => {
    const newMode = theme.mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
  };

  const styles: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-tertiary)',
    border: 'none',
    borderRadius: size / 2,
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    transition: 'background 0.2s',
  };

  return (
    <button style={styles} onClick={toggle} title={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`}>
      {theme.mode === 'dark' ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
};

export default ThemeProvider;
