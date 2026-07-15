import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient } from '../api/client'
import { ServerEntry } from '../types'
import appJson from '../../app.json'

const APP_VERSION = appJson.expo.version

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
  const [restarting, setRestarting] = useState(false)

  const handleRestart = () => {
    if (!client || restarting) return
    Alert.alert('重启 OpenCode', '确定要重启 OpenCode 服务吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '重启',
        onPress: async () => {
          setRestarting(true)
          try {
            const result = await client.restartOpencode()
            if (result.status === 'ok') Alert.alert('已重启', 'OpenCode 服务已重新启动')
            else Alert.alert('重启失败', result.message || result.error || '未知错误')
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

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* 连接 */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>连接</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {config ? (
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: theme.success + '22' }]}>
                <Feather name="server" size={16} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{config.name || `${config.host}:${config.port}`}</Text>
                <Text style={[styles.rowSub, { color: theme.textTertiary }]}>{config.host}:{config.port}</Text>
              </View>
              <TouchableOpacity style={[styles.disconnectBtn, { borderColor: theme.error + '55' }]} onPress={onDisconnect}>
                <Feather name="log-out" size={14} color={theme.error} />
                <Text style={[styles.disconnectText, { color: theme.error }]}>断开</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.row}><Text style={[styles.rowSub, { color: theme.textTertiary }]}>未连接</Text></View>
          )}
          <TouchableOpacity style={[styles.row, styles.rowDivider, { borderTopColor: theme.border }]} onPress={() => navigation.push('ServerManagement')}>
            <View style={[styles.rowIcon, { backgroundColor: theme.accent + '22' }]}>
              <Feather name="hard-drive" size={16} color={theme.accent} />
            </View>
            <Text style={[styles.rowActionText, { color: theme.text, flex: 1 }]}>服务器管理</Text>
            <Feather name="chevron-right" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* OpenCode 服务 */}
        {client && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OpenCode 服务</Text>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TouchableOpacity style={styles.row} onPress={handleRestart} disabled={restarting}>
                <View style={[styles.rowIcon, { backgroundColor: theme.accent + '22' }]}>
                  {restarting ? <ActivityIndicator size="small" color={theme.accent} /> : <Feather name="refresh-cw" size={16} color={theme.accent} />}
                </View>
                <Text style={[styles.rowActionText, { color: restarting ? theme.textTertiary : theme.text }]}>
                  {restarting ? '重启中...' : '重启 OpenCode'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* 外观 */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>外观</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: theme.accent + '22' }]}>
              <Feather name="moon" size={16} color={theme.accent} />
            </View>
            <Text style={[styles.rowActionText, { color: theme.text, flex: 1 }]}>深色模式</Text>
            <Switch value={isDark} onValueChange={onThemeToggle} trackColor={{ true: theme.accent }} />
          </View>
        </View>

        {/* 关于 */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>关于</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: theme.accent + '22' }]}>
              <Feather name="info" size={16} color={theme.accent} />
            </View>
            <Text style={[styles.rowActionText, { color: theme.text, flex: 1 }]}>版本</Text>
            <Text style={[styles.rowSub, { color: theme.textTertiary, marginTop: 0 }]}>v{APP_VERSION}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40, paddingHorizontal: 20 },
  pageTitle: { fontSize: 24, fontWeight: 'bold', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 4, marginBottom: 8, marginTop: 8 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowActionText: { fontSize: 15, fontWeight: '500' },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  disconnectText: { fontSize: 13, fontWeight: '500' },
})
