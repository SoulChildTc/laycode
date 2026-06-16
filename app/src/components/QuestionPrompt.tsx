import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, Animated, Modal, Platform, ScrollView, Keyboard,
  KeyboardAvoidingView,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { QuestionRequest, QuestionInfo } from '../types'

const CUSTOM_KEY = '__custom__'

interface Props {
  request: QuestionRequest
  theme: Theme
  onReply: (answers: string[][]) => void
  onReject: () => void
}

export default function QuestionPrompt({ request, theme, onReply, onReject }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selections, setSelections] = useState<string[][]>(() => request.questions.map(() => []))
  const [customInputs, setCustomInputs] = useState<string[]>(() => request.questions.map(() => ''))
  const slideAnim = useRef(new Animated.Value(0)).current
  const customInputRef = useRef<TextInput>(null)
  const scrollRef = useRef<ScrollView>(null)

  const question = request.questions[currentIdx]
  const isLast = currentIdx === request.questions.length - 1
  const currentAnswers = selections[currentIdx] || []
  const currentCustom = customInputs[currentIdx] || ''
  const showCustom = question.custom !== false
  const isCustomSelected = currentAnswers.includes(CUSTOM_KEY)

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 16,
      stiffness: 160,
    }).start()
  }, [currentIdx])

  useEffect(() => {
    if (isCustomSelected) {
      customInputRef.current?.focus()
    }
  }, [isCustomSelected])

  const toggleOption = (label: string) => {
    if (label === CUSTOM_KEY) {
      if (question.multiple) {
        setSelections((prev) => {
          const next = [...prev]
          const cur = [...(next[currentIdx] || [])]
          const idx = cur.indexOf(CUSTOM_KEY)
          if (idx >= 0) cur.splice(idx, 1)
          else cur.push(CUSTOM_KEY)
          next[currentIdx] = cur
          return next
        })
      } else {
        setSelections((prev) => {
          const next = [...prev]
          next[currentIdx] = [CUSTOM_KEY]
          return next
        })
      }
      return
    }
    setSelections((prev) => {
      const next = [...prev]
      const cur = [...(next[currentIdx] || [])]
      if (question.multiple) {
        const idx = cur.indexOf(label)
        if (idx >= 0) cur.splice(idx, 1)
        else cur.push(label)
      } else {
        next[currentIdx] = [label]
        return next
      }
      next[currentIdx] = cur
      return next
    })
  }

  const canProceed = currentAnswers.length > 0 || (showCustom && currentCustom.trim().length > 0)

  const handleNext = () => {
    if (!canProceed) return
    if (isLast) {
      const finalAnswers = selections.map((s, i) => {
        if (s.includes(CUSTOM_KEY)) {
          return [customInputs[i]?.trim() || '']
        }
        return s
      })
      onReply(finalAnswers)
    } else {
      if (isCustomSelected && currentCustom.trim()) {
        setCustomInputs((prev) => {
          const next = [...prev]
          next[currentIdx] = currentCustom.trim()
          return next
        })
      }
      setCurrentIdx((p) => p + 1)
    }
  }

  const slideIn = {
    transform: [{
      translateY: slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [60, 0],
      }),
    }],
  }

  const dismissKeyboard = () => Keyboard.dismiss()

  return (
    <Modal visible transparent animationType="none" onRequestClose={onReject}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={dismissKeyboard}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }, slideIn]}>
          <View style={styles.sheetHeader}>
            <View style={[styles.iconCircle, { backgroundColor: theme.accent + '20' }]}>
              <Feather name="help-circle" size={18} color={theme.accent} />
            </View>
            <View style={styles.sheetHeaderText}>
              <Text style={[styles.stepLabel, { color: theme.textTertiary }]}>
                Question {currentIdx + 1} of {request.questions.length}
              </Text>
              <Text style={[styles.questionHeader, { color: theme.text }]}>
                {question.header}
              </Text>
            </View>
          </View>

          <Text style={[styles.questionText, { color: theme.textSecondary }]}>
            {question.question}
          </Text>

          <ScrollView
            ref={scrollRef}
            style={styles.optionsScroll}
            contentContainerStyle={styles.optionsContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (isCustomSelected) {
                scrollRef.current?.scrollTo({ y: 9999, animated: true })
              }
            }}
          >
            {question.options.map((opt, i) => {
              const selected = currentAnswers.includes(opt.label)
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.optionRow,
                    {
                      backgroundColor: selected ? theme.accent + '15' : theme.codeBg,
                      borderColor: selected ? theme.accent : theme.borderLight,
                    },
                  ]}
                  onPress={() => toggleOption(opt.label)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.textTertiary }]}>
                    {selected && (
                      <View style={[styles.radioFill, { backgroundColor: theme.accent }]} />
                    )}
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionLabel, { color: theme.text }]}>{opt.label}</Text>
                    {opt.description ? (
                      <Text style={[styles.optionDesc, { color: theme.textTertiary }]}>{opt.description}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )
            })}

            {showCustom && (
              <TouchableOpacity
                style={[
                  styles.optionRow,
                  {
                    backgroundColor: isCustomSelected ? theme.accent + '15' : theme.codeBg,
                    borderColor: isCustomSelected ? theme.accent : theme.borderLight,
                  },
                ]}
                onPress={() => toggleOption(CUSTOM_KEY)}
                activeOpacity={0.7}
              >
                <View style={[styles.customRadio, { borderColor: isCustomSelected ? theme.accent : theme.textTertiary }]}>
                  <Feather name="edit-3" size={14} color={isCustomSelected ? theme.accent : theme.textTertiary} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionLabel, { color: theme.text }]}>自定义回答</Text>
                  <Text style={[styles.optionDesc, { color: theme.textTertiary }]}>输入你想告诉 AI 的内容</Text>
                </View>
              </TouchableOpacity>
            )}

            {isCustomSelected && (
              <View style={[styles.customInputWrap, { backgroundColor: theme.codeBg, borderColor: theme.borderLight }]}>
                <TextInput
                  ref={customInputRef}
                  style={[styles.customInput, { color: theme.text }]}
                  value={currentCustom}
                  onChangeText={(t) => {
                    setCustomInputs((prev) => {
                      const next = [...prev]
                      next[currentIdx] = t
                      return next
                    })
                  }}
                  placeholder="Type your answer..."
                  placeholderTextColor={theme.textTertiary}
                  multiline
                />
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                onPress={onReject}
                activeOpacity={0.7}
              >
                <Feather name="x" size={14} color={theme.textSecondary} />
                <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  { backgroundColor: canProceed ? theme.accent : theme.surfaceSecondary, opacity: canProceed ? 1 : 0.5 },
                ]}
                onPress={handleNext}
                disabled={!canProceed}
                activeOpacity={0.7}
              >
                <Feather name="check" size={14} color="#fff" />
                <Text style={[styles.actionBtnText, styles.actionBtnPrimaryText]}>
                  {isLast ? 'Submit' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  overlayTouchable: { flex: 1 },
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
  sheetHeaderText: { flex: 1 },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  questionHeader: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  optionsScroll: { maxHeight: 260 },
  optionsContent: { gap: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  customRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionDesc: { fontSize: 12, lineHeight: 16 },
  customInputWrap: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 4,
  },
  customInput: {
    padding: 10,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 50,
    maxHeight: 100,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
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
  actionBtnPrimary: { borderWidth: 0 },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
  actionBtnPrimaryText: { color: '#fff' },
})