import React, { useRef, useState, useCallback } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { createLowlight, common } from 'lowlight'

const lowlight = createLowlight(common)
import type { Theme } from '../theme'

interface Props {
  language: string
  content: string
  theme: Theme
}

function createHighlightedLines(code: string, language: string, textColor: string): React.ReactNode[] {
  try {
    const tree = lowlight.highlight(language, code)
    return tree.children.map((node: any, lineIdx: number) => {
      const children = node.children.map((token: any, tokenIdx: number) => {
        const color = token.properties?.className?.[0]
          ? HIGHLIGHT_COLORS[token.properties.className[0]] || textColor
          : textColor
        return (
          <Text key={tokenIdx} style={{ color }}>
            {token.value}
          </Text>
        )
      })
      return <View key={lineIdx} style={styles.lineRow}>{children}</View>
    })
  } catch (e) {
    return code.split('\n').map((line, i) => (
      <View key={i} style={styles.lineRow}>
        <Text style={{ color: textColor }}>{line}</Text>
      </View>
    ))
  }
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  'hljs-keyword': '#c792ea',
  'hljs-string': '#c3e88d',
  'hljs-number': '#f78c6c',
  'hljs-built_in': '#82aaff',
  'hljs-literal': '#ff869a',
  'hljs-type': '#ffcb6b',
  'hljs-attr': '#f07178',
  'hljs-attribute': '#f07178',
  'hljs-title': '#82aaff',
  'hljs-title.function_': '#82aaff',
  'hljs-title.class_': '#ffcb6b',
  'hljs-comment': '#546e7a',
  'hljs-variable': '#eeffff',
  'hljs-params': '#eeffff',
  'hljs-property': '#f07178',
  'hljs-operator': '#89ddff',
  'hljs-punctuation': '#89ddff',
  'hljs-meta': '#82aaff',
  'hljs-selector-tag': '#c792ea',
  'hljs-selector-class': '#ffcb6b',
  'hljs-selector-id': '#f07178',
  'hljs-regexp': '#c3e88d',
  'hljs-symbol': '#f78c6c',
  'hljs-section': '#82aaff',
  'hljs-link': '#82aaff',
  'hljs-deletion': '#f07178',
  'hljs-addition': '#c3e88d',
}

let themeColors = { text: '#e8e8f0' }

export default function CodeBlockWrapper({ language, content, theme }: Props) {
  const [copied, setCopied] = useState(false)
  const lines = content.split('\n')
  const highlighted = useRef(createHighlightedLines(content, language || 'text', theme.text))

  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [content])

  return (
    <View style={[styles.container, { backgroundColor: theme.codeBg, borderColor: theme.border }]}>
      <View style={[styles.header, { backgroundColor: theme.codeHeader }]}>
        <Text style={[styles.lang, { color: theme.textTertiary }]}>{language || 'code'}</Text>
        <TouchableOpacity
          onPress={handleCopy}
          style={[styles.copyButton, { backgroundColor: codeAlpha(theme, 0.06) }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.copyText, { color: theme.text }]}>
            {copied ? '✅' : '📋'} {copied ? '已复制' : '复制'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.codeRow}>
          <View style={[styles.lineNumbers, { borderRightColor: codeAlpha(theme, 0.04) }]}>
            {lines.map((_, i) => (
              <Text key={i} style={[styles.lineNumber, { color: theme.codeLineNumber }]}>
                {i + 1}
              </Text>
            ))}
          </View>
          <View style={styles.codeContent}>
            {highlighted.current.map((node, i) => (
              <View key={i} style={styles.lineRow}>
                {node}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function codeAlpha(theme: Theme, alpha: number): string {
  const hex = theme.text === '#e8e8f0' ? 'ffffff' : '000000'
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `#${hex}${a}`
}

const styles = StyleSheet.create({
  container: { borderRadius: 10, marginVertical: 6, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lang: { fontSize: 11, fontWeight: '600', flex: 1, textTransform: 'lowercase' },
  copyButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  copyText: { fontSize: 11 },
  codeRow: { flexDirection: 'row', minWidth: '100%' },
  lineNumbers: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    alignItems: 'flex-end',
  },
  lineNumber: { fontSize: 11, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  codeContent: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flex: 1,
  },
  lineRow: { flexDirection: 'row', height: 20 },
})