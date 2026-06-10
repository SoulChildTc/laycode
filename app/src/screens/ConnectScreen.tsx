import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { ServerConfig } from '../types'
import { LayCodeClient } from '../api/client'
import { useDiscovery, DiscoveredBridge } from '../hooks/useDiscovery'

const STORAGE_KEY = '@laycode/last-config'

interface Props {
  navigation: any
  themeMode: ThemeMode
  onConnect: (config: ServerConfig) => void
}

export default function ConnectScreen({ navigation, themeMode, onConnect }: Props) {
  const theme = getTheme(themeMode)
  const { scan, scanning, bridges } = useDiscovery()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('8079')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [autoConnecting, setAutoConnecting] = useState(true)

  useEffect(() => {
    loadSavedConfig()
  }, [])

  const loadSavedConfig = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY)
      if (saved) {
        const cfg: ServerConfig = JSON.parse(saved)
        setHost(cfg.host)
        setPort(String(cfg.port))
        setToken(cfg.token)
        const ok = await tryConnect(cfg)
        if (ok) return
      }
    } catch {}
    setAutoConnecting(false)
    // Auto-scan for bridges
    scan()
  }

  const tryConnect = async (config: ServerConfig): Promise<boolean> => {
    const client = new LayCodeClient(config)
    const ok = await client.health()
    if (ok) {
      onConnect(config)
      navigation.replace('Main')
      return true
    }
    return false
  }

  const selectBridge = (bridge: DiscoveredBridge) => {
    setHost(bridge.host)
    setPort(String(bridge.port))
  }

  const handleConnect = async () => {
    setError('')
    setConnecting(true)

    const config: ServerConfig = {
      host: host.trim(),
      port: parseInt(port, 10) || 8079,
      token: token.trim() || 'laycode',
    }

    const client = new LayCodeClient(config)
    const ok = await client.health()

    if (ok) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config))
      onConnect(config)
      navigation.replace('Main')
    } else {
      setError('无法连接，请检查地址和 token')
    }

    setConnecting(false)
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
      <View style={styles.header}>
        <View style={[styles.logo, { backgroundColor: theme.accent }]}>
          <Text style={styles.logoText}>L</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>LayCode</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>躺着码，一样 Vibe</Text>
      </View>

      {/* Discovered bridges */}
      {scanning ? (
        <View style={styles.scanStatus}>
          <ActivityIndicator color={theme.accent} size="small" />
          <Text style={[styles.scanText, { color: theme.textSecondary }]}>
            正在发现...
          </Text>
        </View>
      ) : bridges.length > 0 ? (
        <View style={styles.discovered}>
          <Text style={[styles.discoveredTitle, { color: theme.textSecondary }]}>
            发现 {bridges.length} 台电脑
          </Text>
          {bridges.map((b, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.bridgeItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => selectBridge(b)}
            >
              <View style={[styles.dot, { backgroundColor: theme.success }]} />
              <View style={styles.bridgeInfo}>
                <Text style={[styles.bridgeName, { color: theme.text }]} numberOfLines={1}>{b.name || b.host}</Text>
                <Text style={[styles.bridgeAddr, { color: theme.textSecondary }]}>{b.host}:{b.port}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {!scanning && bridges.length === 0 && (
        <TouchableOpacity onPress={scan} style={styles.scanAgain}>
          <Text style={[styles.scanAgainText, { color: theme.accent }]}>扫描局域网设备</Text>
        </TouchableOpacity>
      )}

      {/* Manual form */}
      <View style={styles.form}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>服务器地址</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          value={host}
          onChangeText={setHost}
          placeholder="192.168.1.100"
          placeholderTextColor={theme.textSecondary}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>端口</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          value={port}
          onChangeText={setPort}
          placeholder="8079"
          placeholderTextColor={theme.textSecondary}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Token</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
          value={token}
          onChangeText={setToken}
          placeholder="laycode"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.accent }, connecting && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={connecting}
        >
          <Text style={styles.buttonText}>{connecting ? '连接中...' : '连接'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 48, paddingBottom: 24 },
  logo: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  scanStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  scanText: { fontSize: 13 },
  discovered: { paddingHorizontal: 24, marginBottom: 12 },
  discoveredTitle: { fontSize: 12, marginBottom: 8 },
  bridgeItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  bridgeInfo: { flex: 1 },
  bridgeName: { fontSize: 14, fontWeight: '500' },
  bridgeAddr: { fontSize: 12 },
  scanAgain: { alignItems: 'center', paddingVertical: 8 },
  scanAgainText: { fontSize: 14 },
  form: { paddingHorizontal: 24, flex: 1 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, borderWidth: 1 },
  button: { height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ef4444', fontSize: 13, marginTop: 8 },
})
