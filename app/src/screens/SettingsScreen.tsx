import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { ServerEntry } from '../types'
import { useServers } from '../hooks/useServers'

interface Props {
  navigation: any
  themeMode: ThemeMode
  onThemeToggle: () => void
  config: ServerEntry | null
  client: LayCodeClient | null
  onDisconnect: () => void
  onConnect: (config: ServerEntry) => void
}

export default function SettingsScreen({ navigation, themeMode, onThemeToggle, config, client, onDisconnect, onConnect }: Props) {
  const theme = getTheme(themeMode)
  const isDark = themeMode === 'dark'
  const { servers, add, update, remove, connect, reload } = useServers()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8079')
  const [token, setToken] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    reload()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setHost('')
    setPort('8079')
    setToken('')
    setShowForm(false)
  }

  const handleEdit = (s: ServerEntry) => {
    setEditingId(s.id)
    setName(s.name)
    setHost(s.host)
    setPort(String(s.port))
    setToken(s.token)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!host.trim()) {
      Alert.alert('错误', '请输入服务器地址')
      return
    }

    const entry = {
      name: name.trim() || host.trim(),
      host: host.trim(),
      port: parseInt(port, 10) || 8079,
      token: token.trim() || 'laycode',
    }

    if (editingId) {
      await update(editingId, entry)
    } else {
      await add(entry)
    }
    resetForm()
  }

  const handleDelete = (id: string) => {
    Alert.alert('删除桥接', '确定要删除这个桥接服务器吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => remove(id) },
    ])
  }

  const handleSwitch = async (s: ServerEntry) => {
    const ok = await connect(s)
    if (ok) {
      onConnect(s)
    } else {
      Alert.alert('连接失败', `无法连接到 ${s.name}`)
    }
  }

  const handleRestart = async () => {
    if (!client || restarting) return
    Alert.alert('重启 OpenCode', '确定要重启 OpenCode 服务吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '重启',
        onPress: async () => {
          setRestarting(true)
          try {
            const result = await client.restartOpencode()
            if (result.status === 'ok') {
              Alert.alert('已重启', 'OpenCode 服务已重新启动')
            } else {
              Alert.alert('重启失败', result.message || result.error || '未知错误')
            }
          } catch (err: any) {
            Alert.alert('重启失败', err.message)
          } finally {
            setRestarting(false)
          }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.pageTitle, { color: theme.text }]}>设置</Text>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Connection section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>当前连接</Text>
          {config ? (
            <View style={styles.row}>
              <Feather name="server" size={16} color={theme.accent} />
              <Text style={[styles.rowValue, { color: theme.text, marginLeft: 8 }]}>
                {config.name || `${config.host}:${config.port}`}
              </Text>
              <Text style={[styles.rowHint, { color: theme.textTertiary }]}>{config.host}:{config.port}</Text>
            </View>
          ) : (
            <Text style={[styles.rowHint, { color: theme.textTertiary }]}>未连接</Text>
          )}
          <TouchableOpacity style={styles.row} onPress={onDisconnect}>
            <Feather name="log-out" size={16} color={theme.error} />
            <Text style={[styles.rowLabel, { color: theme.error, marginLeft: 8 }]}>断开连接</Text>
          </TouchableOpacity>
        </View>

        {/* OpenCode section */}
        {client && (
          <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OpenCode 服务</Text>
            <TouchableOpacity style={styles.row} onPress={handleRestart} disabled={restarting}>
              <Feather name="refresh-cw" size={16} color={restarting ? theme.textTertiary : theme.accent} />
              <Text style={[styles.rowLabel, { color: restarting ? theme.textTertiary : theme.text, marginLeft: 8 }]}>
                {restarting ? '重启中...' : '重启 OpenCode'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bridge servers section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>桥接服务器</Text>
            <TouchableOpacity onPress={() => { resetForm(); setShowForm(true) }}>
              <Feather name="plus-circle" size={20} color={theme.accent} />
            </TouchableOpacity>
          </View>

          {showForm && (
            <View style={[styles.formCard, { borderColor: theme.borderLight }]}>
              <View style={styles.formHeader}>
                <Text style={[styles.formTitle, { color: theme.text }]}>
                  {editingId ? '编辑桥接' : '添加桥接'}
                </Text>
                <TouchableOpacity onPress={resetForm}>
                  <Feather name="x" size={18} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>名称</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={name}
                onChangeText={setName}
                placeholder="我的 Mac"
                placeholderTextColor={theme.textTertiary}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>地址</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={host}
                onChangeText={setHost}
                placeholder="192.168.1.100"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.row2}>
                <View style={styles.halfField}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>端口</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    value={port}
                    onChangeText={setPort}
                    placeholder="8079"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Token</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    value={token}
                    onChangeText={setToken}
                    placeholder="laycode"
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>{editingId ? '保存修改' : '添加'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {servers.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
              暂无保存的桥接服务器
            </Text>
          ) : (
            servers.map((s) => {
              const isActive = config?.id === s.id
              return (
                <View
                  key={s.id}
                  style={[
                    styles.serverRow,
                    { borderColor: isActive ? theme.accent : theme.border, backgroundColor: isActive ? theme.accent + '10' : 'transparent' },
                  ]}
                >
                  <View style={styles.serverInfo}>
                    <View style={styles.serverNameRow}>
                      {isActive && <View style={[styles.activeDot, { backgroundColor: theme.success }]} />}
                      <Text style={[styles.serverName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                    </View>
                    <Text style={[styles.serverAddr, { color: theme.textTertiary }]}>{s.host}:{s.port}</Text>
                  </View>
                  <View style={styles.serverActions}>
                    {!isActive ? (
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => handleSwitch(s)}>
                        <Feather name="play" size={14} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.activeBadge, { backgroundColor: theme.accent + '20' }]}>
                        <Text style={[styles.activeBadgeText, { color: theme.accent }]}>当前</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(s)}>
                      <Feather name="edit-2" size={14} color={theme.textTertiary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(s.id)}>
                      <Feather name="trash-2" size={14} color={theme.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })
          )}
        </View>

        {/* Appearance section */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>外观</Text>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>深色模式</Text>
            <Switch value={isDark} onValueChange={onThemeToggle} trackColor={{ true: theme.accent }} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: 'bold', paddingHorizontal: 20, paddingVertical: 16 },
  section: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 14 },
  sectionTitle: { fontSize: 12, fontWeight: '600', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  rowLabel: { fontSize: 15, flex: 1 },
  rowValue: { fontSize: 14 },
  rowHint: { fontSize: 12, marginLeft: 'auto' },
  emptyText: { fontSize: 13, paddingHorizontal: 14, paddingVertical: 12 },
  formCard: { margin: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  formTitle: { fontSize: 15, fontWeight: '600' },
  fieldLabel: { fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: { height: 40, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, borderWidth: 1 },
  row2: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  saveBtn: { height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  serverRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#2a2a45' },
  serverInfo: { flex: 1 },
  serverNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  serverName: { fontSize: 14, fontWeight: '500' },
  serverAddr: { fontSize: 12, marginTop: 2 },
  serverActions: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  actionBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadgeText: { fontSize: 11, fontWeight: '600' },
})
