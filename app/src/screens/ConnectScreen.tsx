import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { ServerEntry } from '../types'
import { useDiscovery, DiscoveredBridge } from '../hooks/useDiscovery'
import { useServers } from '../hooks/useServers'
import QRScanner from '../components/QRScanner'
import { PairingInfo } from '../utils/pairing'

interface Props {
  themeMode: ThemeMode
  onConnect: (config: ServerEntry) => void
}

export default function ConnectScreen({ themeMode, onConnect }: Props) {
  const theme = getTheme(themeMode)
  const { scan, scanning, bridges } = useDiscovery()
  const { servers, loaded, connect, add, test } = useServers()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8079')
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [autoConnecting, setAutoConnecting] = useState(true)
  const [scannerVisible, setScannerVisible] = useState(false)

  useEffect(() => {
    autoConnect()
  }, [loaded])

  const autoConnect = async () => {
    if (!loaded) return
    setAutoConnecting(true)
    try {
      const raw = await import('@react-native-async-storage/async-storage').then((m) => m.default.getItem('@laycode/last-server-id'))
      if (raw) {
        const last = servers.find((s) => s.id === raw)
        if (last) {
          const ok = await doConnect(last)
          if (ok) return
        }
      }
    } catch {}
    setAutoConnecting(false)
    scan()
  }

  const doConnect = async (cfg: ServerEntry): Promise<boolean> => {
    const ok = await connect(cfg)
    if (ok) {
      onConnect(cfg)
      return true
    }
    return false
  }

  const handleConnect = async () => {
    setError('')
    setConnecting(true)

    if (!host.trim()) {
      setError('请输入服务器地址')
      setConnecting(false)
      return
    }

    const entry = {
      name: name.trim() || host.trim(),
      host: host.trim(),
      port: parseInt(port, 10) || 8079,
      token: token.trim() || 'laycode',
    }

    const ok = await test(entry)
    if (ok) {
      const saved = await add(entry)
      onConnect(saved)
    } else {
      setError('无法连接，请检查地址和 token')
    }
    setConnecting(false)
  }

  const handleQuickConnect = async (s: typeof servers[number]) => {
    setConnecting(true)
    const ok = await connect(s)
    if (ok) {
      onConnect(s)
    } else {
      setError(`无法连接 ${s.name}`)
    }
    setConnecting(false)
  }

  const handleScanned = async (info: PairingInfo) => {
    setScannerVisible(false)
    setError('')
    setConnecting(true)
    const entry = {
      name: info.name || info.host,
      host: info.host,
      port: info.port,
      token: info.token,
    }
    const ok = await test(entry)
    if (ok) {
      const saved = await add(entry)
      onConnect(saved)
    } else {
      setError('扫码连接失败，请确认电脑和手机在同一网络')
    }
    setConnecting(false)
  }

  const handleSelectBridge = (b: DiscoveredBridge) => {
    setName(b.name || b.host)
    setHost(b.host)
    setPort(String(b.port))
    setToken('laycode')
    setError('')
  }

  if (autoConnecting) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: theme.accent }]}>
            <Text style={styles.logoText}>L</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>LayCode</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>自动连接中...</Text>
        </View>
        <ActivityIndicator color={theme.accent} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: theme.accent }]}>
            <Text style={styles.logoText}>L</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>LayCode</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>躺着码，一样 Vibe</Text>
        </View>

        {/* 扫码连接 */}
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: theme.accent }]}
          onPress={() => setScannerVisible(true)}
        >
          <Feather name="maximize" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.scanBtnText}>扫码连接</Text>
        </TouchableOpacity>

        {/* Discovered bridges */}
        {scanning ? (
          <View style={styles.scanStatus}>
            <ActivityIndicator color={theme.accent} size="small" />
            <Text style={[styles.scanText, { color: theme.textSecondary }]}>正在发现...</Text>
          </View>
        ) : bridges.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              发现 {bridges.length} 台电脑
            </Text>
            {bridges.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.serverItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => handleSelectBridge(b)}
              >
                <View style={[styles.dot, { backgroundColor: theme.success }]} />
                <View style={styles.serverInfo}>
                  <Text style={[styles.serverName, { color: theme.text }]} numberOfLines={1}>{b.name || b.host}</Text>
                  <Text style={[styles.serverAddr, { color: theme.textSecondary }]}>{b.host}:{b.port}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {!scanning && bridges.length === 0 && (
          <TouchableOpacity onPress={scan} style={styles.scanAgain}>
            <Text style={[styles.scanAgainText, { color: theme.accent }]}>扫描局域网设备</Text>
          </TouchableOpacity>
        )}

        {/* Saved servers */}
        {servers.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              已保存的桥接 ({servers.length})
            </Text>
            {servers.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.serverItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => handleQuickConnect(s)}
              >
                <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                <View style={styles.serverInfo}>
                  <Text style={[styles.serverName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.serverAddr, { color: theme.textSecondary }]}>{s.host}:{s.port}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Manual form */}
        <View style={styles.form}>
          <Text style={[styles.formTitle, { color: theme.textSecondary }]}>手动连接</Text>

          <Text style={[styles.label, { color: theme.textSecondary }]}>名称（可选）</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            value={name}
            onChangeText={setName}
            placeholder="我的 Mac"
            placeholderTextColor={theme.textTertiary}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>地址</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.100"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>端口</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            value={port}
            onChangeText={setPort}
            placeholder="8079"
            placeholderTextColor={theme.textTertiary}
            keyboardType="numeric"
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>Token</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            value={token}
            onChangeText={setToken}
            placeholder="laycode"
            placeholderTextColor={theme.textTertiary}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.accent }, connecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={connecting}
          >
            <Text style={styles.buttonText}>{connecting ? '连接中...' : '保存并连接'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <QRScanner
        visible={scannerVisible}
        theme={theme}
        onClose={() => setScannerVisible(false)}
        onScanned={handleScanned}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 24, marginBottom: 16, height: 48, borderRadius: 10 },
  scanBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  header: { alignItems: 'center', paddingTop: 32, paddingBottom: 20 },
  logo: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  scanStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  scanText: { fontSize: 13 },
  section: { paddingHorizontal: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  serverItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  serverInfo: { flex: 1 },
  serverName: { fontSize: 14, fontWeight: '500' },
  serverAddr: { fontSize: 12, marginTop: 2 },
  scanAgain: { alignItems: 'center', paddingVertical: 8 },
  scanAgainText: { fontSize: 14 },
  form: { paddingHorizontal: 24, flex: 1 },
  formTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, borderWidth: 1 },
  button: { height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ef4444', fontSize: 13, marginTop: 8 },
})
