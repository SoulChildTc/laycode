import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface Props {
  directory: string
  ptyID: string
  theme: Theme
  onPress: (ptyID: string) => void
  onClose: (ptyID: string) => void
}

export default function TerminalCard({ directory, ptyID, theme, onPress, onClose }: Props) {
  var dirName = directory.split('/').pop() || directory

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => onPress(ptyID)}
      activeOpacity={0.8}
    >
      <View style={styles.inner}>
        <Feather name="terminal" size={20} color={theme.accent} />
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{dirName}</Text>
          <Text style={[styles.subtitle, { color: theme.textTertiary }]} numberOfLines={1}>zsh · {ptyID.slice(0, 8)}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={function() { onClose(ptyID) }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="x" size={14} color={theme.textTertiary} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
})