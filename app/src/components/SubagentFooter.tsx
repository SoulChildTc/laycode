import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface Props {
  theme: Theme
  agentName: string
  currentIndex: number
  totalCount: number
  onPrev: () => void
  onNext: () => void
}

export default function SubagentFooter({ theme, agentName, currentIndex, totalCount, onPrev, onNext }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={styles.info}>
        <Text style={[styles.agentLabel, { color: theme.text }]}>{agentName}</Text>
        <Text style={[styles.indexLabel, { color: theme.textTertiary }]}>
          {currentIndex} / {totalCount}
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.surfaceSecondary }]} onPress={onPrev} activeOpacity={0.7}>
          <Feather name="chevron-left" size={16} color={theme.text} />
          <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.surfaceSecondary }]} onPress={onNext} activeOpacity={0.7}>
          <Feather name="chevron-right" size={16} color={theme.text} />
          <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentLabel: { fontSize: 14, fontWeight: '600' },
  indexLabel: { fontSize: 12 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  buttonText: { fontSize: 12, fontWeight: '500' },
})