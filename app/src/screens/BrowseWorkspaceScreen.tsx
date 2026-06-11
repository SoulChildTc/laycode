import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient, BrowseEntry } from '../api/client'
import { ServerEntry } from '../types'
import { storageKey } from '../utils/storage'

interface Props {
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
  config: ServerEntry
}

export default function BrowseWorkspaceScreen({ navigation, client, themeMode, config }: Props) {
  const theme = getTheme(themeMode)
  const key = storageKey(config.id, 'workspaces')
  const [current, setCurrent] = useState('')
  const [parent, setParent] = useState('')
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (filePath?: string) => {
    setLoading(true)
    try {
      const result = await client.browse(filePath)
      setEntries(result.entries)
      setCurrent(result.current)
      setParent(result.parent)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const select = async (dir: string) => {
    const name = dir.split('/').pop() || dir
    try {
      const raw = await AsyncStorage.getItem(key)
      const list = raw ? JSON.parse(raw) : []
      list.push({ path: dir, name, addedAt: Date.now() })
      await AsyncStorage.setItem(key, JSON.stringify(list))
    } catch {}
    navigation.goBack()
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.cancel, { color: theme.accent }]}>取消</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>选择项目目录</Text>
        <View style={{ width: 50 }} />
      </View>

      <TouchableOpacity style={[styles.pathBar, { backgroundColor: theme.surface }]} onPress={() => load(parent)}>
        <Text style={[styles.pathText, { color: theme.textSecondary }]} numberOfLines={1}>📂 {current}</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.entry, { borderBottomColor: theme.border }]}
              onPress={() => load(item.path)}
            >
              <Text style={[styles.entryName, { color: theme.text }]}>📁 {item.name}</Text>
              <TouchableOpacity onPress={() => select(item.path)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.selectBtn, { color: theme.accent }]}>选择</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  cancel: { fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  pathBar: { paddingHorizontal: 16, paddingVertical: 12 },
  pathText: { fontSize: 13 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  entryName: { fontSize: 16 },
  selectBtn: { fontSize: 14, fontWeight: '500' },
})