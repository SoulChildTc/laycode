import React, { useState, useCallback, useMemo } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, Modal, SafeAreaView } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { createLowlight, common } from 'lowlight'

const lowlight = createLowlight(common)
import type { Theme } from '../theme'

interface Props {
  language: string
  content: string
  theme: Theme
  fullContent?: string
  noBorder?: boolean
  noFullscreen?: boolean
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

function codeAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function normalizeContent(s: string): string {
  return s.endsWith('\n') ? s.slice(0, -1) : s
}

export default function CodeBlockWrapper({ language, content, theme, fullContent, noBorder, noFullscreen }: Props) {
  const [copied, setCopied] = useState(false)
  const [wrap, setWrap] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenWrap, setFullscreenWrap] = useState(false)

  const normalized = useMemo(() => normalizeContent(content), [content])
  const normalizedFull = useMemo(() => fullContent ? normalizeContent(fullContent) : null, [fullContent])

  const lines = useMemo(() => highlightLines(normalized, language || 'text', theme.text), [normalized, language, theme.text])
  const fullscreenLines = useMemo(
    () => normalizedFull ? highlightLines(normalizedFull, language || 'text', theme.text) : null,
    [normalizedFull, language, theme.text]
  )

  const handleCopy = useCallback((text: string) => {
    Clipboard.setStringAsync(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [])

  const renderLine = (line: LineData, i: number, useWrap: boolean) => {
    const rowStyle = [styles.lineRow, line.bg ? { backgroundColor: line.bg } : undefined]

    return (
      <View key={i} style={rowStyle}>
        <Text style={[styles.lineNum, { color: theme.codeLineNumber }]}>{line.num}</Text>
        {line.parts ? (
          <Text style={[styles.lineCode, useWrap && styles.lineCodeWrap, { color: theme.text }]}>
            {line.parts.map((p, j) => (
              <Text key={j} style={{ color: p.color }}>{p.text}</Text>
            ))}
          </Text>
        ) : (
          <Text style={[styles.lineCode, useWrap && styles.lineCodeWrap, { color: line.color || theme.text }]}>
            {line.text}
          </Text>
        )}
      </View>
    )
  }

  const renderLines = (data: LineData[], useWrap: boolean) => data.map((line, i) => renderLine(line, i, useWrap))

  const hasFull = !!normalizedFull && normalizedFull !== normalized

  return (
    <>
      <View style={[styles.container, noBorder && styles.containerNoBorder, { backgroundColor: theme.codeBg }]}>
        <View style={[styles.header, { backgroundColor: theme.codeHeader }]}>
          <Text style={[styles.lang, { color: theme.textTertiary }]}>{language || 'code'}</Text>
          <View style={styles.headerActions}>
            {!noFullscreen && (
              <TouchableOpacity
                onPress={() => setFullscreen(true)}
                style={[styles.copyButton, { backgroundColor: codeAlpha(theme.text, 0.06) }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.copyText, { color: theme.text }]}>⛶ 全屏</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setWrap(!wrap)}
              style={[styles.copyButton, { backgroundColor: wrap ? codeAlpha(theme.text, 0.15) : codeAlpha(theme.text, 0.06) }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.copyText, { color: theme.text }]}>
                {wrap ? '☰ 取消换行' : '☰ 自动换行'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleCopy(content)}
              style={[styles.copyButton, { backgroundColor: codeAlpha(theme.text, 0.06) }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.copyText, { color: theme.text }]}>
                {copied ? '✅' : '📋'} {copied ? '已复制' : '复制'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {wrap ? (
          <View style={styles.codeArea}>
            {renderLines(lines, true)}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.codeArea}>
              {renderLines(lines, false)}
            </View>
          </ScrollView>
        )}
        {hasFull && (
          <TouchableOpacity
            onPress={() => setFullscreen(true)}
            style={[styles.truncatedBar, { backgroundColor: codeAlpha(theme.text, 0.04) }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.truncatedText, { color: theme.textTertiary }]}>
              … 还有 {(normalizedFull!.split('\n').length - normalized.split('\n').length)} 行 · 点击展开
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {!noFullscreen && (
        <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.codeBg }]}>
            <View style={[styles.header, { backgroundColor: theme.codeHeader }]}>
              <Text style={[styles.lang, { color: theme.textTertiary }]}>{language || 'code'}</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => setFullscreenWrap(!fullscreenWrap)}
                  style={[styles.copyButton, { backgroundColor: fullscreenWrap ? codeAlpha(theme.text, 0.15) : codeAlpha(theme.text, 0.06) }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.copyText, { color: theme.text }]}>
                    {fullscreenWrap ? '☰ 取消换行' : '☰ 自动换行'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleCopy(fullContent || content)}
                  style={[styles.copyButton, { backgroundColor: codeAlpha(theme.text, 0.06) }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.copyText, { color: theme.text }]}>
                    {copied ? '✅' : '📋'} {copied ? '已复制' : '复制'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFullscreen(false)}
                  style={[styles.copyButton, { backgroundColor: codeAlpha(theme.text, 0.06) }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.copyText, { color: theme.text }]}>✕ 关闭</Text>
                </TouchableOpacity>
              </View>
            </View>
            {fullscreenWrap ? (
              <ScrollView style={styles.modalScroll}>
                <View style={styles.codeArea}>
                  {renderLines(fullscreenLines || lines, true)}
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={styles.modalScroll}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.codeArea}>
                    {renderLines(fullscreenLines || lines, false)}
                  </View>
                </ScrollView>
              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 10, marginVertical: 6, overflow: 'hidden' },
  containerNoBorder: { borderRadius: 0, marginVertical: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lang: { fontSize: 11, fontWeight: '600', flex: 1, textTransform: 'lowercase' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'nowrap' },
  copyButton: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  copyText: { fontSize: 11 },
  codeArea: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  truncatedBar: {
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  truncatedText: {
    fontSize: 11,
    fontWeight: '600',
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
  modalContainer: {
    flex: 1,
  },
  modalScroll: {
    flex: 1,
  },
})
