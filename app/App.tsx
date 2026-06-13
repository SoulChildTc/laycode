import React, { useState, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import AsyncStorage from '@react-native-async-storage/async-storage'
import RootNavigator from './src/navigation/RootNavigator'
import { LayCodeClient } from './src/api/client'
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

  const handleThemeToggle = () => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {})
      return next
    })
  }

  if (!themeLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
