import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  file: any
  theme: any
}

export default function FilePart({ file, theme }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceSecondary || theme.surface, borderColor: theme.border }]}>
      <Text style={styles.icon}>📎</Text>
      <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{file.filename || 'file'}</Text>
      {file.mime && <Text style={[styles.type, { color: theme.textSecondary }]}>{file.mime}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, marginVertical: 4, paddingHorizontal: 10, paddingVertical: 6 },
  icon: { fontSize: 14, marginRight: 6 },
  name: { fontSize: 13, flex: 1 },
  type: { fontSize: 11, marginLeft: 4 },
})