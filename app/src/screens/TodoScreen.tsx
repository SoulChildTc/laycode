import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Animated,
  LayoutAnimation, UIManager, Platform,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Swipeable } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { Todo } from '../types'
import { InputModal, InputField, MetaRow } from '../components/InputModal'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Props {
  route: { params: { directory: string; name: string } }
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
}

function CheckBtn({ done, onPress }: { done: boolean; onPress: () => void }) {
  const anim = useRef(new Animated.Value(done ? 1 : 0)).current
  useEffect(() => {
    Animated.spring(anim, { toValue: done ? 1 : 0, useNativeDriver: true, damping: 8, stiffness: 240 }).start()
  }, [done])

  return (
    <TouchableOpacity onPress={onPress} hitSlop={10}>
      <View style={[s.chkOut, { borderColor: done ? '#6c7dff' : '#666' }]}>
        <Animated.View style={[s.chkFill, { opacity: anim, transform: [{ scale: anim }] }]}>
          <Feather name="check" size={12} color="#fff" />
        </Animated.View>
      </View>
    </TouchableOpacity>
  )
}

export default function TodoScreen({ route, navigation, themeMode, client: api }: Props) {
  const { directory, name } = route.params
  const theme = getTheme(themeMode)
  const [items, setItems] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTodo, setEditingTodo] = useState<Todo | 'new' | null>(null)
  const [editText, setEditText] = useState('')
  const openSwipeRef = useRef<Swipeable | null>(null)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try { setItems(await api.getTodos(directory)) } catch {}
    setLoading(false)
  }, [api, directory])

  useEffect(() => { load() }, [load])

  const animCfg = { duration: 220, create: { type: 'easeInEaseOut' as const, property: 'opacity' as const }, update: { type: 'spring' as const, springDamping: 0.85 }, delete: { type: 'easeInEaseOut' as const, duration: 160 } }

  const handleToggle = async (id: string, done: boolean) => {
    LayoutAnimation.configureNext(animCfg)
    setItems(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t))
    try { await api.updateTodo(directory, id, { done: !done }) } catch {}
  }

  const handleDelete = async (id: string) => {
    LayoutAnimation.configureNext(animCfg)
    setItems(prev => prev.filter(t => t.id !== id))
    try { await api.deleteTodo(directory, id) } catch {}
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

  const openNew = () => {
    setEditingTodo('new')
    setEditText('')
  }

  const openEdit = (todo: Todo) => {
    setEditingTodo(todo)
    setEditText(todo.text)
  }

  const handleSave = async () => {
    const trimmed = editText.trim()
    const isNew = editingTodo === 'new'
    const id = isNew ? null : (editingTodo as Todo).id
    const oldText = isNew ? '' : (editingTodo as Todo).text
    setEditingTodo(null)
    setEditText('')
    if (!trimmed || trimmed === oldText) return
    if (isNew) {
      LayoutAnimation.configureNext(animCfg)
      try {
        const todo = await api.createTodo(directory, trimmed)
        if (todo) setItems(prev => [...prev, todo])
      } catch {}
    } else {
      setItems(prev => prev.map(t => t.id === id ? { ...t, text: trimmed } : t))
      try { await api.updateTodo(directory, id!, { text: trimmed }) } catch {}
    }
  }

  const cancelEdit = () => {
    setEditingTodo(null)
    setEditText('')
  }

  const renderRightActions = (id: string, text: string) => (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-140, 0],
      outputRange: [1, 0.6],
      extrapolate: 'clamp',
    })
    return (
      <Animated.View style={[s.swipeActions, { transform: [{ scale }] }]}>
        <TouchableOpacity
          style={s.copyBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            handleCopy(text)
          }}
        >
          <Feather name="copy" size={18} color="#fff" />
          <Text style={s.swipeBtnText}>复制</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            handleDelete(id)
          }}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={s.swipeBtnText}>删除</Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  const pending = items.filter(t => !t.done)
  const doneList = items.filter(t => t.done)

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={s.backBtn}>
            <Feather name="chevron-left" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{name}</Text>
            <Text style={[s.subtitle, { color: theme.textTertiary }]}>{pending.length} 未完成</Text>
          </View>
          <TouchableOpacity onPress={openNew} style={[s.addBtn, { backgroundColor: theme.accent }]}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><Text style={{ color: theme.textTertiary }}>加载中...</Text></View>
        ) : (
          <FlatList
            data={[...pending, ...doneList]}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <Swipeable
                ref={ref => {
                  if (ref) {
                    openSwipeRef.current?.close()
                    openSwipeRef.current = ref
                  }
                }}
                renderRightActions={renderRightActions(item.id, item.text)}
                overshootRight={false}
                friction={2}
                rightThreshold={40}
              >
                <View style={[s.row, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
                  <CheckBtn done={item.done} onPress={() => handleToggle(item.id, item.done)} />
                  <TouchableOpacity style={s.touchText} onPress={() => openEdit(item)} activeOpacity={0.6}>
                    <Text
                      style={[s.rowText, { color: item.done ? theme.textTertiary : theme.text }]}
                      numberOfLines={3}
                    >
                      {item.text}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Swipeable>
            )}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Feather name="edit-3" size={28} color={theme.textTertiary} />
                <Text style={[s.emptyTitle, { color: theme.textSecondary }]}>暂无任务</Text>
                <Text style={[s.emptySub, { color: theme.textTertiary }]}>点击右上角 + 添加</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>

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
    </View>
  )
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32, marginRight: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chkOut: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  chkFill: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#6c7dff',
    alignItems: 'center', justifyContent: 'center',
  },
  touchText: { flex: 1, paddingVertical: 2 },
  rowText: { fontSize: 15, lineHeight: 22 },
  swipeActions: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  copyBtn: {
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
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
