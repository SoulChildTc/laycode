import React, { useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface Props {
  input: string
  onChangeText: (text: string) => void
  onSend: () => void
  sending: boolean
  theme: Theme
  inputRef: React.RefObject<TextInput | null>
  isKeyboardOpen: boolean
}

export default function InputBar({ input, onChangeText, onSend, sending, theme, inputRef, isKeyboardOpen }: Props) {
  const bottomPad = Platform.OS === 'ios' ? (isKeyboardOpen ? 8 : 22) : 12
  return (
    <View style={[styles.inputBar, { backgroundColor: theme.background, paddingBottom: bottomPad }]}>
      <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          value={input}
          onChangeText={onChangeText}
          placeholder="给 AI 发送消息..."
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: input.trim() && !sending ? theme.accent : theme.surfaceSecondary },
            sending && styles.sendButtonDisabled,
          ]}
          onPress={onSend}
          disabled={!input.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <Text style={{ color: theme.textTertiary, fontSize: 18, lineHeight: 20 }}>⋯</Text>
            : <Feather name="arrow-up" size={18} color={input.trim() ? '#fff' : theme.textTertiary} />
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  inputBar: { paddingHorizontal: 12, paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 16, borderWidth: 1, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, lineHeight: 22, maxHeight: 100, paddingVertical: 4 },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sendButtonDisabled: { opacity: 0.5 },
})
