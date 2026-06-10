import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface Props {
  text: string
  theme: any
}

export default function ReasoningPart({ text, theme }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceSecondary || theme.surface, borderColor: theme.border }]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={styles.icon}>🤔</Text>
        <Text style={[styles.label, { color: theme.textSecondary }]}>思考</Text>
        <Text style={[styles.arrow, { color: theme.textSecondary }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (
        <Text style={[styles.content, { color: theme.textSecondary }]}>{text}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, borderWidth: 1, marginVertical: 4, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  icon: { fontSize: 13, marginRight: 4 },
  label: { fontSize: 12, fontWeight: '500', flex: 1 },
  arrow: { fontSize: 10 },
  content: { fontSize: 12, lineHeight: 18, paddingHorizontal: 10, paddingBottom: 8 },
})