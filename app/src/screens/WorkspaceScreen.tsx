import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import type { Session } from '@opencode-ai/sdk'
import type { Agent, ServerEntry } from '../types'
import { storageKey } from '../utils/storage'

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
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await client.listSessionsByDirectory(directory)
      const filtered = list.filter((s: any) => !s.parentID)
      filtered.sort((a: any, b: any) => (b.time?.created || 0) - (a.time?.created || 0))
      setSessions(filtered)
    } catch {}
    setLoading(false)
  }, [directory, client])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!directory) return
    client.getAgents(directory).then((list) => {
      const filtered = list.filter((a) => a.mode !== 'subagent' && !a.hidden)
      setAgents(filtered)
    }).catch(() => {})
  }, [directory, client])

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

  const enterSelection = (id: string) => {
    setSelecting(true)
    setSelectedIds(new Set([id]))
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

  const handleDelete = () => {
    const count = selectedIds.size
    if (count === 0) return
    Alert.alert(
      '删除会话',
      `确定要删除选中的 ${count} 个会话吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const ids = [...selectedIds]
            try {
              await Promise.all(ids.map((id) => client.deleteSession(id)))
            } catch {}
            cancelSelection()
            load()
          },
        },
      ]
    )
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
    Alert.alert(item.title || '会话', undefined, [
      {
        text: '重命名',
        onPress: () => {
          setRenamingId(item.id)
          setRenameValue(item.title || '')
        },
      },
      {
        text: '选择',
        onPress: () => enterSelection(item.id),
      },
      { text: '取消', style: 'cancel' },
    ])
  }

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null)
      return
    }
    try {
      await client.renameSession(renamingId, renameValue.trim())
      setRenamingId(null)
      load()
    } catch {
      setRenamingId(null)
    }
  }, [renamingId, renameValue, client, load])

  const selectedCount = selectedIds.size

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {selecting ? (
          <>
            <TouchableOpacity onPress={cancelSelection}>
              <Text style={[styles.action, { color: theme.accent }]}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>已选 {selectedCount} 项</Text>
            <TouchableOpacity onPress={handleDelete} disabled={selectedCount === 0}>
              <Text style={[styles.action, { color: selectedCount > 0 ? theme.error : theme.textTertiary }]}>删除</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={[styles.back, { color: theme.accent }]}>← 工作区</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{name}</Text>
            <View style={{ width: 60 }} />
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
            const isRenaming = renamingId === item.id
            return (
              <TouchableOpacity
                style={[styles.sessionItem, { borderBottomColor: theme.border }, (isSelected || isRenaming) && { backgroundColor: theme.surface }]}
                onPress={() => handlePress(item)}
                onLongPress={() => handleLongPress(item)}
              >
                <View style={styles.sessionRow}>
                  {selecting && (
                    <View style={[styles.checkbox, isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  )}
                  {isRenaming ? (
                    <TextInput
                      style={[styles.sessionTitleInput, { color: theme.text, borderBottomColor: theme.accent }]}
                      value={renameValue}
                      onChangeText={setRenameValue}
                      onSubmitEditing={handleRenameSubmit}
                      onBlur={handleRenameSubmit}
                      autoFocus
                      selectTextOnFocus
                    />
                  ) : (
                    <Text style={[styles.sessionTitle, { color: theme.text }]} numberOfLines={1}>
                      💬 {item.title || item.id.slice(0, 8)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
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
        <Text style={styles.fabText}>{creating ? '...' : '＋'}</Text>
      </TouchableOpacity>
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
  back: { fontSize: 16 },
  action: { fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  pathBar: { paddingHorizontal: 16, paddingVertical: 10 },
  pathText: { fontSize: 12 },
  sessionItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  sessionRow: { flexDirection: 'row', alignItems: 'center' },
  sessionTitle: { fontSize: 15, flex: 1 },
  sessionTitleInput: { fontSize: 15, flex: 1, borderBottomWidth: 1, paddingVertical: 0 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#999', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
})
