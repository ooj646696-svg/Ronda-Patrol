export type ThemeName = 'light' | 'dark';

export type ThemeMode = ThemeName | 'system';

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  text: string;
  mutedText: string;
  border: string;
  inputBackground: string;
  inputBorder: string;
  placeholder: string;
  primary: string;
  danger: string;
};

export const colorsByTheme: Record<ThemeName, ThemeColors> = {
  dark: {
    background: '#0b0b0b',
    surface: '#111111',
    card: '#141414',
    text: '#ffffff',
    mutedText: '#888888',
    border: '#333333',
    inputBackground: '#1a1a1a',
    inputBorder: '#333333',
    placeholder: '#999999',
    primary: '#2d8c4c',
    danger: '#ff4444',
  },
  light: {
    background: '#f7f7f7',
    surface: '#ffffff',
    card: '#ffffff',
    text: '#111111',
    mutedText: '#555555',
    border: '#e3e3e3',
    inputBackground: '#ffffff',
    inputBorder: '#d7d7d7',
    placeholder: '#777777',
    primary: '#2d8c4c',
    danger: '#d92d20',
  },
};
