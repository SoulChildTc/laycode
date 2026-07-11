import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient, BrowseEntry } from '../api/client'
import { useToast } from '../contexts/ToastContext'
import { ServerEntry } from '../types'
import { storageKey } from '../utils/storage'
import { InputModal, InputField, MetaRow } from '../components/InputModal'

interface Props {
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
  config: ServerEntry
}

function pathSegments(fullPath: string): { label: string; path: string }[] {
  if (!fullPath || fullPath === '/') return [{ label: '/', path: '/' }]
  const parts = fullPath.split('/').filter(Boolean)
  const segments: { label: string; path: string }[] = []
  let accumulated = ''
  for (const part of parts) {
    accumulated += '/' + part
    segments.push({ label: part, path: accumulated })
  }
  return segments
}

export default function BrowseWorkspaceScreen({ navigation, client, themeMode, config }: Props) {
  const theme = getTheme(themeMode)
  const toast = useToast()
  const key = storageKey(config.id, 'workspaces')
  const [current, setCurrent] = useState('')
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [creating, setCreating] = useState(false)
  const breadcrumbs = pathSegments(current)

  const load = async (filePath?: string) => {
    setLoading(true)
    try {
      const result = await client.browse(filePath)
      setEntries(result.entries)
      setCurrent(result.current)
    } catch (e: any) {
      toast.error(e?.message || '无法读取目录，请检查连接')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const select = async (dir: string) => {
    const name = dir.split('/').pop() || dir
    try {
      const raw = await AsyncStorage.getItem(key)
      const list = raw ? JSON.parse(raw) : []
      // 去重：同一目录只能添加一次，否则列表出现相同 path，FlatList 的 key 会冲突。
      if (list.some((w: any) => w.path === dir)) {
        toast.show('该目录已在工作区中')
        navigation.goBack()
        return
      }
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
    } catch (e: any) {
      toast.error(e?.message || '创建文件夹失败')
    }
    setCreating(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Feather name="x" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>选择项目目录</Text>
        <TouchableOpacity onPress={() => setShowNewFolder(true)} style={styles.headerBtn}>
          <Feather name="folder-plus" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.breadcrumb, { borderBottomColor: theme.border }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={breadcrumbs}
          keyExtractor={(item) => item.path}
          contentContainerStyle={styles.breadcrumbContent}
          renderItem={({ item, index }) => (
            <View style={styles.breadcrumbItem}>
              {index > 0 && <Feather name="chevron-right" size={12} color={theme.textTertiary} style={{ marginHorizontal: 4 }} />}
              <TouchableOpacity onPress={() => load(item.path)}>
                <Text
                  style={[
                    styles.breadcrumbText,
                    { color: index === breadcrumbs.length - 1 ? theme.text : theme.accent },
                    index === breadcrumbs.length - 1 && styles.breadcrumbActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.path}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.entry, { borderBottomColor: theme.borderLight }]}
              onPress={() => load(item.path)}
              activeOpacity={0.6}
            >
              <View style={[styles.entryIcon, { backgroundColor: theme.accent + '18' }]}>
                <Feather name="folder" size={20} color={theme.accent} />
              </View>
              <View style={styles.entryInfo}>
                <Text style={[styles.entryName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.entryPath, { color: theme.textTertiary }]} numberOfLines={1}>{item.path}</Text>
              </View>
              <TouchableOpacity
                style={[styles.selectBtn, { backgroundColor: theme.accent }]}
                onPress={() => select(item.path)}
              >
                <Text style={styles.selectBtnText}>选择</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="folder" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>此目录为空</Text>
            </View>
          }
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerBtn: { width: 36, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  breadcrumb: {
    borderBottomWidth: 0.5,
    paddingVertical: 8,
  },
  breadcrumbContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumbText: {
    fontSize: 13,
    fontWeight: '500',
  },
  breadcrumbActive: {
    fontWeight: '700',
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  entryInfo: {
    flex: 1,
    marginRight: 12,
  },
  entryName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  entryPath: {
    fontSize: 11,
  },
  selectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  selectBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
})
