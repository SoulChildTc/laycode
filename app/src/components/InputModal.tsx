import React, { useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface InputModalProps {
  visible: boolean
  title: string
  theme: Theme
  onCancel: () => void
  onSave: () => void
  saveDisabled?: boolean
  saveLabel?: string
  cancelLabel?: string
  children: React.ReactNode
}

export function InputModal({
  visible,
  title,
  theme,
  onCancel,
  onSave,
  saveDisabled = false,
  saveLabel = '保存',
  cancelLabel = '取消',
  children,
}: InputModalProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.screen, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[s.header, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={onCancel} hitSlop={10} style={s.headerBtn}>
              <Feather name="x" size={22} color={theme.textSecondary} />
              <Text style={[s.headerBtnText, { color: theme.textSecondary }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity
              onPress={onSave}
              hitSlop={10}
              style={s.headerBtn}
              disabled={saveDisabled}
            >
              <Text style={[s.headerBtnText, { color: saveDisabled ? theme.textTertiary : theme.accent, fontWeight: '700' }]}>
                {saveLabel}
              </Text>
              <Feather name="check" size={22} color={saveDisabled ? theme.textTertiary : theme.accent} />
            </TouchableOpacity>
          </View>
          <View style={[s.body, { backgroundColor: theme.background }]}>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

interface InputFieldProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  theme: Theme
  multiline?: boolean
  autoFocus?: boolean
  onSubmitEditing?: () => void
  returnKeyType?: string
}

export function InputField({
  value,
  onChangeText,
  placeholder,
  theme,
  multiline = false,
  autoFocus = true,
  onSubmitEditing,
  returnKeyType = 'done',
}: InputFieldProps) {
  const ref = useRef<TextInput>(null)

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => ref.current?.focus(), 200)
      return () => clearTimeout(timer)
    }
  }, [autoFocus])

  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textTertiary}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : undefined}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType as any}
      style={[
        s.input,
        { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
        multiline && s.inputMultiline,
      ]}
    />
  )
}

interface MetaRowProps {
  icon: string
  text: string
  theme: Theme
}

export function MetaRow({ icon, text, theme }: MetaRowProps) {
  return (
    <View style={s.meta}>
      <Feather name={icon as any} size={13} color={theme.textTertiary} />
      <Text style={[s.metaText, { color: theme.textTertiary }]}>{text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBtnText: {
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    fontSize: 16,
    lineHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    margin: 16,
  },
  inputMultiline: {
    flex: 1,
    textAlignVertical: 'top',
    minHeight: 160,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  metaText: {
    fontSize: 13,
    flex: 1,
  },
})
