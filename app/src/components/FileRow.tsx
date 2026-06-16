import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { GitStatusItem } from '../types'

const STATUS_MAP: Record<string, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  M: { icon: 'edit', color: '#ff9f43' },
  A: { icon: 'plus-circle', color: '#2ecc71' },
  D: { icon: 'trash-2', color: '#e74c3c' },
  R: { icon: 'refresh-cw', color: '#54a0ff' },
  '??': { icon: 'help-circle', color: '#8395a7' },
  MM: { icon: 'edit', color: '#ff9f43' },
}

interface Props {
  item: GitStatusItem
  staged: boolean
  theme: Theme
  onPress: () => void
  onStage: () => void
  onUnstage: () => void
  onDiscard?: () => void
}

export default function FileRow({ item, staged, theme, onPress, onStage, onUnstage, onDiscard }: Props) {
  const statusInfo = STATUS_MAP[item.status] || { icon: 'file' as const, color: theme.textSecondary }

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <Feather name={statusInfo.icon} size={13} color={statusInfo.color} style={styles.statusIcon} />
      <Text style={[styles.filename, { color: theme.text }]} numberOfLines={1}>{item.path}</Text>
      {staged ? (
        <TouchableOpacity onPress={onUnstage} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionBtn}>
          <Feather name="minus-circle" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      ) : (
        <>
          {onDiscard && (
            <TouchableOpacity onPress={onDiscard} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.discardBtn}>
              <Feather name="x-circle" size={18} color="#e74c3c" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onStage} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionBtn}>
            <Feather name="plus-circle" size={18} color={theme.accent} />
          </TouchableOpacity>
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusIcon: { marginRight: 10, width: 16, textAlign: 'center' },
  filename: { flex: 1, fontSize: 14 },
  actionBtn: { padding: 4, marginLeft: 8 },
  discardBtn: { padding: 4, marginLeft: 8 },
})