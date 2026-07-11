import React, { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Feather } from '@expo/vector-icons'
import TerminalCard from '../components/TerminalCard'
import { getKnownDirs, addKnownDir } from '../hooks/useTerminalStore'
import { usePTYEvents } from '../hooks/usePTYEvents'
import type { LayCodeClient } from '../api/client'
import type { ServerEntry } from '../types'
import { getTheme, type ThemeMode } from '../theme'

interface Props {
  navigation: any
  route: { params?: { directory?: string } }
  themeMode: ThemeMode
  client: LayCodeClient
  config: ServerEntry
}

type GroupedPTY = {
  directory: string
  ptyID: string
}

export default function TerminalListScreen({ navigation, route, themeMode, client, config }: Props) {
  var theme = getTheme(themeMode)
  var filterDir: string | undefined = route.params?.directory
  var host = config?.host || 'localhost'
  var port = config?.port || 8079
  var eventWsUrl = 'ws://' + host + ':' + port + '/event'
  var serverId = config?.id || 'default'
  var [groups, setGroups] = useState<GroupedPTY[]>([])
  var [loading, setLoading] = useState(true)
  var [showDirPicker, setShowDirPicker] = useState(false)
  var [knownDirList, setKnownDirList] = useState<string[]>([])

usePTYEvents(eventWsUrl, serverId, {
    onDeleted: function(id) {
      setGroups(function(prev) { return prev.filter(function(g) { return g.ptyID !== id }) })
    },
  })

  useFocusEffect(useCallback(function() {
    loadTerminals()
    getKnownDirs(serverId).then(setKnownDirList).catch(function() {})
  }, [filterDir]))

  async function loadTerminals() {
    setLoading(true)
    try {
      var result: GroupedPTY[] = []

      if (filterDir) {
        var ptys: any[] = await client.listPty(filterDir) || []
        await addKnownDir(serverId, filterDir)
        ptys.forEach(function(p: any) {
          result.push({ directory: filterDir!, ptyID: p.id })
        })
      } else {
        var dirs = await getKnownDirs(serverId)
        for (var dir of dirs) {
          var list: any[] = await client.listPty(dir) || []
          list.forEach(function(p: any) {
            result.push({ directory: dir, ptyID: p.id })
          })
        }
      }

      setGroups(result)
    } catch (err: any) {
      console.log('[TerminalList] load error:', err?.message)
    }
    setLoading(false)
  }

  var dirs = [...new Set(groups.map(function(g) { return g.directory }))]

  var grouped = dirs.map(function(dir) {
    return { dir: dir, terminals: groups.filter(function(g) { return g.directory === dir }) }
  })

  // 新建终端时可选的工作区：已打开过的工作区(knownDirs) ∪ 已有终端的目录，去重
  var pickerWorkspaces: string[] = [...new Set([...knownDirList, ...dirs])]

  function handlePress(ptyID: string, dir: string) {
    navigation.push('Terminal', { ptyID: ptyID, directory: dir })
  }

  async function handleClose(ptyID: string) {
    Alert.alert('Close Terminal', 'Remove this terminal session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close',
        style: 'destructive',
        onPress: async function() {
          var match = groups.find(function(g) { return g.ptyID === ptyID })
          await client.removePty(ptyID, match?.directory)
          loadTerminals()
        },
      },
    ])
  }

  function handleNew() {
    if (filterDir) {
      navigation.push('Terminal', { directory: filterDir })
    } else {
      setShowDirPicker(true)
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={function() { navigation.goBack() }} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Terminal</Text>
        <TouchableOpacity style={styles.newBtn} onPress={handleNew}>
          <Feather name="plus" size={20} color={theme.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.center}>
          <Feather name="terminal" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.textTertiary }]}>No terminals</Text>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
            {filterDir ? 'Tap + to create one' : 'Open a workspace and start a terminal'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={function(item) { return item.dir }}
          contentContainerStyle={styles.list}
          renderItem={function({ item: group }) {
            return (
              <View style={styles.group}>
                {!filterDir && (
                  <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>
                    {group.dir.split('/').pop() || group.dir}
                  </Text>
                )}
                {group.terminals.map(function(t) {
                  return (
                    <TerminalCard
                      key={t.ptyID}
                      ptyID={t.ptyID}
                      directory={t.directory}
                      theme={theme}
                      onPress={function(id) { handlePress(id, t.directory) }}
                      onClose={handleClose}
                    />
                  )
                })}
              </View>
            )
          }}
        />
      )}

      <Modal visible={showDirPicker} transparent animationType="fade" onRequestClose={() => setShowDirPicker(false)}>
        <TouchableOpacity style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }} activeOpacity={1} onPress={() => setShowDirPicker(false)}>
          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, width: '80%', maxHeight: 400 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>选择工作区</Text>
            {pickerWorkspaces.length > 0 ? (
              <FlatList
                data={pickerWorkspaces}
                keyExtractor={function(d) { return d }}
                renderItem={function({ item: dir }) {
                  return (
                    <TouchableOpacity
                      style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.border }}
                      onPress={function() { setShowDirPicker(false); navigation.push('Terminal', { directory: dir }) }}
                    >
                      <Text style={{ color: theme.text, fontSize: 14 }}>{dir.split('/').pop() || dir}</Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 2 }}>{dir}</Text>
                    </TouchableOpacity>
                  )
                }}
              />
            ) : (
              <Text style={{ color: theme.textTertiary, fontSize: 13, textAlign: 'center', padding: 20 }}>
                还没有工作区。先打开一个工作区或会话。
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 44,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4, marginRight: 4 },
  title: { fontSize: 17, fontWeight: '600', flex: 1 },
  newBtn: { padding: 8 },
  list: { padding: 16 },
  group: { marginBottom: 8 },
  groupTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptySub: { fontSize: 13, textAlign: 'center' },
})
