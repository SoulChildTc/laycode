import React, { useState, useCallback, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { createLowlight, common } from 'lowlight'

const lowlight = createLowlight(common)
import type { Theme } from '../theme'

interface Props {
  language: string
  content: string
  theme: Theme
  noBorder?: boolean
}

interface LineData {
  num: number
  text: string
  color?: string
  bg?: string
  parts?: { text: string; color: string }[]
}

function getDiffLineBg(lineText: string): string | undefined {
  if (lineText.startsWith('+')) return 'rgba(52,199,89,0.12)'
  if (lineText.startsWith('-')) return 'rgba(255,59,48,0.12)'
  return undefined
}

function highlightLines(code: string, language: string, textColor: string): LineData[] {
  const codeLines = code.split('\n')

  if (language === 'diff') {
    return codeLines.map((line, i) => ({
      num: i + 1,
      text: line,
      color: line.startsWith('+') ? '#34C759' : line.startsWith('-') ? '#FF3B30' : textColor,
      bg: getDiffLineBg(line),
    }))
  }

  try {
    const tree = lowlight.highlight(language, code)
    const result: { parts: { text: string; color: string }[] }[] = []
    let currentParts: { text: string; color: string }[] = []

    for (const node of tree.children as any[]) {
      let text: string
      let color: string

      if (node.type === 'text') {
        text = node.value
        color = textColor
      } else {
        const className = node.properties?.className?.[0]
        color = className && HIGHLIGHT_COLORS[className] ? HIGHLIGHT_COLORS[className] : textColor
        text = node.children?.[0]?.value || ''
      }

      const parts = text.split('\n')
      if (parts[0]) {
        currentParts.push({ text: parts[0], color })
      }
      for (let i = 1; i < parts.length; i++) {
        result.push({ parts: currentParts })
        currentParts = []
        if (parts[i]) {
          currentParts.push({ text: parts[i], color })
        }
      }
    }
    if (currentParts.length > 0) {
      result.push({ parts: currentParts })
    }

    return result.map((line, i) => ({
      num: i + 1,
      text: line.parts.map(p => p.text).join(''),
      parts: line.parts,
    }))
  } catch (e) {
    return codeLines.map((line, i) => ({
      num: i + 1,
      text: line,
      color: textColor,
    }))
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

function codeAlpha(theme: Theme, alpha: number): string {
  const hex = theme.text === '#e8e8f0' ? 'ffffff' : '000000'
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `#${hex}${a}`
}

export default function CodeBlockWrapper({ language, content, theme }: Props) {
  const [copied, setCopied] = useState(false)
  const [wrap, setWrap] = useState(false)
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content

  const lines = useMemo(() => highlightLines(normalized, language || 'text', theme.text), [normalized, language, theme.text])

  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [content])

  const renderLine = (line: LineData, i: number) => {
    const rowStyle = [styles.lineRow, line.bg ? { backgroundColor: line.bg } : undefined]

    return (
      <View key={i} style={rowStyle}>
        <Text style={[styles.lineNum, { color: theme.codeLineNumber }]}>{line.num}</Text>
        {line.parts ? (
          <Text style={[styles.lineCode, wrap && styles.lineCodeWrap, { color: theme.text }]}>
            {line.parts.map((p, j) => (
              <Text key={j} style={{ color: p.color }}>{p.text}</Text>
            ))}
          </Text>
        ) : (
          <Text style={[styles.lineCode, wrap && styles.lineCodeWrap, { color: line.color || theme.text }]}>
            {line.text}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.codeBg }]}>
      <View style={[styles.header, { backgroundColor: theme.codeHeader }]}>
        <Text style={[styles.lang, { color: theme.textTertiary }]}>{language || 'code'}</Text>
        <TouchableOpacity
          onPress={() => setWrap(!wrap)}
          style={[styles.toggleButton, wrap && { backgroundColor: codeAlpha(theme, 0.15) }]}
          activeOpacity={0.7}
        >
          <Feather name="align-left" size={13} color={theme.text} />
        </TouchableOpacity>
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
      {wrap ? (
        <View style={styles.codeArea}>
          {lines.map(renderLine)}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.codeArea}>
            {lines.map(renderLine)}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 10, marginVertical: 6, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lang: { fontSize: 11, fontWeight: '600', flex: 1, textTransform: 'lowercase' },
  toggleButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 6 },
  copyButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  copyText: { fontSize: 11 },
  codeArea: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lineRow: {
    flexDirection: 'row',
    minHeight: 20,
  },
  lineNum: {
    width: 36,
    fontSize: 11,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'right',
    paddingRight: 12,
    marginRight: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(128,128,128,0.15)',
  },
  lineCode: {
    fontSize: 11,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  lineCodeWrap: {
    flex: 1,
  },
})
