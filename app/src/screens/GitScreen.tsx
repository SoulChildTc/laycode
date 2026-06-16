import React, { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import type { GitStatus, GitStatusItem } from '../types'
import FileRow from '../components/FileRow'
import SectionHeader from '../components/SectionHeader'
import CommitBar from '../components/CommitBar'
import { InputModal, InputField } from '../components/InputModal'

interface Props {
  route: any
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
}

export default function GitScreen({ route, navigation, themeMode, client }: Props) {
  const { directory } = route.params || {}
  const theme = getTheme(themeMode)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [commitModalVisible, setCommitModalVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!directory) return
    setLoading(true)
    setError(null)
    try {
      const s = await client.gitStatus(directory)
      setStatus(s)
    } catch (err: any) {
      if (err.message === 'git not found') {
        setError('未检测到 Git，请先安装 Git')
      } else {
        setError(err.message || '加载失败')
      }
    } finally {
      setLoading(false)
    }
  }, [directory, client])

  useFocusEffect(
    useCallback(() => {
      loadStatus()
    }, [loadStatus])
  )

  const handleInit = useCallback(async () => {
    if (!directory) return
    setInitializing(true)
    setError(null)
    try {
      await client.gitInit(directory)
      await loadStatus()
    } catch (err: any) {
      setError(err.message || '初始化失败')
    } finally {
      setInitializing(false)
    }
  }, [directory, client, loadStatus])

  const handleStage = useCallback(async (file?: string) => {
    if (!directory) return
    try {
      await client.gitStage(directory, file)
      await loadStatus()
    } catch (err: any) {
      setError(err.message || '暂存失败')
    }
  }, [directory, client, loadStatus])

  const handleUnstage = useCallback(async (file?: string) => {
    if (!directory) return
    try {
      await client.gitUnstage(directory, file)
      await loadStatus()
    } catch (err: any) {
      setError(err.message || '取消暂存失败')
    }
  }, [directory, client, loadStatus])

  const handleDiscard = useCallback(async (file?: string) => {
    if (!directory) return
    try {
      await client.gitDiscard(directory, file)
      await loadStatus()
    } catch (err: any) {
      setError(err.message || '放弃更改失败')
    }
  }, [directory, client, loadStatus])

  const handleCommit = useCallback(async () => {
    if (!directory || !commitMsg.trim() || committing) return
    setCommitting(true)
    setError(null)
    try {
      await client.gitCommit(directory, commitMsg.trim())
      setCommitMsg('')
      setCommitModalVisible(false)
      await loadStatus()
    } catch (err: any) {
      setError(err.message || '提交失败')
    } finally {
      setCommitting(false)
    }
  }, [directory, commitMsg, committing, client, loadStatus])

  const handleFilePress = useCallback((item: GitStatusItem, isStaged: boolean) => {
    navigation.push('Diff', {
      directory,
      file: item.path,
      cached: isStaged,
    })
  }, [navigation, directory])

  if (error === 'git not found') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
          <Feather name="arrow-left" size={22} color={theme.accent} onPress={() => navigation.goBack()} style={styles.backBtn} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Git</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Feather name="alert-circle" size={40} color={theme.warning} />
          <Text style={[styles.emptyText, { color: theme.text }]}>未检测到 Git</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>请先安装 Git</Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.accent }]} onPress={() => navigation.goBack()}>
            <Text style={styles.emptyBtnText}>返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (status?.notRepo) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
          <Feather name="arrow-left" size={22} color={theme.accent} onPress={() => navigation.goBack()} style={styles.backBtn} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Git</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.emptyState}>
          <Feather name="git-branch" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.text }]}>当前项目尚未初始化 Git 仓库</Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: theme.accent, opacity: initializing ? 0.6 : 1 }]}
            onPress={handleInit}
            disabled={initializing}
          >
            {initializing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.emptyBtnText}>初始化仓库</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.emptyBtnSecondary, { borderColor: theme.border }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.emptyBtnTextSecondary, { color: theme.textSecondary }]}>返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const totalChanges = (status?.staged?.length || 0) + (status?.unstaged?.length || 0)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <Feather name="arrow-left" size={22} color={theme.accent} onPress={() => navigation.goBack()} style={styles.backBtn} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>Git</Text>
        <TouchableOpacity onPress={loadStatus} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <>
          {error && (
            <View style={[styles.errorBar, { backgroundColor: '#e74c3c20', borderBottomColor: '#e74c3c40' }]}>
              <Feather name="alert-triangle" size={14} color="#e74c3c" />
              <Text style={[styles.errorText, { color: '#e74c3c' }]}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}><Feather name="x" size={14} color="#e74c3c" /></TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.list} contentContainerStyle={totalChanges === 0 ? styles.emptyList : undefined}>
            {totalChanges === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="check-circle" size={40} color={theme.accent} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>没有变更</Text>
              </View>
            ) : (
              <>
                {status!.staged.length > 0 && (
                  <SectionHeader title="已暂存的变更" count={status!.staged.length} theme={theme} actionLabel="全部取消" onAction={() => handleUnstage()}>
                    {status!.staged.map((item, i) => (
                      <FileRow
                        key={`staged-${item.path}-${i}`}
                        item={item}
                        staged
                        theme={theme}
                        onPress={() => handleFilePress(item, true)}
                        onStage={() => {}}
                        onUnstage={() => handleUnstage(item.path)}
                      />
                    ))}
                  </SectionHeader>
                )}

                {status!.unstaged.length > 0 && (
                  <SectionHeader title="变更" count={status!.unstaged.length} theme={theme}
                    actionLabel="全部暂存" onAction={() => handleStage()}
                    actionLabel2="全部放弃" onAction2={() => handleDiscard()}>
                    {status!.unstaged.map((item, i) => (
                      <FileRow
                        key={`unstaged-${item.path}-${i}`}
                        item={item}
                        staged={false}
                        theme={theme}
                        onPress={() => handleFilePress(item, false)}
                        onStage={() => handleStage(item.path)}
                        onUnstage={() => {}}
                        onDiscard={() => handleDiscard(item.path)}
                      />
                    ))}
                  </SectionHeader>
                )}
              </>
            )}
          </ScrollView>

          <CommitBar onPress={() => setCommitModalVisible(true)} disabled={!status || status.staged.length === 0} theme={theme} />

          <InputModal
            visible={commitModalVisible}
            title="提交更改"
            theme={theme}
            onCancel={() => setCommitModalVisible(false)}
            onSave={handleCommit}
            saveDisabled={!commitMsg.trim() || committing}
            saveLabel="提交"
            cancelLabel="取消"
          >
            <InputField
              value={commitMsg}
              onChangeText={setCommitMsg}
              placeholder="输入提交信息..."
              theme={theme}
              multiline
            />
          </InputModal>
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
  refreshBtn: { padding: 4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  emptyList: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontWeight: '500', textAlign: 'center' },
  emptyHint: { fontSize: 14, textAlign: 'center' },
  emptyBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyBtnSecondary: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  emptyBtnTextSecondary: { fontSize: 15, fontWeight: '500' },
  errorBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500' },
})