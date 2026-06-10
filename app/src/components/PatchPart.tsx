import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface Props {
  patch: any
  theme: any
}

export default function PatchPart({ patch, theme }: Props) {
  const [expanded, setExpanded] = useState(false)
  const files = patch.files || []
  const label = `📝 修改了 ${files.length} 个文件`

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceSecondary || theme.surface, borderColor: theme.border }]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.arrow, { color: theme.textSecondary }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && files.map((f: string, i: number) => (
        <Text key={i} style={[styles.file, { color: theme.textSecondary }]}>{f}</Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, borderWidth: 1, marginVertical: 4, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  label: { fontSize: 13, flex: 1 },
  arrow: { fontSize: 10 },
  file: { fontSize: 12, paddingHorizontal: 10, paddingBottom: 4 },
})