import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient, BrowseEntry } from '../api/client'
import { ServerEntry } from '../types'
import { storageKey } from '../utils/storage'
import { InputModal, InputField, MetaRow } from '../components/InputModal'

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
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [creating, setCreating] = useState(false)

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

  const handleCreateFolder = async () => {
    const trimmed = folderName.trim()
    if (!trimmed || trimmed.includes('/')) return
    const fullPath = current + '/' + trimmed
    setCreating(true)
    try {
      await client.createFolder(fullPath)
      setShowNewFolder(false)
      setFolderName('')
      load(current)
    } catch {}
    setCreating(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.cancel, { color: theme.accent }]}>取消</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>选择项目目录</Text>
        <TouchableOpacity onPress={() => setShowNewFolder(true)} style={styles.newBtn} hitSlop={8}>
          <Feather name="plus" size={18} color={theme.accent} />
        </TouchableOpacity>
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

      <InputModal
        visible={showNewFolder}
        title="新建文件夹"
        theme={theme}
        onCancel={() => { setShowNewFolder(false); setFolderName('') }}
        onSave={handleCreateFolder}
        saveDisabled={!folderName.trim() || folderName.includes('/') || creating}
        saveLabel={creating ? '创建中...' : '创建'}
      >
        <InputField
          value={folderName}
          onChangeText={setFolderName}
          placeholder="输入文件夹名称..."
          theme={theme}
          onSubmitEditing={handleCreateFolder}
        />
        {current ? (
          <MetaRow icon="folder" text={`${current}/${folderName || '...'}`} theme={theme} />
        ) : null}
      </InputModal>
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
  newBtn: { width: 32, alignItems: 'flex-end' },
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
