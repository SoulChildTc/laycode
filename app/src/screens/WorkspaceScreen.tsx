import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, LayoutAnimation, Platform, UIManager } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import type { Session } from '@opencode-ai/sdk'
import type { Agent, ServerEntry } from '../types'
import { storageKey } from '../utils/storage'
import { InputModal, InputField, MetaRow } from '../components/InputModal'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Props {
  route: any
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
  config: ServerEntry
}

export default function WorkspaceScreen({ route, navigation, client, themeMode, config }: Props) {
  const { directory, name } = route.params || {}
  const theme = getTheme(themeMode)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [agents, setAgents] = useState<Agent[]>([])
  const [renamingSession, setRenamingSession] = useState<Session | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const openSwipeRef = useRef<Swipeable | null>(null)
  const toastAnim = useRef(new Animated.Value(0)).current
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await client.listSessionsByDirectory(directory)
      const filtered = list.filter((s: any) => !s.parentID)
      filtered.sort((a: any, b: any) => (b.time?.updated || b.time?.created || 0) - (a.time?.updated || a.time?.created || 0))
      setSessions(filtered)
    } catch {}
    setLoading(false)
  }, [directory, client])

  useFocusEffect(useCallback(() => { load() }, [load]))

  useEffect(() => {
    if (!directory) return
    client.getAgents(directory).then((list) => {
      const filtered = list.filter((a) => a.mode !== 'subagent' && !a.hidden)
      if (filtered.length > 0) {
        setAgents(filtered)
      } else {
        client.getAgents().then((list2) => {
          setAgents(list2.filter((a) => a.mode !== 'subagent' && !a.hidden))
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [directory, client])

  const animCfg = { duration: 220, create: { type: 'easeInEaseOut' as const, property: 'opacity' as const }, update: { type: 'spring' as const, springDamping: 0.85 }, delete: { type: 'easeInEaseOut' as const, duration: 160 } }

  const createSession = async () => {
    setCreating(true)
    try {
      let savedAgent: string | undefined
      try {
        const raw = await AsyncStorage.getItem(storageKey(config.id, 'current-agent'))
        if (raw) savedAgent = raw
      } catch {}
      const session = await client.createSessionInDirectory(directory, savedAgent)
      navigation.replace('Session', { projectId: session.id, sessionId: session.id, agents: JSON.stringify(agents), defaultAgent: savedAgent })
    } catch {}
    setCreating(false)
  }

  const enterSelection = (id?: string) => {
    setSelecting(true)
    setSelectedIds(id ? new Set([id]) : new Set())
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cancelSelection = () => {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  const handleDelete = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    LayoutAnimation.configureNext(animCfg)
    setSessions(prev => prev.filter(s => !selectedIds.has(s.id)))
    cancelSelection()
    try {
      await Promise.all(ids.map((id) => client.deleteSession(id)))
    } catch {}
    load()
  }

  const handleDeleteSingle = async (id: string) => {
    LayoutAnimation.configureNext(animCfg)
    setSessions(prev => prev.filter(s => s.id !== id))
    try { await client.deleteSession(id) } catch {}
  }

  const handleCopyTitle = async (title: string) => {
    await Clipboard.setStringAsync(title)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastAnim.setValue(0)
    Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start()
    }, 1200)
  }

  const handlePress = (item: Session) => {
    if (selecting) {
      toggleSelection(item.id)
    } else {
      navigation.navigate('Session', {
        projectId: item.id,
        sessionId: item.id,
        title: item.title || item.id.slice(0, 8),
        agents: JSON.stringify(agents),
      })
    }
  }

  const handleLongPress = (item: Session) => {
    if (selecting) return
    enterSelection(item.id)
  }

  const saveRename = async () => {
    if (!renamingSession) return
    const trimmed = renameValue.trim()
    const id = renamingSession.id
    setRenamingSession(null)
    setRenameValue('')
    if (!trimmed || trimmed === renamingSession.title) return
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title: trimmed } : s))
    try { await client.renameSession(id, trimmed) } catch {}
  }

  const cancelRename = () => {
    setRenamingSession(null)
    setRenameValue('')
  }

  const renderRightActions = (item: Session) => (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-228, 0],
      outputRange: [1, 0.6],
      extrapolate: 'clamp',
    })
    return (
      <Animated.View style={[styles.swipeActions, { transform: [{ scale }] }]}>
        <TouchableOpacity
          style={styles.renameBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            setRenamingSession(item)
            setRenameValue(item.title || '')
          }}
        >
          <Feather name="edit-2" size={18} color="#fff" />
          <Text style={styles.swipeBtnText}>重命名</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            handleCopyTitle(item.title || item.id.slice(0, 8))
          }}
        >
          <Feather name="copy" size={18} color="#fff" />
          <Text style={styles.swipeBtnText}>复制</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => {
            openSwipeRef.current?.close()
            handleDeleteSingle(item.id)
          }}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.swipeBtnText}>删除</Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  const selectedCount = selectedIds.size

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {selecting ? (
          <>
            <TouchableOpacity onPress={cancelSelection} hitSlop={10}>
              <Text style={[styles.action, { color: theme.accent }]}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>已选 {selectedCount} 项</Text>
            <TouchableOpacity onPress={handleDelete} disabled={selectedCount === 0} hitSlop={10}>
              <Text style={[styles.action, { color: selectedCount > 0 ? '#ff3b30' : theme.textTertiary }]}>删除({selectedCount})</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
              <Feather name="chevron-left" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{name}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.push('TerminalList', { directory })} hitSlop={10} style={{ padding: 4 }}>
              <Feather name="terminal" size={20} color={theme.accent} />
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity style={[styles.pathBar, { backgroundColor: theme.surface }]}>
        <Text style={[styles.pathText, { color: theme.textSecondary }]} numberOfLines={1}>{directory}</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isSelected = selecting && selectedIds.has(item.id)
            return (
              <Swipeable
                ref={ref => {
                  if (ref) {
                    openSwipeRef.current?.close()
                    openSwipeRef.current = ref
                  }
                }}
                renderRightActions={selecting ? undefined : renderRightActions(item)}
                overshootRight={false}
                friction={2}
                rightThreshold={40}
                enabled={!selecting}
              >
                <TouchableOpacity
                  style={[styles.sessionItem, { borderBottomColor: theme.border }, isSelected && { backgroundColor: theme.surface }]}
                  onPress={() => handlePress(item)}
                  onLongPress={() => handleLongPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sessionRow}>
                    {selecting && (
                      <View style={[styles.checkbox, isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                        {isSelected && <Feather name="check" size={14} color="#fff" />}
                      </View>
                    )}
                    <Text style={[styles.sessionTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.title || item.id.slice(0, 8)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Swipeable>
            )
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>还没有会话</Text>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accent }, creating && { opacity: 0.6 }]}
        onPress={createSession}
        disabled={creating}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <InputModal
        visible={renamingSession !== null}
        title="重命名"
        theme={theme}
        onCancel={cancelRename}
        onSave={saveRename}
      >
        <InputField
          value={renameValue}
          onChangeText={setRenameValue}
          placeholder="输入会话标题..."
          theme={theme}
          onSubmitEditing={saveRename}
        />
        {renamingSession && (
          <MetaRow icon="hash" text={renamingSession.id.slice(0, 8)} theme={theme} />
        )}
      </InputModal>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            opacity: toastAnim,
            transform: [{
              translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
            }],
          },
        ]}
      >
        <Feather name="check-circle" size={16} color="#fff" />
        <Text style={styles.toastText}>已复制</Text>
      </Animated.View>
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
  backBtn: { width: 32, marginRight: 8 },
  action: { fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  pathBar: { paddingHorizontal: 16, paddingVertical: 10 },
  pathText: { fontSize: 12 },
  sessionItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  sessionRow: { flexDirection: 'row', alignItems: 'center' },
  sessionTitle: { fontSize: 15, flex: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#999', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  swipeActions: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  renameBtn: {
    backgroundColor: '#6c7dff',
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
  },
  copyBtn: {
    backgroundColor: '#5856d6',
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
  empty: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
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
