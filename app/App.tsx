import React, { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RootNavigator from './src/navigation/RootNavigator'
import { LayCodeClient } from './src/api/client'
import { ThemeMode } from './src/theme'
import { ServerConfig } from './src/types'

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [client, setClient] = useState<LayCodeClient | null>(null)
  const [config, setConfig] = useState<ServerConfig | null>(null)

  return (
    <SafeAreaProvider>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator
        screenProps={{
          themeMode,
          client,
          config,
          onConnect: (cfg: ServerConfig) => {
            setConfig(cfg)
            setClient(new LayCodeClient(cfg))
          },
          onThemeToggle: () => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark')),
          onDisconnect: () => {
            setClient(null)
            setConfig(null)
          },
        }}
      />
    </SafeAreaProvider>
  )
}
