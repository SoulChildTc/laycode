import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, Platform, ActivityIndicator, TouchableOpacity } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'

interface Props {
  route: any
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
}

export default function DiffScreen({ route, navigation, themeMode, client }: Props) {
  const { directory, file, cached } = route.params || {}
  const filename = file || ''
  const isCached = !!cached
  const theme = getTheme(themeMode)
  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionDone, setActionDone] = useState<string | null>(null)

  useEffect(() => {
    if (!directory || !file) return
    setLoading(true)
    setError(null)
    client.gitDiff(directory, file, cached)
      .then(setDiff)
      .catch((err: any) => setError(err.message || '加载 diff 失败'))
      .finally(() => setLoading(false))
  }, [directory, file, cached, client])

  const handleStage = useCallback(async () => {
    if (!directory || !file || actionLoading) return
    setActionLoading(true)
    try {
      await client.gitStage(directory, file)
      setActionDone('staged')
      setTimeout(() => setActionDone(null), 1500)
    } catch (err: any) {
      setError(err.message || '暂存失败')
    } finally {
      setActionLoading(false)
    }
  }, [directory, file, actionLoading, client])

  const handleUnstage = useCallback(async () => {
    if (!directory || !file || actionLoading) return
    setActionLoading(true)
    try {
      await client.gitUnstage(directory, file)
      setActionDone('unstaged')
      setTimeout(() => setActionDone(null), 1500)
    } catch (err: any) {
      setError(err.message || '取消暂存失败')
    } finally {
      setActionLoading(false)
    }
  }, [directory, file, actionLoading, client])

  const handleDiscard = useCallback(async () => {
    if (!directory || !file || actionLoading) return
    setActionLoading(true)
    try {
      await client.gitDiscard(directory, file)
      setActionDone('discarded')
      setTimeout(() => setActionDone(null), 1500)
    } catch (err: any) {
      setError(err.message || '放弃更改失败')
    } finally {
      setActionLoading(false)
    }
  }, [directory, file, actionLoading, client])

  const lines = diff.split('\n')

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <Feather name="arrow-left" size={22} color={theme.accent} onPress={() => navigation.goBack()} style={styles.backBtn} />
        <Text style={[styles.filename, { color: theme.text }]} numberOfLines={1}>{filename}</Text>
        {isCached ? (
          <TouchableOpacity onPress={handleUnstage} disabled={!!actionDone} style={[styles.actionBtn, { backgroundColor: theme.accent + '20' }]}>
            <Text style={[styles.actionText, { color: actionDone === 'unstaged' ? '#2ecc71' : theme.accent }]}>
              {actionDone === 'unstaged' ? '已取消' : '放弃暂存'}
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity onPress={handleDiscard} disabled={!!actionDone} style={[styles.actionBtn, { backgroundColor: '#e74c3c20' }]}>
              <Text style={[styles.actionText, { color: '#e74c3c' }]}>
                {actionDone === 'discarded' ? '已放弃' : '放弃更改'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleStage} disabled={!!actionDone} style={[styles.actionBtn, { backgroundColor: theme.accent + '20' }]}>
              <Text style={[styles.actionText, { color: actionDone === 'staged' ? '#2ecc71' : theme.accent }]}>
                {actionDone === 'staged' ? '已暂存' : '暂存更改'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={32} color={theme.warning} />
          <Text style={[styles.errorText, { color: theme.warning }]}>{error}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} horizontal showsHorizontalScrollIndicator={false}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {lines.length === 0 || (lines.length === 1 && lines[0] === '') ? (
              <View style={styles.empty}>
                <Feather name="file-text" size={32} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.textTertiary }]}>无差异</Text>
              </View>
            ) : (
              lines.map((line: string, i: number) => {
                let bg = 'transparent'
                let prefix = ' '
                if (line.startsWith('+')) { bg = '#2ecc7120'; prefix = '+' }
                else if (line.startsWith('-')) { bg = '#e74c3c20'; prefix = '−' }
                else if (line.startsWith('@@')) { bg = theme.border + '60'; prefix = '@' }

                return (
                  <View key={i} style={[styles.line, { backgroundColor: bg }]}>
                    <Text style={[styles.lineNum, { color: theme.textTertiary }]}>{i + 1}</Text>
                    <Text style={[styles.linePrefix, { color: prefix === '+' ? '#2ecc71' : prefix === '−' ? '#e74c3c' : prefix === '@' ? theme.accent : 'transparent' }]}>{prefix}</Text>
                    <Text style={[styles.lineText, { color: theme.text }]}>{line}</Text>
                  </View>
                )
              })
            )}
          </ScrollView>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4, marginRight: 8 },
  filename: { flex: 1, fontSize: 15, fontWeight: '600' },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, borderRadius: 6 },
  actionText: { fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, fontWeight: '500' },
  line: { flexDirection: 'row', paddingVertical: 1, paddingHorizontal: 8, minHeight: 20 },
  lineNum: { width: 40, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right', marginRight: 8 },
  linePrefix: { width: 16, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center' },
  lineText: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 15 },
})