import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  error: '❌',
}

interface Props {
  tool: any
  theme: any
  compact?: boolean
}

export default function ToolPart({ tool, theme, compact }: Props) {
  const [expanded, setExpanded] = useState(false)
  const icon = STATUS_ICONS[tool.state?.status] || '⚪'

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: theme.surfaceSecondary || theme.surface, borderColor: theme.border }]}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.toolName, { color: theme.textSecondary }]}>{tool.tool}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceSecondary || theme.surface, borderColor: theme.border }]}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.toolName, { color: theme.text }]}>{tool.tool}</Text>
        <Text style={[styles.arrow, { color: theme.textSecondary }]}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.body}>
          {tool.state?.input && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>输入</Text>
              <Text style={[styles.code, { backgroundColor: theme.surface, color: theme.text }]}>{JSON.stringify(tool.state.input, null, 2)}</Text>
            </>
          )}
          {tool.state?.output && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>输出</Text>
              <Text style={[styles.code, { backgroundColor: theme.surface, color: theme.text }]}>{tool.state.output}</Text>
            </>
          )}
          {tool.state?.title && (
            <Text style={[styles.title, { color: theme.textSecondary }]}>{tool.state.title}</Text>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, borderWidth: 1, marginVertical: 4, overflow: 'hidden' },
  compactContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, marginVertical: 4, paddingHorizontal: 10, paddingVertical: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  icon: { fontSize: 13, marginRight: 4 },
  toolName: { fontSize: 13, fontWeight: '500', flex: 1 },
  arrow: { fontSize: 10 },
  body: { paddingHorizontal: 10, paddingBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 2 },
  code: { fontSize: 12, fontFamily: 'monospace', padding: 8, borderRadius: 6, marginBottom: 4 },
  title: { fontSize: 12, marginTop: 4 },
})