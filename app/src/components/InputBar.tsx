import React, { useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { ModelKey, Agent } from '../types'

interface Props {
  input: string
  onChangeText: (text: string) => void
  onSend: () => void
  onStop?: () => void
  sending: boolean
  disabled?: boolean
  theme: Theme
  inputRef: React.RefObject<TextInput | null>
  isKeyboardOpen: boolean
  currentModel: ModelKey | null
  onPressModelSelector: () => void
  currentAgent?: Agent
  onPressAgentSelector?: () => void
}

export default function InputBar({ input, onChangeText, onSend, onStop, sending, disabled, theme, inputRef, isKeyboardOpen, currentModel, onPressModelSelector, currentAgent, onPressAgentSelector }: Props) {
  const bottomPad = Platform.OS === 'ios' ? (isKeyboardOpen ? 8 : 22) : 12

  const modelLabel = currentModel
    ? currentModel.modelID.length > 12
      ? currentModel.modelID.slice(0, 10) + '…'
      : currentModel.modelID
    : 'model'

  const agentName = currentAgent
    ? currentAgent.name.charAt(0).toUpperCase() + currentAgent.name.slice(1)
    : 'Build'

  const agentColor = currentAgent?.color || '#999'

  return (
    <View style={[styles.inputBar, { backgroundColor: theme.background, paddingBottom: bottomPad }]}>
      <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {onPressAgentSelector && (
          <TouchableOpacity
            style={styles.agentButton}
            onPress={onPressAgentSelector}
            activeOpacity={0.6}
          >
            <View style={[styles.agentDot, { backgroundColor: agentColor }]} />
            <Text style={[styles.agentLabel, { color: theme.textSecondary }]} numberOfLines={1}>
              {agentName}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.modelButton}
          onPress={onPressModelSelector}
          activeOpacity={0.6}
        >
          <Feather name="cpu" size={14} color={theme.textSecondary} />
          <Text style={[styles.modelLabel, { color: theme.textTertiary }]} numberOfLines={1}>
            {modelLabel}
          </Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text, ...(disabled ? { opacity: 0.4 } : {}) }]}
          value={input}
          onChangeText={onChangeText}
          placeholder={disabled ? 'Waiting for permission...' : '发送消息...'}
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={4000}
          editable={!disabled}
        />
        {sending ? (
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.error }]}
            onPress={onStop}
            activeOpacity={0.8}
          >
            <Feather name="square" size={16} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: input.trim() ? theme.accent : theme.surfaceSecondary }]}
            onPress={onSend}
            disabled={!input.trim() || disabled}
            activeOpacity={0.8}
          >
            <Feather name="arrow-up" size={18} color={input.trim() ? '#fff' : theme.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  inputBar: { paddingHorizontal: 12, paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingLeft: 8, paddingRight: 6, paddingVertical: 6 },
  agentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 2,
    gap: 5,
  },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  agentLabel: { fontSize: 12, fontWeight: '700', maxWidth: 56 },
  modelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 4,
    gap: 4,
  },
  modelLabel: { fontSize: 11, fontWeight: '600', maxWidth: 72 },
  input: { flex: 1, fontSize: 15, lineHeight: 22, maxHeight: 100, paddingVertical: 4 },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sendButtonDisabled: { opacity: 0.5 },
})
