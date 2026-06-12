import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import type { Theme } from '../theme'

interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  let oi = 0, ni = 0
  while (oi < oldLines.length && ni < newLines.length) {
    if (oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', text: oldLines[oi] })
      oi++
      ni++
    } else {
      // Scan ahead — try to find a matching line
      const nextMatch = newLines.indexOf(oldLines[oi], ni)
      if (nextMatch > ni && nextMatch - ni < 5) {
        // New lines added before old line
        while (ni < nextMatch) {
          result.push({ type: 'add', text: newLines[ni] })
          ni++
        }
      } else {
        // Lines removed
        result.push({ type: 'remove', text: oldLines[oi] })
        oi++
      }
    }
  }

  while (oi < oldLines.length) {
    result.push({ type: 'remove', text: oldLines[oi] })
    oi++
  }
  while (ni < newLines.length) {
    result.push({ type: 'add', text: newLines[ni] })
    ni++
  }

  return result
}

interface Props {
  oldString: string
  newString: string
  theme: Theme
}

export default function DiffView({ oldString, newString, theme }: Props) {
  const lines = useMemo(() => computeDiff(oldString, newString), [oldString, newString])

  return (
    <View style={styles.container}>
      {lines.map((line, i) => (
        <View key={i} style={[
          styles.line,
          line.type === 'add' && { backgroundColor: 'rgba(52,199,89,0.12)' },
          line.type === 'remove' && { backgroundColor: 'rgba(255,59,48,0.12)' },
        ]}>
          <Text style={[
            styles.prefix,
            line.type === 'add' && { color: '#34C759' },
            line.type === 'remove' && { color: '#FF3B30' },
            line.type === 'same' && { color: theme.textTertiary },
          ]}>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </Text>
          <Text
            style={[
              styles.text,
              { color: theme.text },
              line.type === 'add' && { color: '#34C759' },
              line.type === 'remove' && { color: '#FF3B30' },
            ]}
            numberOfLines={1}
          >
            {line.text}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 1 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1, paddingHorizontal: 4, borderRadius: 2 },
  prefix: { width: 14, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center' },
  text: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
})