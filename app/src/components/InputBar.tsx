import React, { useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Keyboard, Modal, InteractionManager } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { ModelKey, Agent, FileAttachment } from '../types'

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
  attachments: FileAttachment[]
  onPickCamera: () => void
  onPickLibrary: () => void
  onPickFile: () => void
  onRemoveAttachment: (id: string) => void
}

export default function InputBar({
  input, onChangeText, onSend, onStop, sending, disabled, theme,
  inputRef, isKeyboardOpen, currentModel, onPressModelSelector,
  currentAgent, onPressAgentSelector, contextTokens, contextLimit,
  attachments, onPickCamera, onPickLibrary, onPickFile, onRemoveAttachment,
}: Props) {
  const bottomPad = Platform.OS === 'ios' ? (isKeyboardOpen ? 8 : 22) : 12
  const [showActionSheet, setShowActionSheet] = useState(false)
  const canSend = input.trim().length > 0 || attachments.length > 0
  const runAfterSheetClose = (fn: () => void) => {
    setShowActionSheet(false)
    InteractionManager.runAfterInteractions(() => {
      setTimeout(fn, Platform.OS === 'ios' ? 250 : 0)
    })
  }

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
    <>
      {attachments.length > 0 && (
        <View style={[styles.attachPreview, { backgroundColor: theme.surface, borderTopColor: theme.border, borderLeftColor: theme.border, borderRightColor: theme.border }]}>
          {attachments.map((a) => (
            <View key={a.id} style={[styles.attachChip, { backgroundColor: theme.background, borderColor: theme.border }]}>
              {a.mime.startsWith('image/') ? (
                <View style={[styles.attachThumb, { backgroundColor: theme.surfaceSecondary }]}>
                  <Feather name="image" size={14} color={theme.accent} />
                </View>
              ) : (
                <Feather name="file" size={14} color={theme.textSecondary} />
              )}
              <Text style={[styles.attachName, { color: theme.text }]} numberOfLines={1}>{a.filename}</Text>
              <TouchableOpacity onPress={() => onRemoveAttachment(a.id)} hitSlop={8}>
                <Feather name="x" size={14} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
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
              <View style={[styles.toolbarChip, styles.toolbarChipFixed, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Feather name="database" size={13} color={color} />
                <Text style={[styles.toolbarLabel, { color }]} numberOfLines={1}>
                  {formatTokens(contextTokens)}{contextLimit ? ` / ${formatTokens(contextLimit)} · ${Math.round((pct ?? 0) * 100)}%` : ''}
                </Text>
              </View>
            )
          })()}
          <View style={{ flex: 1 }} />
        </View>
        <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity onPress={() => setShowActionSheet(true)} style={styles.attachBtn} hitSlop={6}>
            <Feather name="paperclip" size={18} color={theme.textSecondary} />
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
          {isKeyboardOpen && (
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              style={[styles.dismissBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
              hitSlop={8}
            >
              <Feather name="chevron-down" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
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
              style={[styles.sendButton, { backgroundColor: canSend ? theme.accent : theme.surfaceSecondary }]}
              onPress={onSend}
              disabled={!canSend || disabled}
              activeOpacity={0.8}
            >
              <Feather name="arrow-up" size={18} color={canSend ? '#fff' : theme.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal visible={showActionSheet} transparent animationType="none" onRequestClose={() => setShowActionSheet(false)}>
        <View style={styles.asOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowActionSheet(false)} />
          <View style={[styles.asSheet, { backgroundColor: theme.surface }]}>
            <TouchableOpacity style={styles.asRow} onPress={() => runAfterSheetClose(onPickCamera)}>
              <Feather name="camera" size={20} color={theme.text} />
              <Text style={[styles.asText, { color: theme.text }]}>拍照</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.asRow} onPress={() => runAfterSheetClose(onPickLibrary)}>
              <Feather name="image" size={20} color={theme.text} />
              <Text style={[styles.asText, { color: theme.text }]}>从相册选</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.asRow} onPress={() => runAfterSheetClose(onPickFile)}>
              <Feather name="folder" size={20} color={theme.text} />
              <Text style={[styles.asText, { color: theme.text }]}>从文件选</Text>
            </TouchableOpacity>
            <View style={[styles.asDivider, { backgroundColor: theme.border }]} />
            <TouchableOpacity style={styles.asRow} onPress={() => setShowActionSheet(false)}>
              <Text style={[styles.asText, { color: theme.textTertiary }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  attachPreview: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1,
    marginHorizontal: 12,
  },
  attachChip: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  attachThumb: {
    width: 20, height: 20, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  attachName: { fontSize: 12, maxWidth: 120 },
  inputBar: { paddingHorizontal: 12, paddingVertical: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 2 },
  toolbarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  // token 用量信息密度高（带百分比），不参与收缩，保证完整显示。
  toolbarChipFixed: { flexShrink: 0 },
  toolbarLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingLeft: 4, paddingRight: 4, paddingVertical: 6, gap: 4 },
  input: { flex: 1, fontSize: 15, lineHeight: 22, maxHeight: 100, paddingVertical: 4 },
  attachBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dismissBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  asOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  asSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8, gap: 2 },
  asRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  asText: { fontSize: 16 },
  asDivider: { height: 1, marginVertical: 4, marginHorizontal: 20 },
})