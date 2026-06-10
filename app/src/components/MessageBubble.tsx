import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Theme } from '../theme'
import { Message } from '../types'
import CodeBlock from './CodeBlock'
import DiffView from './DiffView'

interface Props {
  message: Message
  theme: Theme
}

export default function MessageBubble({ message, theme }: Props) {
  const isUser = message.role === 'user'

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: theme.accent, alignSelf: 'flex-end' }
            : { backgroundColor: theme.surface, borderColor: theme.border, alignSelf: 'flex-start' },
          isUser ? {} : { borderWidth: 1 },
        ]}
      >
        <Text style={[styles.text, isUser ? { color: '#fff' } : { color: theme.text }]}>
          {message.content}
        </Text>

        {message.parts?.map((part, i) => {
          switch (part.type) {
            case 'code':
              return <CodeBlock key={i} language={(part as any).language || 'text'} content={(part as any).content} theme={theme} />
            case 'diff':
              return <DiffView key={i} file={(part as any).file} content={(part as any).content} theme={theme} />
            default:
              return null
          }
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginVertical: 4 },
  userContainer: { alignItems: 'flex-end' },
  assistantContainer: { alignItems: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: 12, padding: 12 },
  text: { fontSize: 15, lineHeight: 22 },
})
