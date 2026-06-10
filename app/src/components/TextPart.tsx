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
    body: { color: isUser ? '#fff' : theme.text, fontSize: 15, lineHeight: 24 },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : theme.surfaceSecondary,
      color: isUser ? '#fff' : theme.accent,
      fontSize: 13,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    fence: { display: 'none' as any },
    code_block: { display: 'none' as any },
    blockquote: {
      borderLeftColor: theme.thinkingBorder,
      borderLeftWidth: 3,
      paddingLeft: 12,
      paddingVertical: 4,
      marginVertical: 6,
      backgroundColor: 'transparent',
    },
    heading1: { color: isUser ? '#fff' : theme.text, fontSize: 20, fontWeight: 'bold' as const, marginVertical: 8 },
    heading2: { color: isUser ? '#fff' : theme.text, fontSize: 18, fontWeight: 'bold' as const, marginVertical: 6 },
    heading3: { color: isUser ? '#fff' : theme.text, fontSize: 16, fontWeight: '600' as const, marginVertical: 4 },
    hr: { backgroundColor: theme.border, height: 1, marginVertical: 10 },
    link: { color: isUser ? 'rgba(255,255,255,0.85)' : theme.accent, textDecorationLine: 'underline' as const },
    list_item: { flexDirection: 'row' as const, marginVertical: 2 },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    table: { borderWidth: 1, borderColor: theme.border, marginVertical: 6, borderRadius: 6, overflow: 'hidden' as const },
    thead: { backgroundColor: theme.surfaceSecondary } as any,
    th: { padding: 8, fontWeight: '600' as const, borderRightWidth: 1, borderColor: theme.border, color: theme.text },
    td: { padding: 8, borderRightWidth: 1, borderColor: theme.border, color: theme.text },
    tr: { borderBottomWidth: 1, borderColor: theme.border },
    paragraph: { marginVertical: 4 },
    strong: { fontWeight: '600' as const },
    em: { fontStyle: 'italic' as const },
  }

  return <Markdown style={style}>{text}</Markdown>
}