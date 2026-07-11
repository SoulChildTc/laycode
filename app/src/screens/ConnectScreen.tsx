import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getTheme, ThemeMode } from '../theme'
import { ServerEntry } from '../types'
import { useServers } from '../hooks/useServers'
import ServerManager from '../components/ServerManager'

interface Props {
  themeMode: ThemeMode
  onConnect: (config: ServerEntry) => void
}

export default function ConnectScreen({ themeMode, onConnect }: Props) {
  const theme = getTheme(themeMode)
  const { servers, loaded, connect } = useServers()
  const [autoConnecting, setAutoConnecting] = useState(true)

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
          const result = await connect(last)
          if (result === 'ok') { onConnect(last); return }
        }
      }
    } catch {}
    setAutoConnecting(false)
  }

  if (autoConnecting) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: theme.surface }]}>
            <Image source={require('../../assets/logo-mark.png')} style={styles.logoMark} />
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: theme.surface }]}>
            <Image source={require('../../assets/logo-mark.png')} style={styles.logoMark} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>LayCode</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>躺着码，一样 Vibe</Text>
        </View>

        <ServerManager theme={theme} variant="connect" onConnected={onConnect} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40, paddingHorizontal: 20 },
  header: { alignItems: 'center', paddingTop: 36, paddingBottom: 24 },
  logo: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoMark: { width: 40, height: 40 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14 },
})
