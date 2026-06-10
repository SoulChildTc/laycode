import React, { useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LayCodeClient } from '../api/client'
import { getTheme, ThemeMode } from '../theme'
import { FileEntry } from '../types'

interface Props {
  route: any
  themeMode: ThemeMode
  client: LayCodeClient
}

export default function FileExplorerScreen({ route, themeMode, client }: Props) {
  const theme = getTheme(themeMode)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [fileContent, setFileContent] = useState<string | null>(null)

  useEffect(() => {
    loadDirectory('')
  }, [])

  const loadDirectory = async (path: string) => {
    setLoading(true)
    try {
      const list = await client.listFiles(path)
      setEntries(list || [])
      setFileContent(null)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const openFile = async (file: FileEntry) => {
    setLoading(true)
    try {
      const content = await client.readFile(file.path)
      setFileContent(content || '')
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  if (fileContent !== null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={() => setFileContent(null)}>
          <Text style={[styles.back, { color: theme.accent }]}>← 返回</Text>
        </TouchableOpacity>
        <Text style={[styles.fileContent, { color: theme.text }]}>{fileContent}</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>文件</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.item, { borderBottomColor: theme.border }]}
              onPress={() => (item.type === 'directory' ? loadDirectory(item.path) : openFile(item))}
            >
              <Text style={[styles.itemName, { color: theme.text }]}>
                {item.type === 'directory' ? '📁 ' : '📄 '}
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>没有文件</Text>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 22, fontWeight: 'bold' },
  back: { fontSize: 15, padding: 16 },
  item: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  itemName: { fontSize: 15 },
  fileContent: {
    padding: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
})
