import React, { useState } from 'react'
import { useWindowDimensions, TextStyle, ViewStyle, Modal, SafeAreaView, TouchableOpacity, ScrollView, View, StyleSheet, Text } from 'react-native'
import { Feather } from '@expo/vector-icons'
import Markdown from 'react-native-markdown-display'

interface Props {
  text: string
  theme: any
  isUser: boolean
}

export default function TextPart({ text, theme, isUser }: Props) {
  if (!text) return null
  const { width } = useWindowDimensions()
  const [fullscreen, setFullscreen] = useState(false)

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
        <Markdown style={style}>{text}</Markdown>
      </TouchableOpacity>
      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>内容</Text>
            <TouchableOpacity onPress={() => setFullscreen(false)} style={styles.modalClose}>
              <Feather name="x" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Markdown style={fullscreenStyle}>{text}</Markdown>
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