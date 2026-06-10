import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getTheme, ThemeMode } from '../theme'
import { ServerConfig } from '../types'

interface Props {
  navigation: any
  themeMode: ThemeMode
  onThemeToggle: () => void
  config: ServerConfig | null
  onDisconnect: () => void
}

export default function SettingsScreen({ navigation, themeMode, onThemeToggle, config, onDisconnect }: Props) {
  const theme = getTheme(themeMode)
  const isDark = themeMode === 'dark'

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>设置</Text>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>连接</Text>
        {config && (
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>服务器</Text>
            <Text style={[styles.rowValue, { color: theme.textSecondary }]}>
              {config.host}:{config.port}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.row} onPress={onDisconnect}>
          <Text style={[styles.rowLabel, { color: theme.error }]}>断开连接</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>外观</Text>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.text }]}>深色模式</Text>
          <Switch value={isDark} onValueChange={onThemeToggle} trackColor={{ true: theme.accent }} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', paddingHorizontal: 20, paddingVertical: 16 },
  section: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 15 },
  rowValue: { fontSize: 14 },
})
