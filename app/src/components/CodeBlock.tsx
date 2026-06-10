import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Theme } from '../theme'

interface Props {
  language: string
  content: string
  theme: Theme
}

export default function CodeBlock({ language, content, theme }: Props) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split('\n')
  const preview = lines.slice(0, 5)

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
      <View style={styles.header}>
        <Text style={[styles.lang, { color: theme.textSecondary }]}>{language}</Text>
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Text style={[styles.toggle, { color: theme.accent }]}>
            {expanded ? '折叠' : `${lines.length} 行`}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.code, { color: theme.text }]}>
        {(expanded ? lines : preview).join('\n')}
      </Text>
      {!expanded && lines.length > 5 && (
        <TouchableOpacity onPress={() => setExpanded(true)}>
          <Text style={[styles.expand, { color: theme.accent }]}>显示全部 {lines.length} 行</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, marginVertical: 6, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  lang: { fontSize: 12 },
  toggle: { fontSize: 12 },
  code: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  expand: { paddingHorizontal: 12, paddingBottom: 8, fontSize: 13 },
})
