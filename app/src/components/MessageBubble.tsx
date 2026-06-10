import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import PartRenderer from './PartRenderer'

interface Props {
  message: {
    id: string
    role: 'user' | 'assistant'
    parts?: any[]
    content?: string
  }
  theme: any
}

export default function MessageBubble({ message, theme }: Props) {
  const isUser = message.role === 'user'
  const parts = message.parts || (message.content ? [{ type: 'text', text: message.content }] : [])

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, { backgroundColor: isUser ? theme.accent : theme.surface, borderColor: theme.border }]}>
        <PartRenderer parts={parts} theme={theme} isUser={isUser} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginVertical: 4, flexDirection: 'row' },
  userContainer: { justifyContent: 'flex-end' },
  assistantContainer: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },
})