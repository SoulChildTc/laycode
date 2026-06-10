import React from 'react'
import { useWindowDimensions, TextStyle, ViewStyle } from 'react-native'
import Markdown from 'react-native-markdown-display'

interface Props {
  text: string
  theme: any
  isUser: boolean
}

export default function TextPart({ text, theme, isUser }: Props) {
  if (!text) return null
  const { width } = useWindowDimensions()

  const style: Record<string, TextStyle | ViewStyle> = {
    body: { color: isUser ? '#fff' : theme.text, fontSize: 15, lineHeight: 22 },
    code_inline: { backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : theme.surfaceSecondary, color: isUser ? '#fff' : theme.text, fontSize: 13, paddingHorizontal: 4, borderRadius: 4 },
    code_block: { backgroundColor: isUser ? 'rgba(0,0,0,0.15)' : '#1a1a2e', color: '#e4e4e4', fontSize: 13, fontFamily: 'monospace', padding: 10, borderRadius: 8, marginVertical: 6, maxWidth: width * 0.8 - 28 },
    fence: { backgroundColor: isUser ? 'rgba(0,0,0,0.15)' : '#1a1a2e', color: '#e4e4e4', fontSize: 13, fontFamily: 'monospace', padding: 10, borderRadius: 8, marginVertical: 6, maxWidth: width * 0.8 - 28 },
    blockquote: { borderLeftColor: theme.accent, borderLeftWidth: 3, paddingLeft: 10, opacity: 0.8 },
    heading1: { color: isUser ? '#fff' : theme.text, fontSize: 20, fontWeight: 'bold' as const, marginVertical: 6 },
    heading2: { color: isUser ? '#fff' : theme.text, fontSize: 18, fontWeight: 'bold' as const, marginVertical: 5 },
    heading3: { color: isUser ? '#fff' : theme.text, fontSize: 16, fontWeight: 'bold' as const, marginVertical: 4 },
    hr: { backgroundColor: theme.border, height: 1, marginVertical: 8 },
    link: { color: isUser ? 'rgba(255,255,255,0.85)' : theme.accent, textDecorationLine: 'underline' as const },
    list_item: { flexDirection: 'row' as const, marginVertical: 2 },
    table: { borderWidth: 1, borderColor: theme.border, marginVertical: 6 },
  }

  return <Markdown style={style}>{text}</Markdown>
}