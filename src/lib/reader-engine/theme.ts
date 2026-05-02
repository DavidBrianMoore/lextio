export type ThemeName = 'audire' | 'day' | 'sepia' | 'night';
export type FontFamily = 'inter' | 'lora' | 'mono';

export interface Theme {
  name: ThemeName;
  label: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
  toolbarBg: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  audire: {
    name: 'audire',
    label: 'Audire',
    bg: '#0a0b0d',
    surface: '#16181d',
    text: '#ffffff',
    textMuted: '#94a3b8',
    accent: '#81e6d9',
    border: 'rgba(255,255,255,0.1)',
    toolbarBg: 'rgba(10,11,13,0.8)',
  },
  day: {
    name: 'day',
    label: 'Day',
    bg: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    accent: '#0ea5e9',
    border: '#e2e8f0',
    toolbarBg: 'rgba(255,255,255,0.9)',
  },
  sepia: {
    name: 'sepia',
    label: 'Sepia',
    bg: '#f4ead5',
    surface: '#fdf6e3',
    text: '#3b2f1e',
    textMuted: '#8a7560',
    accent: '#b5601e',
    border: '#e0d4b8',
    toolbarBg: 'rgba(244,234,213,0.9)',
  },
  night: {
    name: 'night',
    label: 'Night',
    bg: '#111215',
    surface: '#1a1d21',
    text: '#dddad4',
    textMuted: '#787570',
    accent: '#7da4e0',
    border: '#2a2d32',
    toolbarBg: 'rgba(17,18,21,0.9)',
  },
};

export const FONT_FAMILIES: Record<FontFamily, string> = {
  inter: "'Inter', system-ui, sans-serif",
  lora: "'Lora', Georgia, serif",
  mono: "'JetBrains Mono', monospace",
};

export interface ReaderSettings {
  theme: ThemeName;
  font: FontFamily;
  fontSize: number;
  lineHeight: number;
  columnWidth: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'audire',
  font: 'inter',
  fontSize: 22,
  lineHeight: 1.6,
  columnWidth: 1000,
};

export function fontString(settings: ReaderSettings): string {
  return `${settings.fontSize}px ${FONT_FAMILIES[settings.font]}`;
}

export function headingFontString(level: number, settings: ReaderSettings): string {
  const sizes: Record<number, number> = { 1: 2.2, 2: 1.8, 3: 1.5, 4: 1.2, 5: 1.0, 6: 0.9 };
  const scale = sizes[level] ?? 1.0;
  const px = Math.round(settings.fontSize * scale);
  return `700 ${px}px ${FONT_FAMILIES[settings.font]}`;
}
