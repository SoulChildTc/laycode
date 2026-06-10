export type ThemeMode = 'dark' | 'light'

export interface Theme {
  background: string
  surface: string
  surfaceSecondary: string
  text: string
  textSecondary: string
  accent: string
  border: string
  error: string
  success: string
}

export const darkTheme: Theme = {
  background: '#0d0d1a',
  surface: '#1a1a2e',
  surfaceSecondary: '#252540',
  text: '#e0e0e0',
  textSecondary: '#8888aa',
  accent: '#667eea',
  border: '#2a2a45',
  error: '#ef4444',
  success: '#4ade80',
}

export const lightTheme: Theme = {
  background: '#f5f5fa',
  surface: '#ffffff',
  surfaceSecondary: '#f0f0f5',
  text: '#1a1a2e',
  textSecondary: '#666688',
  accent: '#667eea',
  border: '#e0e0ea',
  error: '#dc2626',
  success: '#16a34a',
}

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme
}
