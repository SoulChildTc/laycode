import React, { useState, useMemo, useCallback } from 'react'
import { useWindowDimensions, TextStyle, ViewStyle, Modal, SafeAreaView, TouchableOpacity, ScrollView, View, StyleSheet, Text } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import Markdown from 'react-native-markdown-display'

const TABLE_LIKE = /^\|.+\|\s*$/m

function splitContent(text: string): string[] {
  const lines = text.split('\n')
  const segments: string[] = []
  let buf: string[] = []
  let inTable = false

  for (const line of lines) {
    const isTableLine = TABLE_LIKE.test(line)
    if (isTableLine && !inTable) {
      if (buf.length) segments.push(buf.join('\n'))
      buf = [line]
      inTable = true
    } else if (!isTableLine && inTable) {
      if (buf.length) segments.push(buf.join('\n'))
      buf = [line]
      inTable = false
    } else {
      buf.push(line)
    }
  }
  if (buf.length) segments.push(buf.join('\n'))
  return segments
}

const BODY_TEXT: any = (node: any, children: any, parent: any, styles: any) => (
  <Text key={node.key} style={styles.body} selectable>
    {children}
  </Text>
)

const SELECTABLE_RULES: Record<string, any> = {
  body: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.body}>
      {children}
    </View>
  ),
  paragraph: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.paragraph} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  text: (node: any, children: any, parent: any, styles: any, inheritedStyles: any = {}) => (
    <Text key={node.key} style={[inheritedStyles, styles.text]} selectable>
      {node.content}
    </Text>
  ),
  textgroup: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.textgroup} selectable>
      {children}
    </Text>
  ),
  code_inline: (node: any, children: any, parent: any, styles: any, inheritedStyles: any = {}) => (
    <Text key={node.key} style={[inheritedStyles, styles.code_inline]}>
      {node.content}
    </Text>
  ),
  heading1: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.heading1} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  heading2: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.heading2} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  heading3: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.heading3} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  heading4: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.heading4} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  heading5: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.heading5} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  heading6: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.heading6} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  list_item: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.list_item} selectable>
      {children}
      {'\n'}
    </Text>
  ),
  link: (node: any, children: any, parent: any, styles: any, inheritedStyles: any = {}) => (
    <Text key={node.key} style={[inheritedStyles, styles.link]}>
      {children}
    </Text>
  ),
  blockquote: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.blockquote}>
      {children}
    </Text>
  ),
  bullet_list: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.bullet_list}>
      {children}
    </Text>
  ),
  ordered_list: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.ordered_list}>
      {children}
    </Text>
  ),
  hr: (node: any, children: any, parent: any, styles: any) => (
    <Text key={node.key} style={styles.hr}>
      {'\n———————————\n'}
    </Text>
  ),
  table: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.table}>
      {children}
    </View>
  ),
  thead: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.thead}>
      {children}
    </View>
  ),
  tbody: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.tbody}>
      {children}
    </View>
  ),
  tr: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.tr}>
      {children}
    </View>
  ),
  th: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.th}>
      {children}
    </View>
  ),
  td: (node: any, children: any, parent: any, styles: any) => (
    <View key={node.key} style={styles.td}>
      {children}
    </View>
  ),
}


interface Props {
  text: string
  theme: any
  isUser: boolean
}

export default function TextPart({ text, theme, isUser }: Props) {
  if (!text) return null
  const { width } = useWindowDimensions()
  const [fullscreen, setFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const segments = useMemo(() => splitContent(text), [text])

  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  const style: Record<string, TextStyle | ViewStyle> = {
    body: { color: isUser ? '#fff' : theme.text, fontSize: 15, lineHeight: 26 },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.15)' : theme.surfaceSecondary + '70',
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
    th: { padding: 8, fontWeight: '600' as const, borderRightWidth: 1, borderColor: theme.border, color: theme.text, flex: 1 },
    td: { padding: 8, borderRightWidth: 1, borderColor: theme.border, color: theme.text, flex: 1 },
    tr: { flexDirection: 'row' as const, borderBottomWidth: 1, borderColor: theme.border },
    paragraph: { marginVertical: 4 },
    strong: { fontWeight: '600' as const },
    em: { fontStyle: 'italic' as const },
  }

  const fullscreenStyle: Record<string, TextStyle | ViewStyle> = {
    ...style,
    body: { ...style.body as TextStyle, fontSize: 16, lineHeight: 26 },
    heading1: { ...style.heading1 as TextStyle, fontSize: 22 },
    heading2: { ...style.heading2 as TextStyle, fontSize: 20 },
    heading3: { ...style.heading3 as TextStyle, fontSize: 18 },
  }

  return (
    <>
      <TouchableOpacity onLongPress={() => setFullscreen(true)} activeOpacity={0.9}>
        <View>
          {segments.map((seg, i) => {
            const hasTable = TABLE_LIKE.test(seg)
            return (
              <Markdown
                key={i}
                style={style}
                rules={hasTable ? SELECTABLE_RULES : { ...SELECTABLE_RULES, body: BODY_TEXT }}
              >
                {seg}
              </Markdown>
            )
          })}
        </View>
      </TouchableOpacity>
      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>内容</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={handleCopy} style={styles.modalClose}>
                <Feather name={copied ? 'check' : 'copy'} size={20} color={copied ? '#34C759' : theme.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFullscreen(false)} style={styles.modalClose}>
                <Feather name="x" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {segments.map((seg, i) => {
              const hasTable = TABLE_LIKE.test(seg)
              return (
                <Markdown
                  key={i}
                  style={fullscreenStyle}
                  rules={hasTable ? SELECTABLE_RULES : { ...SELECTABLE_RULES, body: BODY_TEXT }}
                >
                  {seg}
                </Markdown>
              )
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: '600' },
  modalClose: { padding: 4 },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16 },
})