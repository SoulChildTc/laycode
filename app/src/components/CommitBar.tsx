import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface Props {
  onPress: () => void
  disabled: boolean
  theme: Theme
}

export default function CommitBar({ onPress, disabled, theme }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: disabled ? theme.textTertiary + '40' : theme.accent }]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Feather name="check" size={18} color="#fff" />
        <Text style={styles.buttonText}>提交</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
})