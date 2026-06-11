import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { ServerEntry } from '../types'
import { storageKey } from '../utils/storage'

interface Workspace {
  path: string
  name: string
  addedAt: number
}

interface Props {
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
  config: ServerEntry
}

export default function HomeScreen({ navigation, client, themeMode, config }: Props) {
  const theme = getTheme(themeMode)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const key = storageKey(config.id, 'workspaces')

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(key)
      if (raw) {
        const list = JSON.parse(raw)
        setWorkspaces(list)
        const m: Record<string, number> = {}
        for (const w of list) {
          try {
            const list = await client.listSessionsByDirectory(w.path)
            m[w.path] = list.length
          } catch { m[w.path] = 0 }
        }
        setCounts(m)
      }
    } catch {}
  }, [client, key])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const removeWorkspace = useCallback(async (path: string) => {
    const updated = workspaces.filter(w => w.path !== path)
    setWorkspaces(updated)
    await AsyncStorage.setItem(key, JSON.stringify(updated))
  }, [workspaces, key])

  const confirmRemove = (path: string, name: string) => {
    Alert.alert('删除工作区', `确定删除「${name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => removeWorkspace(path) },
    ])
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>LayCode</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>已连接</Text>
      </View>

      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.path}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => navigation.navigate('Workspace', { directory: item.path, name: item.name })}
            onLongPress={() => confirmRemove(item.path, item.name)}
          >
            <Text style={[styles.cardName, { color: theme.text }]}>{item.name}</Text>
            <Text style={[styles.cardPath, { color: theme.textSecondary }]}>{item.path}</Text>
            <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
              {counts[item.path] ?? '-'} 个会话
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>还没有添加工作区</Text>
            <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
              点击下方按钮选择电脑上的项目目录
            </Text>
          </View>
        }
        contentContainerStyle={workspaces.length === 0 && styles.emptyContainer}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent }]}
        onPress={() => navigation.navigate('BrowseWorkspace')}
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: 'bold' },
  subtitle: { fontSize: 13 },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 12, padding: 16, borderWidth: 1 },
  cardName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  cardPath: { fontSize: 12, marginBottom: 4 },
  cardMeta: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, marginBottom: 4 },
  emptyHint: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
})