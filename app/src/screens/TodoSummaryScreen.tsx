import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Animated, Alert,
  LayoutAnimation, UIManager, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Clipboard from 'expo-clipboard'
import { Swipeable } from 'react-native-gesture-handler'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { useToast } from '../contexts/ToastContext'
import { Todo, ServerEntry } from '../types'
import { storageKey } from '../utils/storage'
import { InputModal, InputField, MetaRow } from '../components/InputModal'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const LIST_ITEM_RE = /^[^\w\n]*(?:[-*+]\s+(?:\[[ x]\]\s+)?|\[[ x]?\]\s*)(.+)/gm

function parseListItems(text: string): string[] {
  return [...text.matchAll(LIST_ITEM_RE)]
    .map(m => m[1].trim())
    .filter(Boolean)
}

interface Workspace {
  path: string
  name: string
  alias?: string
  addedAt: number
}

interface Group {
  workspace: Workspace
  todos: Todo[]
  pending: number
}

interface Props {
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
  config: ServerEntry
}

const animCfg = { duration: 220, create: { type: 'easeInEaseOut' as const, property: 'opacity' as const }, update: { type: 'spring' as const, springDamping: 0.85 }, delete: { type: 'easeInEaseOut' as const, duration: 160 } }

function CheckBtn({ done, onPress }: { done: boolean; onPress: () => void }) {
  const anim = useRef(new Animated.Value(done ? 1 : 0)).current
  useEffect(() => {
    Animated.spring(anim, { toValue: done ? 1 : 0, useNativeDriver: true, damping: 8, stiffness: 240 }).start()
  }, [done])

  return (
    <TouchableOpacity onPress={onPress} hitSlop={8}>
      <View style={[chkStyle.out, { borderColor: done ? '#6c7dff' : '#666' }]}>
        {!!done && (
          <Animated.View style={[chkStyle.fill, { opacity: anim }]}>
            <Feather name="check" size={10} color="#fff" />
          </Animated.View>
        )}
      </View>
    </TouchableOpacity>
  )
}

const chkStyle = StyleSheet.create({
  out: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#6c7dff',
    alignItems: 'center', justifyContent: 'center',
  },
})

export default function TodoSummaryScreen({ navigation, client, themeMode, config }: Props) {
  const theme = getTheme(themeMode)
  const notify = useToast()
  const [groups, setGroups] = useState<Group[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [editingTodo, setEditingTodo] = useState<Todo | 'new' | null>(null)
  const [editText, setEditText] = useState('')
  const [editingPath, setEditingPath] = useState('')
  const key = storageKey(config.id, 'workspaces')
  const openSwipeRef = useRef<Swipeable | null>(null)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await AsyncStorage.getItem(key)
      if (!raw) { setGroups([]); setLoading(false); return }
      const workspaces: Workspace[] = JSON.parse(raw)
      const result: Group[] = []
      for (const w of workspaces) {
        try {
          const todos = await client.getTodos(w.path)
          const pending = todos.filter(t => !t.done).length
          result.push({ workspace: w, todos, pending })
        } catch {
          result.push({ workspace: w, todos: [], pending: 0 })
        }
      }
      result.sort((a, b) => b.pending - a.pending)
      setGroups(result)
      setExpanded(new Set(result.filter(g => g.pending > 0).map(g => g.workspace.path)))
    } catch {}
    setLoading(false)
  }, [client, key])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const totalPending = groups.reduce((s, g) => s + g.pending, 0)

  const toggleGroup = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const updateGroupTodos = (path: string, updater: (todos: Todo[]) => Todo[]) => {
    setGroups(prev => prev.map(g => {
      if (g.workspace.path !== path) return g
      const todos = updater(g.todos)
      return { ...g, todos, pending: todos.filter(t => !t.done).length }
    }))
  }

  const handleToggle = async (todo: Todo, group: Group) => {
    const original = todo
    LayoutAnimation.configureNext(animCfg)
    updateGroupTodos(group.workspace.path, todos =>
      todos.map(t => t.id === todo.id ? { ...t, done: !t.done } : t)
    )
    try {
      await client.updateTodo(group.workspace.path, todo.id, { done: !todo.done })
    } catch (e: any) {
      updateGroupTodos(group.workspace.path, todos =>
        todos.map(t => t.id === todo.id ? original : t)
      )
      notify.error(e?.message || '更新任务失败')
    }
  }

  const handleToggleUrgent = async (todo: Todo, group: Group) => {
    LayoutAnimation.configureNext(animCfg)
    updateGroupTodos(group.workspace.path, todos =>
      todos.map(t => t.id === todo.id ? { ...t, urgent: !t.urgent } : t)
    )
    try {
      await client.updateTodo(group.workspace.path, todo.id, { urgent: !todo.urgent })
    } catch (e: any) {
      notify.error(e?.message || '更新任务失败')
    }
  }

  const handleDelete = async (id: string, path: string) => {
    LayoutAnimation.configureNext(animCfg)
    updateGroupTodos(path, todos => todos.filter(t => t.id !== id))
    try { await client.deleteTodo(path, id) } catch (e: any) { notify.error(e?.message || '删除任务失败') }
  }

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastAnim.setValue(0)
    Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
    }, 1200)
  }

  const openNew = (path: string) => {
    setEditingPath(path)
    setEditingTodo('new')
    setEditText('')
  }

  const openEdit = (todo: Todo, path: string) => {
    setEditingPath(path)
    setEditingTodo(todo)
    setEditText(todo.text)
  }

  const handleSave = async () => {
    const trimmed = editText.trim()
    const isNew = editingTodo === 'new'
    const id = isNew ? null : (editingTodo as Todo).id
    const oldText = isNew ? '' : (editingTodo as Todo).text
    const path = editingPath
    setEditingTodo(null)
    setEditText('')
    setEditingPath('')
    if (!trimmed || trimmed === oldText) return

    const createOne = async (text: string) => {
      try {
        return await client.createTodo(path, text)
      } catch (e: any) {
        notify.error(e?.message || '创建任务失败')
      }
      return null
    }

    if (isNew) {
      const items = parseListItems(trimmed)
      if (items.length >= 2) {
        await new Promise<void>((resolve) => {
          Alert.alert(
            '检测到列表格式',
            `是否要将 ${items.length} 个列表项拆分为独立任务？`,
            [
              { text: '合并为一个任务', style: 'cancel', onPress: async () => {
                LayoutAnimation.configureNext(animCfg)
                const todo = await createOne(trimmed)
                if (todo) updateGroupTodos(path, todos => [...todos, todo])
                resolve()
              }},
              { text: `拆分为 ${items.length} 个任务`, onPress: async () => {
                LayoutAnimation.configureNext(animCfg)
                const results = await Promise.all(items.map(text => createOne(text)))
                const valid = results.filter((t): t is Todo => t !== null)
                if (valid.length) updateGroupTodos(path, todos => [...todos, ...valid])
                resolve()
              }},
            ],
          )
        })
      } else {
        LayoutAnimation.configureNext(animCfg)
        const todo = await createOne(trimmed)
        if (todo) updateGroupTodos(path, todos => [...todos, todo])
      }
    } else {
      LayoutAnimation.configureNext(animCfg)
      updateGroupTodos(path, todos => todos.map(t => t.id === id ? { ...t, text: trimmed } : t))
      try { await client.updateTodo(path, id!, { text: trimmed }) } catch (e: any) { notify.error(e?.message || '更新任务失败') }
    }
  }

  const cancelEdit = () => {
    setEditingTodo(null)
    setEditText('')
    setEditingPath('')
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const renderRightActions = (todo: Todo, path: string) => (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-140, 0],
      outputRange: [1, 0.6],
      extrapolate: 'clamp',
    })
    return (
      <Animated.View style={[swipeStyle.actions, { transform: [{ scale }] }]}>
        <TouchableOpacity
          style={[swipeStyle.btn, swipeStyle.flag]}
          onPress={() => {
            openSwipeRef.current?.close()
            handleToggleUrgent(todo, { workspace: { path, name: '', addedAt: 0 }, todos: [], pending: 0 })
          }}
        >
          <Feather name="flag" size={18} color="#fff" />
          <Text style={swipeStyle.text}>{todo.urgent ? '取消加急' : '加急'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[swipeStyle.btn, swipeStyle.copy]}
          onPress={() => {
            openSwipeRef.current?.close()
            handleCopy(todo.text)
          }}
        >
          <Feather name="copy" size={18} color="#fff" />
          <Text style={swipeStyle.text}>复制</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[swipeStyle.btn, swipeStyle.delete]}
          onPress={() => {
            openSwipeRef.current?.close()
            handleDelete(todo.id, path)
          }}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={swipeStyle.text}>删除</Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  const data = useMemo(() => {
    const rows: ({ type: 'header'; key: string; group: Group } | { type: 'todo'; key: string; todo: Todo; group: Group })[] = []
    for (const g of groups) {
      rows.push({ type: 'header', key: `h:${g.workspace.path}`, group: g })
      if (expanded.has(g.workspace.path)) {
        const pending = g.todos.filter(t => !t.done).sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0))
        const done = g.todos.filter(t => t.done)
        for (const t of [...pending, ...done]) {
          rows.push({ type: 'todo', key: t.id, todo: t, group: g })
        }
      }
    }
    return rows
  }, [groups, expanded])

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <View>
          <Text style={[s.title, { color: theme.text }]}>待办</Text>
          <Text style={[s.subtitle, { color: theme.textTertiary }]}>
            {totalPending > 0 ? `${totalPending} 项未完成` : '全部已完成'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><Text style={{ color: theme.textTertiary }}>加载中...</Text></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.key}
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const g = item.group
              const isOpen = expanded.has(g.workspace.path)
              const doneCount = g.todos.length - g.pending
              return (
                <View style={[s.groupRow, { borderBottomColor: theme.border }]}>
                  <TouchableOpacity
                    style={s.groupTouch}
                    onPress={() => toggleGroup(g.workspace.path)}
                    activeOpacity={0.7}
                  >
                    <Feather name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} color={theme.textTertiary} />
                    <Feather name="folder" size={16} color={theme.accent} />
                    <Text style={[s.groupName, { color: theme.text }]} numberOfLines={1}>{g.workspace.alias || g.workspace.name}</Text>
                    {g.pending > 0 && (
                      <View style={[s.countBadge, { backgroundColor: theme.accent }]}>
                        <Text style={s.countText}>{g.pending}</Text>
                      </View>
                    )}
                    {doneCount > 0 && (
                      <Text style={{ fontSize: 11, color: theme.textTertiary }}>{doneCount} ✓</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.addBtn}
                    onPress={() => openNew(g.workspace.path)}
                    hitSlop={8}
                  >
                    <Feather name="plus" size={18} color={theme.accent} />
                  </TouchableOpacity>
                </View>
              )
            }
            const t = item.todo
            const grp = item.group
            return (
              <Swipeable
                ref={ref => {
                  if (ref) {
                    openSwipeRef.current?.close()
                    openSwipeRef.current = ref
                  }
                }}
                renderRightActions={renderRightActions(t, grp.workspace.path)}
                overshootRight={false}
                friction={2}
                rightThreshold={40}
              >
                <View style={[s.todoRow, { borderBottomColor: theme.border }]}>
                  <CheckBtn done={t.done} onPress={() => handleToggle(t, grp)} />
                  <TouchableOpacity
                    style={s.todoTouch}
                    onPress={() => openEdit(t, grp.workspace.path)}
                    activeOpacity={0.6}
                  >
                    <View style={s.todoTextRow}>
                      {t.urgent && !t.done && <Feather name="flag" size={13} color="#ff3b30" style={{ marginRight: 5 }} />}
                      <Text
                        style={[s.todoText, { color: t.done ? theme.textTertiary : theme.text }]}
                        numberOfLines={2}
                      >
                        {t.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </Swipeable>
            )
          }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="check-circle" size={40} color={theme.accent} />
              <Text style={[s.emptyTitle, { color: theme.textSecondary }]}>没有待办</Text>
              <Text style={[s.emptySub, { color: theme.textTertiary }]}>所有工作区都已完成</Text>
            </View>
          }
        />
      )}

      <InputModal
        visible={editingTodo !== null}
        title={editingTodo === 'new' ? '新建任务' : '编辑任务'}
        theme={theme}
        onCancel={cancelEdit}
        onSave={handleSave}
        saveDisabled={!editText.trim()}
      >
        <InputField
          value={editText}
          onChangeText={setEditText}
          placeholder="输入任务内容..."
          theme={theme}
          multiline
          onSubmitEditing={handleSave}
        />
        {editingTodo !== null && editingTodo !== 'new' && (
          <>
            <MetaRow icon="clock" text={`创建于 ${formatDate(editingTodo.createdAt)}`} theme={theme} />
            {editingTodo.updatedAt !== editingTodo.createdAt && (
              <MetaRow icon="refresh-cw" text={`更新于 ${formatDate(editingTodo.updatedAt)}`} theme={theme} />
            )}
          </>
        )}
      </InputModal>

      <Animated.View
        pointerEvents="none"
        style={[
          s.toast,
          {
            opacity: toastAnim,
            transform: [{
              translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
            }],
          },
        ]}
      >
        <Feather name="check-circle" size={16} color="#fff" />
        <Text style={s.toastText}>已复制</Text>
      </Animated.View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 40 },
  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupTouch: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  groupName: { flex: 1, fontSize: 15, fontWeight: '600' },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  addBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  todoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 52, paddingRight: 20, paddingVertical: 10, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  todoTouch: { flex: 1, paddingVertical: 2 },
  todoTextRow: { flexDirection: 'row', alignItems: 'center' },
  todoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  emptyWrap: { alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13 },
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
})

const swipeStyle = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  btn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
  },
  flag: { backgroundColor: '#ff9500' },
  copy: { backgroundColor: '#6c7dff' },
  delete: { backgroundColor: '#ff3b30' },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
})
