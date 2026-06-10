import React from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { Theme } from '../theme'

interface Props {
  file: string
  content: string
  theme: Theme
}

export default function DiffView({ file, content, theme }: Props) {
  const lines = content.split('\n')

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <View style={[styles.header, { backgroundColor: theme.surfaceSecondary }]}>
        <Text style={[styles.file, { color: theme.text }]}>{file}</Text>
      </View>
      {lines.map((line, i) => {
        const bgColor = line.startsWith('+') ? '#1a3a1a' : line.startsWith('-') ? '#3a1a1a' : 'transparent'
        const textColor = line.startsWith('+')
          ? '#4ade80'
          : line.startsWith('-')
            ? '#ef4444'
            : theme.textSecondary
        return (
          <View key={i} style={[styles.line, { backgroundColor: bgColor }]}>
            <Text style={[styles.lineText, { color: textColor }]}>{line}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, marginVertical: 6, borderWidth: 1, overflow: 'hidden' },
  header: { paddingHorizontal: 12, paddingVertical: 6 },
  file: { fontSize: 13, fontWeight: '600' },
  line: { paddingHorizontal: 12, paddingVertical: 1 },
  lineText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
})
