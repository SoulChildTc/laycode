import React from 'react'
import { Feather } from '@expo/vector-icons'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import ConnectScreen from '../screens/ConnectScreen'
import HomeScreen from '../screens/HomeScreen'
import BrowseWorkspaceScreen from '../screens/BrowseWorkspaceScreen'
import WorkspaceScreen from '../screens/WorkspaceScreen'
import SessionScreen from '../screens/SessionScreen'
import FileExplorerScreen from '../screens/FileExplorerScreen'
import SettingsScreen from '../screens/SettingsScreen'
import TodoSummaryScreen from '../screens/TodoSummaryScreen'
import GitScreen from '../screens/GitScreen'
import DiffScreen from '../screens/DiffScreen'
import TerminalScreen from '../screens/TerminalScreen'
import TerminalListScreen from '../screens/TerminalListScreen'
import { LayCodeClient } from '../api/client'
import { ThemeMode, getTheme } from '../theme'
import { ServerEntry } from '../types'

export type RootStackParamList = {
  Connect: undefined
  Main: undefined
  BrowseWorkspace: undefined
  Workspace: { directory: string; name: string }
  Session: { projectId: string; sessionId: string }
  Git: { directory: string }
  Diff: { directory: string; file: string; cached?: boolean }
  Terminal: { directory?: string; ptyID?: string }
  TerminalList: { directory?: string } | undefined
}

export type TabParamList = {
  Home: undefined
  Todos: undefined
  Files: undefined
  Terminal: undefined
  Settings: undefined
}

interface ScreenProps {
  themeMode: ThemeMode
  client: LayCodeClient | null
  config: ServerEntry | null
  onConnect: (config: ServerEntry) => void
  onThemeToggle: () => void
  onDisconnect: () => void
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<TabParamList>()

function MainTabs({ themeMode, client, config, navigation: stackNav, onThemeToggle, onDisconnect, onConnect }: ScreenProps & { navigation: any }) {
  const theme = getTheme(themeMode)
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tab.Screen name="Home" options={{ tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}>
        {() => <HomeScreen navigation={stackNav} client={client!} themeMode={themeMode} config={config!} />}
      </Tab.Screen>
      <Tab.Screen name="Todos" options={{ tabBarIcon: ({ color, size }) => <Feather name="check-square" size={size} color={color} /> }}>
        {() => <TodoSummaryScreen navigation={stackNav} client={client!} themeMode={themeMode} config={config!} />}
      </Tab.Screen>
      <Tab.Screen name="Files" options={{ tabBarIcon: ({ color, size }) => <Feather name="folder" size={size} color={color} /> }}>
        {() => <FileExplorerScreen route={{} as any} themeMode={themeMode} client={client!} />}
      </Tab.Screen>
      <Tab.Screen name="Terminal" options={{ tabBarIcon: ({ color, size }) => <Feather name="terminal" size={size} color={color} /> }}>
        {() => <TerminalListScreen navigation={stackNav} route={{ params: {} }} themeMode={themeMode} client={client!} config={config!} />}
      </Tab.Screen>
      <Tab.Screen name="Settings" options={{ tabBarIcon: ({ color, size }) => <Feather name="settings" size={size} color={color} /> }}>
        {() => (
          <SettingsScreen
            navigation={stackNav}
            themeMode={themeMode}
            onThemeToggle={onThemeToggle}
            config={config}
            client={client}
            onDisconnect={onDisconnect}
            onConnect={onConnect}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  )
}

export default function RootNavigator({ screenProps }: { screenProps: ScreenProps }) {
  const { themeMode, client, config, onConnect, onThemeToggle, onDisconnect } = screenProps

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!client ? (
          <Stack.Screen name="Connect">
            {() => <ConnectScreen themeMode={themeMode} onConnect={onConnect} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Main">
            {(props) => (
              <MainTabs
                {...props}
                themeMode={themeMode}
                client={client}
                config={config}
                onConnect={onConnect}
                onThemeToggle={onThemeToggle}
                onDisconnect={onDisconnect}
              />
            )}
          </Stack.Screen>
        )}
        <Stack.Screen name="BrowseWorkspace">
          {(props) => <BrowseWorkspaceScreen {...props} client={client!} themeMode={themeMode} config={config!} />}
        </Stack.Screen>
        <Stack.Screen name="Workspace">
          {(props) => <WorkspaceScreen {...props} client={client!} themeMode={themeMode} config={config!} />}
        </Stack.Screen>
        <Stack.Screen name="Session">
          {(props) => <SessionScreen {...props} themeMode={themeMode} client={client!} config={config!} />}
        </Stack.Screen>
        <Stack.Screen name="Terminal">
          {(props) => <TerminalScreen {...props} themeMode={themeMode} client={client!} config={config!} />}
        </Stack.Screen>
        <Stack.Screen name="TerminalList">
          {(props) => <TerminalListScreen {...props} themeMode={themeMode} client={client!} config={config!} />}
        </Stack.Screen>
        <Stack.Screen name="Git">
          {(props) => <GitScreen {...props} themeMode={themeMode} client={client!} />}
        </Stack.Screen>
        <Stack.Screen name="Diff">
          {(props) => <DiffScreen {...props} themeMode={themeMode} client={client!} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  )
}
