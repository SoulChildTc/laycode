import React, { useState, useCallback, useRef } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { ServerEntry } from '../types'
import { storageKey } from '../utils/storage'
import { InputModal, InputField, MetaRow } from '../components/InputModal'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Workspace {
  path: string
  name: string
  alias?: string
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
  const [editingWs, setEditingWs] = useState<Workspace | null>(null)
  const [aliasText, setAliasText] = useState('')
  const key = storageKey(config.id, 'workspaces')
  const openSwipeRef = useRef<Swipeable | null>(null)

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
            const nonSubagent = list.filter((s: any) => !s.parentID)
            m[w.path] = nonSubagent.length
          } catch { m[w.path] = 0 }
        }
        setCounts(m)
      }
    } catch {}
  }, [client, key])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const animCfg = { duration: 220, create: { type: 'easeInEaseOut' as const, property: 'opacity' as const }, update: { type: 'spring' as const, springDamping: 0.85 }, delete: { type: 'easeInEaseOut' as const, duration: 160 } }

  const removeWorkspace = useCallback(async (path: string) => {
    LayoutAnimation.configureNext(animCfg)
    const updated = workspaces.filter(w => w.path !== path)
    setWorkspaces(updated)
    await AsyncStorage.setItem(key, JSON.stringify(updated))
  }, [workspaces, key])

  const saveAlias = useCallback(async () => {
    if (!editingWs) return
    const trimmed = aliasText.trim()
    const path = editingWs.path
    setEditingWs(null)
    setAliasText('')
    const updated = workspaces.map(w =>
      w.path === path ? { ...w, alias: trimmed || undefined } : w
    )
    setWorkspaces(updated)
    await AsyncStorage.setItem(key, JSON.stringify(updated))
  }, [editingWs, aliasText, workspaces, key])

  const cancelAlias = () => {
    setEditingWs(null)
    setAliasText('')
  }

  const openAliasEdit = (ws: Workspace) => {
    setEditingWs(ws)
    setAliasText(ws.alias || ws.name)
  }

  const displayName = (ws: Workspace) => ws.alias || ws.name

  const renderRightActions = (ws: Workspace) => (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-140, 0],
      outputRange: [1, 0.6],
      extrapolate: 'clamp',
    })
    return (
      <Animated.View style={[styles.swipeActions, { transform: [{ scale }] }]}>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            openAliasEdit(ws)
          }}
        >
          <Feather name="edit-2" size={18} color="#fff" />
          <Text style={styles.swipeBtnText}>编辑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            removeWorkspace(ws.path)
          }}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.swipeBtnText}>删除</Text>
        </TouchableOpacity>
      </Animated.View>
    )
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
          <View style={styles.cardWrapper}>
            <Swipeable
              ref={ref => {
                if (ref) {
                  openSwipeRef.current?.close()
                  openSwipeRef.current = ref
                }
              }}
              renderRightActions={renderRightActions(item)}
              overshootRight={false}
              friction={2}
              rightThreshold={40}
            >
              <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => navigation.navigate('Workspace', { directory: item.path, name: displayName(item) })}
                activeOpacity={0.7}
              >
                <Text style={[styles.cardName, { color: theme.text }]}>{displayName(item)}</Text>
                {item.alias && (
                  <Text style={[styles.cardOriginalName, { color: theme.textTertiary }]}>{item.name}</Text>
                )}
                <Text style={[styles.cardPath, { color: theme.textSecondary }]}>{item.path}</Text>
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>
                  {counts[item.path] ?? '-'} 个会话
                </Text>
              </TouchableOpacity>
            </Swipeable>
          </View>
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

      <InputModal
        visible={editingWs !== null}
        title="设置别名"
        theme={theme}
        onCancel={cancelAlias}
        onSave={saveAlias}
      >
        <InputField
          value={aliasText}
          onChangeText={setAliasText}
          placeholder="输入别名..."
          theme={theme}
          onSubmitEditing={saveAlias}
        />
        {editingWs && (
          <>
            <MetaRow icon="folder" text={editingWs.path} theme={theme} />
            <MetaRow icon="info" text="别名为空则显示原始名称" theme={theme} />
          </>
        )}
      </InputModal>
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
  cardWrapper: { marginHorizontal: 16, marginBottom: 12 },
  card: { borderRadius: 12, padding: 16, borderWidth: 1 },
  cardName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  cardOriginalName: { fontSize: 12, marginBottom: 2 },
  cardPath: { fontSize: 12, marginBottom: 4 },
  cardMeta: { fontSize: 12 },
  swipeActions: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  editBtn: {
    backgroundColor: '#6c7dff',
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
  },
  deleteBtn: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
  },
  swipeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
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
