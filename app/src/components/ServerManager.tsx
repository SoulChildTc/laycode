import React, { useState, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Alert } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import { ServerEntry } from '../types'
import { useServers } from '../contexts/ServersContext'
import { useDiscovery, DiscoveredBridge } from '../hooks/useDiscovery'
import QRScanner from './QRScanner'
import { PairingInfo } from '../utils/pairing'

interface Props {
  theme: Theme
  variant: 'connect' | 'manage'
  // 当前已连接的 server（manage 语境用于高亮/切换判断）
  currentId?: string | null
  // 连接/切换成功后回调（顶层据此设置 client）
  onConnected: (server: ServerEntry) => void
  // manage 语境下断开当前连接
  onDisconnectCurrent?: () => void
}

export default function ServerManager({ theme, variant, currentId, onConnected, onDisconnectCurrent }: Props) {
  const { servers, add, update, remove, test, connect } = useServers()
  const { scan, scanning, bridges } = useDiscovery()

  const [scannerVisible, setScannerVisible] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8079')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const cancelledRef = useRef(false)

  const resetForm = () => {
    setEditingId(null); setName(''); setHost(''); setPort('8079'); setToken(''); setError(''); setManualOpen(false)
  }

  const runConnect = async (entry: Omit<ServerEntry, 'id'> | ServerEntry) => {
    setError('')
    cancelledRef.current = false
    setConnecting(true)
    const ok = await test(entry)
    if (cancelledRef.current) { setConnecting(false); return }
    if (!ok) {
      setConnecting(false)
      setError(`无法连接 ${entry.name || entry.host}，请确认电脑端 laycode-cli 正在运行且在同一网络`)
      return
    }
    const { server } = await add(entry)
    if (cancelledRef.current) { setConnecting(false); return }
    await connect(server)
    setConnecting(false)
    resetForm()
    onConnected(server)
  }

  const cancelConnect = () => { cancelledRef.current = true; setConnecting(false) }

  const handleManualSubmit = async () => {
    if (!host.trim()) { setError('请输入服务器地址'); return }
    if (!token.trim()) { setError('请输入 Token（可在电脑端 laycode-cli 启动信息里查看）'); return }
    const entry = { name: name.trim() || host.trim(), host: host.trim(), port: parseInt(port, 10) || 8079, token: token.trim() }
    if (editingId) {
      const updated = await update(editingId, entry)
      if (updated && currentId === editingId) onConnected(updated)
      resetForm()
    } else {
      const { server, reused } = await add(entry)
      if (reused) Alert.alert('已更新', `已有相同地址的服务器，已更新其信息`)
      // manage 语境下"添加"不自动连接；connect 语境下添加即连接
      if (variant === 'connect') { await runConnect(server) } else { resetForm() }
    }
  }

  const handleScanned = (info: PairingInfo) => {
    setScannerVisible(false)
    runConnect({ name: info.name || info.host, host: info.host, port: info.port, token: info.token })
  }

  const handleSelectBridge = (b: DiscoveredBridge) => {
    setName(b.name || b.host); setHost(b.host); setPort(String(b.port)); setToken('')
    setError('已填入该设备地址，请输入 Token 或改用扫码连接'); setManualOpen(true)
  }

  const handleEdit = (s: ServerEntry) => {
    setEditingId(s.id); setName(s.name); setHost(s.host); setPort(String(s.port)); setToken(s.token); setError(''); setManualOpen(true)
  }

  const handleDelete = (s: ServerEntry) => {
    const isCurrent = currentId === s.id
    Alert.alert('删除服务器', isCurrent ? '这是当前连接的服务器，删除后将断开连接。确定删除吗？' : `确定删除 ${s.name}？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { await remove(s.id); if (isCurrent) onDisconnectCurrent?.() } },
    ])
  }

  const handleTapServer = (s: ServerEntry) => {
    if (variant === 'manage' && currentId === s.id) return
    runConnect(s)
  }

  return (
    <View>
      {/* 扫码 Hero */}
      <TouchableOpacity style={[styles.heroCard, { backgroundColor: theme.accent }]} activeOpacity={0.85} onPress={() => setScannerVisible(true)}>
        <View style={styles.heroIconWrap}><Feather name="maximize" size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>扫码连接</Text>
          <Text style={styles.heroSub}>扫描电脑端 laycode-cli 的二维码</Text>
        </View>
        <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* 局域网设备 */}
      {(scanning || bridges.length > 0) && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>局域网设备</Text>
            {scanning ? <ActivityIndicator color={theme.accent} size="small" /> : <TouchableOpacity onPress={scan}><Feather name="refresh-cw" size={15} color={theme.accent} /></TouchableOpacity>}
          </View>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {bridges.length === 0 && scanning ? (
              <Text style={[styles.cardEmpty, { color: theme.textTertiary }]}>正在发现附近的电脑...</Text>
            ) : bridges.map((b, i) => (
              <TouchableOpacity key={i} style={[styles.rowItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]} onPress={() => handleSelectBridge(b)} activeOpacity={0.6}>
                <View style={[styles.rowIcon, { backgroundColor: theme.success + '22' }]}><Feather name="monitor" size={16} color={theme.success} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{b.name || b.host}</Text>
                  <Text style={[styles.rowAddr, { color: theme.textTertiary }]}>{b.host}:{b.port}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!scanning && bridges.length === 0 && (
        <TouchableOpacity onPress={scan} style={styles.scanAgain}>
          <Feather name="wifi" size={14} color={theme.accent} style={{ marginRight: 6 }} />
          <Text style={[styles.scanAgainText, { color: theme.accent }]}>扫描局域网设备</Text>
        </TouchableOpacity>
      )}

      {/* 服务器列表 */}
      {servers.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{variant === 'manage' ? '服务器' : '已保存'}</Text>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {servers.map((s, i) => {
              const isCurrent = currentId === s.id
              return (
                <View key={s.id} style={[styles.rowItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <TouchableOpacity style={styles.rowMain} onPress={() => handleTapServer(s)} activeOpacity={0.6} disabled={isCurrent}>
                    <View style={[styles.rowIcon, { backgroundColor: (isCurrent ? theme.success : theme.accent) + '22' }]}>
                      <Feather name="server" size={16} color={isCurrent ? theme.success : theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowNameLine}>
                        <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                        {isCurrent && <View style={[styles.badge, { backgroundColor: theme.success + '22' }]}><Text style={[styles.badgeText, { color: theme.success }]}>当前</Text></View>}
                      </View>
                      <Text style={[styles.rowAddr, { color: theme.textTertiary }]}>{s.host}:{s.port}</Text>
                    </View>
                  </TouchableOpacity>
                  {variant === 'manage' ? (
                    <View style={styles.rowActions}>
                      <TouchableOpacity onPress={() => handleEdit(s)} style={styles.iconBtn}><Feather name="edit-2" size={15} color={theme.textTertiary} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(s)} style={styles.iconBtn}><Feather name="trash-2" size={15} color={theme.textTertiary} /></TouchableOpacity>
                    </View>
                  ) : (
                    <Feather name="chevron-right" size={18} color={theme.textTertiary} />
                  )}
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 手动连接 / 添加 — 折叠 */}
      <View style={styles.section}>
        <TouchableOpacity style={[styles.manualToggle, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => { if (manualOpen) resetForm(); else setManualOpen(true) }} activeOpacity={0.6}>
          <Feather name="edit-3" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
          <Text style={[styles.manualToggleText, { color: theme.text }]}>{editingId ? '编辑服务器' : '手动添加'}</Text>
          <Feather name={manualOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textTertiary} />
        </TouchableOpacity>

        {manualOpen && (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 8, padding: 14 }]}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>名称（可选）</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} value={name} onChangeText={setName} placeholder="我的 Mac" placeholderTextColor={theme.textTertiary} />
            <Text style={[styles.label, { color: theme.textSecondary }]}>地址</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} value={host} onChangeText={setHost} placeholder="192.168.1.100" placeholderTextColor={theme.textTertiary} autoCapitalize="none" autoCorrect={false} />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>端口</Text>
                <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} value={port} onChangeText={setPort} placeholder="8079" placeholderTextColor={theme.textTertiary} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1.6 }}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Token</Text>
                <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} value={token} onChangeText={setToken} placeholder="cli 启动信息里的 token" placeholderTextColor={theme.textTertiary} secureTextEntry />
              </View>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.accent }]} onPress={handleManualSubmit} activeOpacity={0.85}>
              <Text style={styles.buttonText}>{editingId ? '保存修改' : (variant === 'connect' ? '保存并连接' : '添加')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!manualOpen && error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <QRScanner visible={scannerVisible} theme={theme} onClose={() => setScannerVisible(false)} onScanned={handleScanned} />

      <Modal visible={connecting} transparent animationType="fade" onRequestClose={cancelConnect}>
        <View style={styles.connOverlay}>
          <View style={[styles.connCard, { backgroundColor: theme.surface }]}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.connText, { color: theme.text }]}>正在连接...</Text>
            <TouchableOpacity style={[styles.connCancel, { borderColor: theme.border }]} onPress={cancelConnect}>
              <Text style={[styles.connCancelText, { color: theme.textSecondary }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 18, marginBottom: 20, shadowColor: '#6c7dff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  heroIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3 },
  section: { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  rowItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 15, fontWeight: '500' },
  rowAddr: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  rowActions: { flexDirection: 'row', gap: 2, marginLeft: 8 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scanAgain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 12 },
  scanAgainText: { fontSize: 14, fontWeight: '500' },
  manualToggle: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 14 },
  manualToggleText: { flex: 1, fontSize: 15, fontWeight: '500' },
  label: { fontSize: 12, marginBottom: 6, marginTop: 10 },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, borderWidth: 1 },
  row2: { flexDirection: 'row', gap: 10 },
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#f87171', fontSize: 13, marginTop: 10, paddingHorizontal: 4 },
  connOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  connCard: { width: 220, borderRadius: 16, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 16 },
  connText: { fontSize: 15, fontWeight: '500' },
  connCancel: { paddingVertical: 8, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1 },
  connCancelText: { fontSize: 14, fontWeight: '600' },
})
