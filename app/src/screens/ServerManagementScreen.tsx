import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { ServerEntry } from '../types'
import ServerManager from '../components/ServerManager'

interface Props {
  navigation: any
  themeMode: ThemeMode
  config: ServerEntry | null
  onConnect: (config: ServerEntry) => void
  onDisconnect: () => void
}

export default function ServerManagementScreen({ navigation, themeMode, config, onConnect, onDisconnect }: Props) {
  const theme = getTheme(themeMode)
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>服务器管理</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ServerManager
          theme={theme}
          variant="manage"
          currentId={config?.id ?? null}
          onConnected={onConnect}
          onDisconnectCurrent={onDisconnect}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 48, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4, width: 32 },
  title: { flex: 1, fontSize: 17, fontWeight: '600' },
  scroll: { padding: 20 },
})
