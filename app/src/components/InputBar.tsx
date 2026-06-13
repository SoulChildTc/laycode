import React, { useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { ModelKey, Agent } from '../types'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

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
  contextTokens?: number
  contextLimit?: number
}

export default function InputBar({ input, onChangeText, onSend, onStop, sending, disabled, theme, inputRef, isKeyboardOpen, currentModel, onPressModelSelector, currentAgent, onPressAgentSelector, contextTokens, contextLimit }: Props) {
  const bottomPad = Platform.OS === 'ios' ? (isKeyboardOpen ? 8 : 22) : 12

  const modelLabel = currentModel
    ? currentModel.modelID.length > 20
      ? currentModel.modelID.slice(0, 18) + '…'
      : currentModel.modelID
    : 'model'

  const agentName = currentAgent
    ? currentAgent.name.charAt(0).toUpperCase() + currentAgent.name.slice(1)
    : 'Build'

  const agentColor = currentAgent?.color || '#999'

  return (
    <View style={[styles.inputBar, { backgroundColor: theme.background, paddingBottom: bottomPad }]}>
      <View style={styles.toolbar}>
        {onPressAgentSelector && (
          <TouchableOpacity
            style={[styles.toolbarChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={onPressAgentSelector}
            activeOpacity={0.6}
          >
            <View style={[styles.agentDot, { backgroundColor: agentColor }]} />
            <Text style={[styles.toolbarLabel, { color: theme.textSecondary }]} numberOfLines={1}>
              {agentName}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.toolbarChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={onPressModelSelector}
          activeOpacity={0.6}
        >
          <Feather name="cpu" size={13} color={theme.accent} />
          <Text style={[styles.toolbarLabel, { color: theme.textSecondary }]} numberOfLines={1}>
            {modelLabel}
          </Text>
        </TouchableOpacity>
        {(contextTokens != null && contextTokens > 0) && (() => {
          const pct = contextLimit ? contextTokens / contextLimit : undefined
          const color = pct != null ? (pct >= 0.8 ? theme.error : pct >= 0.5 ? theme.warning : theme.success) : theme.textTertiary
          return (
            <View style={[styles.toolbarChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Feather name="database" size={13} color={color} />
              <Text style={[styles.toolbarLabel, { color }]} numberOfLines={1}>
                {formatTokens(contextTokens)}{contextLimit ? ` / ${formatTokens(contextLimit)} · ${Math.round((pct ?? 0) * 100)}%` : ''}
              </Text>
            </View>
          )
        })()}
      </View>
      <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 2 },
  toolbarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  toolbarLabel: { fontSize: 12, fontWeight: '600', maxWidth: 200 },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingLeft: 14, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, lineHeight: 22, maxHeight: 100, paddingVertical: 4 },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
})
