import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import ThinkingAccordion from './ThinkingAccordion'
import ContentRenderer from './ContentRenderer'
import ToolCallCapsule from './ToolCallCapsule'
import type { Theme } from '../theme'
import type { Message } from '../types'
import { isAssistant } from '../types'

interface Props {
  message: Message
  theme: Theme
}

export default function MessageBubble({ message, theme }: Props) {
  if (message.role === 'user') {
    return (
      <View style={styles.userContainer}>
        <View style={[styles.userBubble, { backgroundColor: theme.userBubble }]}>
          <Text style={[styles.userText, { color: theme.userBubbleText }]}>{message.text}</Text>
        </View>
      </View>
    )
  }

  const { reasoning, content, toolCalls } = message

  return (
    <View style={styles.assistantContainer}>
      <View style={[styles.assistantBubble, { backgroundColor: theme.aiBubble, borderColor: theme.aiBubbleBorder }]}>
        {/* Field 1: Reasoning */}
        {(reasoning.isActive || !!reasoning.text) && (
          <ThinkingAccordion text={reasoning.text} theme={theme} isThinking={reasoning.isActive} />
        )}

        {/* Field 3: Tool Calls */}
        {toolCalls.map((tc) => (
          <ToolCallCapsule
            key={tc.id}
            name={tc.name}
            status={tc.status}
            input={tc.input}
            output={tc.output}
            theme={theme}
          />
        ))}

        {/* Field 2: Content */}
        {!!content && <ContentRenderer content={content} theme={theme} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  userContainer: { marginVertical: 6, flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: { maxWidth: '80%', borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 10 },
  userText: { fontSize: 15, lineHeight: 22 },
  assistantContainer: { marginVertical: 6, flexDirection: 'row', justifyContent: 'flex-start' },
  assistantBubble: { flex: 1, borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
})