import React, { useState, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AsyncStorage from '@react-native-async-storage/async-storage'
import RootNavigator from './src/navigation/RootNavigator'
import ErrorBoundary from './src/components/ErrorBoundary'
import { ServersProvider } from './src/contexts/ServersContext'
import { ToastProvider, toast } from './src/contexts/ToastContext'
import { LayCodeClient, setGlobalErrorHandler } from './src/api/client'
import { ThemeMode } from './src/theme'
import { ServerConfig, ServerEntry } from './src/types'

const THEME_KEY = '@laycode/theme-mode'

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [themeLoaded, setThemeLoaded] = useState(false)
  const [client, setClient] = useState<LayCodeClient | null>(null)
  const [config, setConfig] = useState<ServerEntry | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setThemeMode(saved)
      }
      setThemeLoaded(true)
    }).catch(() => setThemeLoaded(true))
  }, [])

  // 全局错误提示：会话失效（401）与连不上 bridge（网络失败/超时）都在此统一弹提示。
  // 按产品选择只提示、不自动跳回连接页。并发失败由 Toast 层去重成一条。
  useEffect(() => {
    setGlobalErrorHandler((err) => toast(err.message, 'error'))
    return () => setGlobalErrorHandler(null)
  }, [])

  const handleThemeToggle = () => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {})
      return next
    })
  }

  if (!themeLoaded) return null

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
          <ToastProvider themeMode={themeMode}>
            <ServersProvider>
              <RootNavigator
                screenProps={{
                  themeMode,
                  client,
                  config,
                  onConnect: (cfg: ServerEntry) => {
                    setConfig(cfg)
                    setClient(new LayCodeClient(cfg))
                  },
                  onThemeToggle: handleThemeToggle,
                  onDisconnect: async () => {
                    setClient(null)
                    setConfig(null)
                    await AsyncStorage.removeItem('@laycode/last-server-id')
                  },
                }}
              />
            </ServersProvider>
          </ToastProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}
