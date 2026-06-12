import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal, Animated,
  LayoutAnimation, Platform, UIManager, Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { Todo } from '../types'

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
  const [showAdd, setShowAdd] = useState(false)
  const [addText, setAddText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [keyboardH, setKeyboardH] = useState(0)
  const inputRef = useRef<TextInput>(null)
  const editRef = useRef<TextInput>(null)

  const load = useCallback(async () => {
    try { setItems(await api.getTodos(directory)) } catch {}
    setLoading(false)
  }, [api, directory])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', e => setKeyboardH(e.endCoordinates.height))
    const onHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardH(0))
    return () => { onShow.remove(); onHide.remove() }
  }, [])

  useEffect(() => {
    if (showAdd) setTimeout(() => inputRef.current?.focus(), 300)
  }, [showAdd])

  const animCfg = { duration: 220, create: { type: 'easeInEaseOut' as const, property: 'opacity' as const }, update: { type: 'spring' as const, springDamping: 0.85 }, delete: { type: 'easeInEaseOut' as const, duration: 160 } }

  const handleAdd = async () => {
    const trimmed = addText.trim()
    if (!trimmed) return
    setShowAdd(false)
    setAddText('')
    LayoutAnimation.configureNext(animCfg)
    try {
      const todo = await api.createTodo(directory, trimmed)
      if (todo) setItems(prev => [...prev, todo])
    } catch {}
  }

  const handleToggle = async (id: string, done: boolean) => {
    LayoutAnimation.configureNext(animCfg)
    setItems(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t))
    try { await api.updateTodo(directory, id, { done: !done }) } catch {}
  }

  const handleDelete = (id: string) => {
    Alert.alert('删除', '确定删除这条任务？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        LayoutAnimation.configureNext(animCfg)
        setItems(prev => prev.filter(t => t.id !== id))
        try { await api.deleteTodo(directory, id) } catch {}
      }},
    ])
  }

  const startEdit = (todo: Todo) => {
    setEditId(todo.id)
    setEditVal(todo.text)
    setTimeout(() => editRef.current?.focus(), 150)
  }

  const saveEdit = async () => {
    if (!editId) return
    const trimmed = editVal.trim()
    if (!trimmed) { setEditId(null); return }
    const id = editId
    setEditId(null)
    setEditVal('')
    setItems(prev => prev.map(t => t.id === id ? { ...t, text: trimmed } : t))
    try { await api.updateTodo(directory, id, { text: trimmed }) } catch {}
  }

  const handleItemPress = (item: Todo) => {
    if (editId === item.id) return
    Alert.alert(item.text, undefined, [
      { text: '编辑', onPress: () => startEdit(item) },
      { text: '删除', style: 'destructive', onPress: () => handleDelete(item.id) },
      { text: '取消', style: 'cancel' },
    ])
  }

  const pending = items.filter(t => !t.done)
  const doneList = items.filter(t => t.done)

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={s.backBtn}>
            <Feather name="chevron-left" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>{name}</Text>
            <Text style={[s.subtitle, { color: theme.textTertiary }]}>{pending.length} 未完成</Text>
          </View>
          <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.addBtn, { backgroundColor: theme.accent }]}>
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
            renderItem={({ item }) => {
              const editing = editId === item.id
              return (
                <View style={[s.row, { borderBottomColor: theme.border }]}>
                  <CheckBtn done={item.done} onPress={() => handleToggle(item.id, item.done)} />
                  {editing ? (
                    <TextInput
                      ref={editRef}
                      value={editVal}
                      onChangeText={setEditVal}
                      onSubmitEditing={saveEdit}
                      onBlur={saveEdit}
                      returnKeyType="done"
                      style={[s.editInput, { color: theme.text, borderBottomColor: theme.accent }]}
                    />
                  ) : (
                    <TouchableOpacity style={s.touchText} onPress={() => handleItemPress(item)} activeOpacity={0.6}>
                      <Text
                        style={[s.rowText, { color: item.done ? theme.textTertiary : theme.text }]}
                        numberOfLines={3}
                      >
                        {item.text}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            }}
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

      {showAdd && (
        <Modal visible transparent animationType="none" onRequestClose={() => setShowAdd(false)}>
          <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)', paddingBottom: keyboardH }]}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAdd(false)} />
            <View style={[s.modalSheet, { backgroundColor: theme.surface }]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: theme.text }]}>新任务</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={10}>
                  <Feather name="x" size={20} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>
              <TextInput
                ref={inputRef}
                value={addText}
                onChangeText={setAddText}
                placeholder="做什么？"
                placeholderTextColor={theme.textTertiary}
                onSubmitEditing={handleAdd}
                returnKeyType="done"
                style={[s.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              />
              <View style={s.modalActions}>
                <TouchableOpacity onPress={() => setShowAdd(false)} style={s.modalCancel}>
                  <Text style={[s.modalCancelText, { color: theme.textSecondary }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAdd} style={[s.modalConfirm, { backgroundColor: addText.trim() ? theme.accent : theme.border }]}>
                  <Text style={[s.modalConfirmText, { color: addText.trim() ? '#fff' : theme.textTertiary }]}>添加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  editInput: {
    flex: 1, fontSize: 15, lineHeight: 22,
    padding: 0, borderBottomWidth: 1,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalInput: {
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10,
    marginTop: 16,
  },
  modalCancel: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  modalCancelText: { fontSize: 15, fontWeight: '600' },
  modalConfirm: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  modalConfirmText: { fontSize: 15, fontWeight: '700' },
})
