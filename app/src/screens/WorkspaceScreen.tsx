import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import type { Session } from '@opencode-ai/sdk'

interface Props {
  route: any
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
}

export default function WorkspaceScreen({ route, navigation, client, themeMode }: Props) {
  const { directory, name } = route.params || {}
  const theme = getTheme(themeMode)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const list = await client.listSessionsByDirectory(directory)
      list.sort((a: any, b: any) => (b.time?.created || 0) - (a.time?.created || 0))
      setSessions(list)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [directory])

  const createSession = async () => {
    setCreating(true)
    try {
      const session = await client.createSessionInDirectory(directory)
      navigation.replace('Session', { projectId: session.id, sessionId: session.id })
    } catch {}
    setCreating(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: theme.accent }]}>← 工作区</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{name}</Text>
        <View style={{ width: 60 }} />
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
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.sessionItem, { borderBottomColor: theme.border }]}
              onPress={() => navigation.navigate('Session', { projectId: item.id, sessionId: item.id })}
            >
              <Text style={[styles.sessionTitle, { color: theme.text }]} numberOfLines={1}>
                💬 {item.title || item.id.slice(0, 8)}
              </Text>
            </TouchableOpacity>
          )}
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
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  pathBar: { paddingHorizontal: 16, paddingVertical: 10 },
  pathText: { fontSize: 12 },
  sessionItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  sessionTitle: { fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
})