import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { Todo, ServerEntry } from '../types'
import { storageKey } from '../utils/storage'

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
  const [groups, setGroups] = useState<Group[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const key = storageKey(config.id, 'workspaces')

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

  const handleToggle = async (todo: Todo, group: Group) => {
    const original = todo
    const updated = { ...todo, done: !todo.done }
    setGroups(prev => prev.map(g => {
      if (g.workspace.path !== group.workspace.path) return g
      return {
        ...g,
        todos: g.todos.map(t => t.id === todo.id ? updated : t),
        pending: g.pending + (todo.done ? 1 : -1),
      }
    }))
    try {
      await client.updateTodo(group.workspace.path, todo.id, { done: !todo.done })
    } catch {
      setGroups(prev => prev.map(g => {
        if (g.workspace.path !== group.workspace.path) return g
        return {
          ...g,
          todos: g.todos.map(t => t.id === todo.id ? original : t),
          pending: g.pending + (todo.done ? -1 : 1),
        }
      }))
    }
  }

  const data = useMemo(() => {
    const rows: ({ type: 'header'; key: string; group: Group } | { type: 'todo'; key: string; todo: Todo; group: Group })[] = []
    for (const g of groups) {
      rows.push({ type: 'header', key: `h:${g.workspace.path}`, group: g })
      if (expanded.has(g.workspace.path)) {
        for (const t of g.todos) {
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
          <Text style={[s.title, { color: theme.text }]}>待办汇总</Text>
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
                <TouchableOpacity
                  style={[s.groupRow, { borderBottomColor: theme.border }]}
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
              )
            }
            const t = item.todo
            return (
              <TouchableOpacity
                style={[s.todoRow, { borderBottomColor: theme.border }]}
                onPress={() => navigation.navigate('Todo', { directory: item.group.workspace.path, name: item.group.workspace.alias || item.group.workspace.name })}
                activeOpacity={0.7}
              >
                <CheckBtn done={t.done} onPress={() => handleToggle(t, item.group)} />
                <Text
                  style={[s.todoText, { color: t.done ? theme.textTertiary : theme.text, textDecorationLine: t.done ? 'line-through' : 'none' }]}
                  numberOfLines={2}
                >
                  {t.text}
                </Text>
                <Feather name="chevron-right" size={14} color={theme.textTertiary} />
              </TouchableOpacity>
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
  groupName: { flex: 1, fontSize: 15, fontWeight: '600' },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  todoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 52, paddingRight: 20, paddingVertical: 10, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  todoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  emptyWrap: { alignItems: 'center', paddingTop: 100, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13 },
})
