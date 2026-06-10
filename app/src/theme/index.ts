export type ThemeMode = 'dark' | 'light'

export interface Theme {
  background: string
  surface: string
  surfaceSecondary: string
  text: string
  textSecondary: string
  textTertiary: string
  accent: string
  accentLight: string
  border: string
  borderLight: string
  error: string
  success: string
  warning: string
  codeBg: string
  codeHeader: string
  codeLineNumber: string
  thinkingBorder: string
  thinkingTitle: string
  thinkingText: string
  thinkingArrow: string
  toolRunningBg: string
  toolRunningBorder: string
  toolRunningText: string
  toolSuccessBg: string
  toolSuccessBorder: string
  toolSuccessText: string
  toolErrorBg: string
  toolErrorBorder: string
  toolErrorText: string
  userBubble: string
  userBubbleText: string
  aiBubble: string
  aiBubbleBorder: string
  aiBubbleText: string
  cursor: string
}

export const darkTheme: Theme = {
  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceSecondary: '#232340',
  text: '#e8e8f0',
  textSecondary: '#8888b0',
  textTertiary: '#5c5c7a',
  accent: '#6c7dff',
  accentLight: '#8b98ff',
  border: '#2a2a45',
  borderLight: '#35355a',
  error: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',
  codeBg: '#16162b',
  codeHeader: '#1e1e38',
  codeLineNumber: '#3a3a55',
  thinkingBorder: '#6c7dff',
  thinkingTitle: '#6c7dff',
  thinkingText: '#8888b0',
  thinkingArrow: '#5c5c7a',
  toolRunningBg: 'rgba(108,125,255,0.1)',
  toolRunningBorder: 'rgba(108,125,255,0.2)',
  toolRunningText: '#6c7dff',
  toolSuccessBg: 'rgba(74,222,128,0.08)',
  toolSuccessBorder: 'rgba(74,222,128,0.15)',
  toolSuccessText: '#4ade80',
  toolErrorBg: 'rgba(248,113,113,0.08)',
  toolErrorBorder: 'rgba(248,113,113,0.15)',
  toolErrorText: '#f87171',
  userBubble: '#6c7dff',
  userBubbleText: '#ffffff',
  aiBubble: '#1a1a2e',
  aiBubbleBorder: '#2a2a45',
  aiBubbleText: '#e8e8f0',
  cursor: '#e8e8f0',
}

export const lightTheme: Theme = {
  background: '#f5f5fa',
  surface: '#ffffff',
  surfaceSecondary: '#f0f0f5',
  text: '#1a1a2e',
  textSecondary: '#666688',
  textTertiary: '#9999bb',
  accent: '#667eea',
  accentLight: '#8895ee',
  border: '#e0e0ea',
  borderLight: '#eeeef5',
  error: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  codeBg: '#f8f8fc',
  codeHeader: '#eeeef5',
  codeLineNumber: '#ccccdd',
  thinkingBorder: '#667eea',
  thinkingTitle: '#667eea',
  thinkingText: '#666688',
  thinkingArrow: '#9999bb',
  toolRunningBg: 'rgba(102,126,234,0.08)',
  toolRunningBorder: 'rgba(102,126,234,0.18)',
  toolRunningText: '#667eea',
  toolSuccessBg: 'rgba(22,163,74,0.06)',
  toolSuccessBorder: 'rgba(22,163,74,0.15)',
  toolSuccessText: '#16a34a',
  toolErrorBg: 'rgba(220,38,38,0.06)',
  toolErrorBorder: 'rgba(220,38,38,0.15)',
  toolErrorText: '#dc2626',
  userBubble: '#667eea',
  userBubbleText: '#ffffff',
  aiBubble: '#ffffff',
  aiBubbleBorder: '#e0e0ea',
  aiBubbleText: '#1a1a2e',
  cursor: '#1a1a2e',
}

export function getTheme(mode: ThemeMode): Theme {
  return mode === 'dark' ? darkTheme : lightTheme
}