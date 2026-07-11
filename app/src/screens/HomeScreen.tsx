import React, { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Animated, LayoutAnimation, Platform, UIManager, Modal } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient, setConnStateHandler, ConnState } from '../api/client'
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
  const [connState, setConnState] = useState<ConnState>('online')
  const [editingWs, setEditingWs] = useState<Workspace | null>(null)
  const [actionWs, setActionWs] = useState<Workspace | null>(null)
  const [aliasText, setAliasText] = useState('')
  const key = storageKey(config.id, 'workspaces')
  const openSwipeRef = useRef<Swipeable | null>(null)

  // 订阅真实连接状态（由每个请求的成败驱动，方案 A，无独立心跳）。
  useEffect(() => {
    setConnStateHandler((state) => setConnState(state))
    return () => setConnStateHandler(null)
  }, [])

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(key)
      const list = raw ? JSON.parse(raw) : []
      setWorkspaces(list)
      if (list.length > 0) {
        // 有工作区：拉会话数，成功/失败会经统一层自动更新连接状态。
        const m: Record<string, number> = {}
        for (const w of list) {
          try {
            const sessions = await client.listSessionsByDirectory(w.path)
            const nonSubagent = sessions.filter((s: any) => !s.parentID)
            m[w.path] = nonSubagent.length
          } catch { m[w.path] = 0 }
        }
        setCounts(m)
      } else {
        // 没有工作区、不会发列表请求：主动探一次连接状态，避免状态停在初始值。
        const state = await client.verify()
        setConnState(state === 'ok' ? 'online' : state)
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

  const persist = useCallback(async (list: Workspace[]) => {
    setWorkspaces(list)
    await AsyncStorage.setItem(key, JSON.stringify(list))
  }, [key])

  // 长按操作菜单：置顶 / 上移 / 下移
  const reorder = useCallback(async (path: string, action: 'top' | 'up' | 'down') => {
    const idx = workspaces.findIndex(w => w.path === path)
    if (idx < 0) return
    const list = workspaces.slice()
    const [item] = list.splice(idx, 1)
    var target = idx
    if (action === 'top') target = 0
    else if (action === 'up') target = Math.max(0, idx - 1)
    else if (action === 'down') target = Math.min(list.length, idx + 1)
    list.splice(target, 0, item)
    LayoutAnimation.configureNext(animCfg)
    setActionWs(null)
    await persist(list)
  }, [workspaces, persist])

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
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(theme, connState) }]} />
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{statusLabel(connState)}</Text>
        </View>
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
                onLongPress={() => setActionWs(item)}
                delayLongPress={300}
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

      <Modal visible={actionWs !== null} transparent animationType="fade" onRequestClose={() => setActionWs(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setActionWs(null)}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sheetTitle, { color: theme.text }]} numberOfLines={1}>
              {actionWs ? displayName(actionWs) : ''}
            </Text>
            <SheetItem icon="arrow-up" label="置顶" theme={theme}
              disabled={!actionWs || workspaces[0]?.path === actionWs.path}
              onPress={() => actionWs && reorder(actionWs.path, 'top')} />
            <SheetItem icon="chevron-up" label="上移" theme={theme}
              disabled={!actionWs || workspaces[0]?.path === actionWs.path}
              onPress={() => actionWs && reorder(actionWs.path, 'up')} />
            <SheetItem icon="chevron-down" label="下移" theme={theme}
              disabled={!actionWs || workspaces[workspaces.length - 1]?.path === actionWs.path}
              onPress={() => actionWs && reorder(actionWs.path, 'down')} />
            <SheetItem icon="edit-2" label="设置别名" theme={theme}
              onPress={() => { const ws = actionWs; setActionWs(null); if (ws) openAliasEdit(ws) }} />
          </View>
        </TouchableOpacity>
      </Modal>

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

function statusLabel(state: ConnState): string {
  if (state === 'unauthorized') return '密钥失效'
  if (state === 'offline') return '未连接'
  return '已连接'
}

function statusColor(theme: any, state: ConnState): string {
  if (state === 'unauthorized') return theme.warning
  if (state === 'offline') return theme.error
  return theme.success
}

function SheetItem({ icon, label, theme, onPress, disabled }: { icon: any; label: string; theme: any; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.sheetItem, disabled && { opacity: 0.35 }]}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Feather name={icon} size={18} color={theme.text} style={{ marginRight: 12 }} />
      <Text style={[styles.sheetItemText, { color: theme.text }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: 'bold' },
  subtitle: { fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
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
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, paddingBottom: 28, paddingHorizontal: 8 },
  sheetTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 10, opacity: 0.7 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10 },
  sheetItemText: { fontSize: 16 },
})
