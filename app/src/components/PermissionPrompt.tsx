import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Animated, Modal, Platform, ScrollView, Keyboard,
  KeyboardAvoidingView,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { PermissionRequest, PermissionReply } from '../types'

interface Props {
  request: PermissionRequest
  theme: Theme
  onReply: (reply: PermissionReply, message?: string) => void
  // 稍后处理：仅关闭弹层，不回复（审批保留 pending），让用户能返回其它会话/首页。
  onDismiss: () => void
}

type Stage = 'prompt' | 'always' | 'reject'

function getIcon(permission: string): string {
  switch (permission) {
    case 'edit': return 'edit-3'
    case 'read': return 'file-text'
    case 'bash': return 'terminal'
    case 'glob': case 'grep': return 'search'
    case 'list': return 'folder'
    case 'webfetch': return 'globe'
    case 'websearch': return 'compass'
    case 'task': return 'layers'
    case 'external_directory': return 'external-link'
    case 'doom_loop': return 'repeat'
    default: return 'tool'
  }
}

function getTitle(permission: string, metadata: Record<string, any>): string {
  switch (permission) {
    case 'edit': return `Edit ${metadata.path || 'file'}`
    case 'read': return `Read ${metadata.path || 'file'}`
    case 'bash': return metadata.description || 'Shell command'
    case 'glob': return `Glob "${metadata.pattern || metadata.query || ''}"`
    case 'grep': return `Grep "${metadata.pattern || metadata.query || ''}"`
    case 'list': return `List ${metadata.directory || metadata.path || ''}`
    case 'webfetch': return `WebFetch ${metadata.url || ''}`
    case 'websearch': return `${metadata.provider || 'Search'} "${metadata.query || ''}"`
    case 'task': return `${metadata.type || 'Sub'} Task`
    case 'external_directory': return metadata.description || `Access external directory ${metadata.directory || ''}`
    case 'doom_loop': return 'Continue after repeated failures'
    default: return `Call tool ${permission}`
  }
}

function getBody(permission: string, metadata: Record<string, any>, patterns: string[]): { heading: string; content: string } {
  const patternsFallback = patterns.length > 0 ? patterns.join(', ') : ''
  switch (permission) {
    case 'edit':
      return { heading: 'Changes to apply:', content: metadata.content || metadata.diff || patternsFallback || '' }
    case 'read':
      return { heading: 'Path:', content: metadata.path || patternsFallback || '' }
    case 'bash':
      return { heading: 'Command:', content: `$ ${metadata.command || patternsFallback || ''}` }
    case 'glob':
      return { heading: 'Pattern:', content: metadata.pattern || patternsFallback || '' }
    case 'grep':
      return { heading: 'Pattern:', content: metadata.pattern || patternsFallback || '' }
    case 'list':
      return { heading: 'Directory:', content: metadata.directory || metadata.path || patternsFallback || '' }
    case 'webfetch':
      return { heading: 'URL:', content: metadata.url || patternsFallback || '' }
    case 'websearch':
      return { heading: 'Query:', content: metadata.query || patternsFallback || '' }
    case 'task':
      return { heading: 'Description:', content: metadata.description || patternsFallback || '' }
    case 'external_directory':
      // 真实 metadata 是 { filepath, parentDir }。显示本次要访问的具体文件（比只显示目录更能暴露风险）。
      return { heading: '访问文件：', content: metadata.filepath || metadata.parentDir || patternsFallback || '' }
    case 'doom_loop':
      return { heading: '', content: 'Let the model try again after repeated failures.' }
    default:
      return { heading: '', content: permission }
  }
}

export default function PermissionPrompt({ request, theme, onReply, onDismiss }: Props) {
  const [stage, setStage] = useState<Stage>('prompt')
  const [rejectMessage, setRejectMessage] = useState('')
  const slideAnim = useRef(new Animated.Value(0)).current
  const rejectInputRef = useRef<TextInput>(null)
  const icon = getIcon(request.permission)
  const title = getTitle(request.permission, request.metadata)
  const body = getBody(request.permission, request.metadata, request.patterns)
  // 「总是允许」实际放行的范围（always 通配模式）。仅当它和本次详情不同才提示——避免冗余。
  const alwaysScope = (request.always && request.always.length > 0) ? request.always.join(', ') : ''
  const showScope = !!alwaysScope && !body.content.includes(alwaysScope)

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 16,
      stiffness: 160,
    }).start()
  }, [])

  useEffect(() => {
    if (stage === 'reject') {
      setTimeout(() => rejectInputRef.current?.focus(), 400)
    }
  }, [stage])

  const dismissKeyboard = () => Keyboard.dismiss()
  // 点遮罩：prompt 阶段 = 稍后处理（关弹层，不回复）；always/reject 阶段 = 仅收键盘，避免误关。
  const handleOverlayPress = () => {
    if (stage === 'prompt') onDismiss()
    else Keyboard.dismiss()
  }

  const handleAllowOnce = () => onReply('once')
  const handleAllowAlways = () => setStage('always')
  const handleReject = () => {
    setRejectMessage('')
    setStage('reject')
  }

  const handleAlwaysConfirm = () => onReply('always')
  const handleAlwaysCancel = () => setStage('prompt')

  const handleRejectConfirm = () => {
    onReply('reject', rejectMessage.trim() || undefined)
  }
  const handleRejectCancel = () => {
    dismissKeyboard()
    setStage('prompt')
  }

  const slideIn = { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }] }

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => stage === 'prompt' ? onDismiss() : setStage('prompt')}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={handleOverlayPress}>
            <View style={styles.overlayTouchable} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }, slideIn]}>
          {stage === 'prompt' && (
            <>
              <View style={styles.sheetHeader}>
                <View style={[styles.iconCircle, { backgroundColor: theme.warning + '20' }]}>
                  <Feather name={icon as any} size={18} color={theme.warning} />
                </View>
                <View style={styles.sheetHeaderText}>
                  <Text style={[styles.sheetToolName, { color: theme.textTertiary }]}>{request.permission}</Text>
                  <Text style={[styles.sheetTitle, { color: theme.text }]} numberOfLines={2}>{title}</Text>
                </View>
                <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
                  <Text style={[styles.laterText, { color: theme.textTertiary }]}>稍后处理</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.bodyBox, { backgroundColor: theme.codeBg, borderColor: theme.borderLight }]}>
                <Text style={[styles.bodyHeading, { color: theme.textTertiary }]}>{body.heading}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={[styles.bodyContent, { color: theme.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
                    {body.content}
                  </Text>
                </ScrollView>
              </View>

              {showScope && (
                <Text style={[styles.scopeHint, { color: theme.textTertiary }]}>
                  点「总是允许」将放行 <Text style={{ color: theme.warning, fontWeight: '700' }}>{alwaysScope}</Text>
                </Text>
              )}

              <View style={[styles.buttonRow, styles.promptButtonRow]}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnGrow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={handleReject}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={14} color={theme.error} />
                  <Text style={[styles.actionBtnText, { color: theme.error }]}>拒绝</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnGrow, styles.actionBtnPrimary, { backgroundColor: theme.accent }]}
                  onPress={handleAllowOnce}
                  activeOpacity={0.7}
                >
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={[styles.actionBtnText, styles.actionBtnPrimaryText]}>允许一次</Text>
                </TouchableOpacity>
                {request.always.length > 0 && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnGrow, styles.actionBtnSecondary, { borderColor: theme.border }]}
                    onPress={handleAllowAlways}
                    activeOpacity={0.7}
                  >
                    <Feather name="check-circle" size={14} color={theme.accent} />
                    <Text style={[styles.actionBtnText, { color: theme.accent }]}>总是允许</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {stage === 'always' && (
            <>
              <View style={styles.sheetHeader}>
                <Feather name="alert-triangle" size={18} color={theme.warning} />
                <Text style={[styles.sheetTitle, { color: theme.text }]}>总是允许？</Text>
              </View>
              <Text style={[styles.confirmText, { color: theme.textSecondary }]}>
                之后同类的 {request.permission} 操作将不再询问，直到 OpenCode 重启。
              </Text>
              {request.always.length > 0 && request.always[0] !== '*' && (
                <View style={[styles.patternsBox, { backgroundColor: theme.codeBg, borderColor: theme.borderLight }]}>
                  <Text style={[styles.patternsLabel, { color: theme.textTertiary }]}>适用范围：</Text>
                  {request.always.map((pat, i) => (
                    <Text key={i} style={[styles.patternItem, { color: theme.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
                      {pat}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                  onPress={handleAlwaysCancel}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: theme.warning }]}
                  onPress={handleAlwaysConfirm}
                  activeOpacity={0.7}
                >
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={[styles.actionBtnText, styles.actionBtnPrimaryText]}>确认</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {stage === 'reject' && (
            <>
              <View style={styles.sheetHeader}>
                <Feather name="x-circle" size={18} color={theme.error} />
                <Text style={[styles.sheetTitle, { color: theme.text }]}>拒绝授权</Text>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }}>
                <View style={[styles.rejectInputWrap, { backgroundColor: theme.codeBg, borderColor: theme.borderLight }]}>
                  <TextInput
                    ref={rejectInputRef}
                    style={[styles.rejectInput, { color: theme.text }]}
                    value={rejectMessage}
                    onChangeText={setRejectMessage}
                    placeholder="（可选）告诉它换个做法…"
                    placeholderTextColor={theme.textTertiary}
                    multiline
                    returnKeyType="default"
                  />
                </View>
                <View style={[styles.buttonRow, styles.rejectButtonRow]}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                    onPress={handleRejectCancel}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: theme.error }]}
                    onPress={handleRejectConfirm}
                    activeOpacity={0.7}
                  >
                    <Feather name="x" size={14} color="#fff" />
                    <Text style={[styles.actionBtnText, styles.actionBtnPrimaryText]}>确认拒绝</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </>
          )}
        </Animated.View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlayTouchable: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 14,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetHeaderText: {
    flex: 1,
  },
  laterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetToolName: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  bodyBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  bodyHeading: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  bodyContent: {
    fontSize: 12,
    lineHeight: 18,
  },
  scopeHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  // prompt 页三键铺满整行，与首页卡片按钮一致
  promptButtonRow: {
    justifyContent: 'space-between',
  },
  actionBtnGrow: {
    flex: 1,
    justifyContent: 'center',
  },
  rejectButtonRow: {
    marginTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  actionBtnSecondary: {
    backgroundColor: 'transparent',
  },
  actionBtnPrimary: {
    borderWidth: 0,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnPrimaryText: {
    color: '#fff',
  },
  confirmText: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 2,
  },
  patternsBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  patternsLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  patternItem: {
    fontSize: 12,
  },
  rejectInputWrap: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 4,
  },
  rejectInput: {
    padding: 10,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 60,
    maxHeight: 120,
  },
})