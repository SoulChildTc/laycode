import { useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Agent } from '../types'

const AGENT_KEY = '@laycode/current-agent'
const SESSION_AGENT_KEY = '@laycode/session-agents'

const BUILTIN_COLORS: Record<string, string> = {
  build: '#4CAF50',
  plan: '#2196F3',
}

function assignAgentColor(agent: Agent, index: number): string {
  if (agent.color) return agent.color
  if (BUILTIN_COLORS[agent.name]) return BUILTIN_COLORS[agent.name]
  const palette = ['#E91E63', '#9C27B0', '#FF9800', '#00BCD4', '#FF5722', '#795548', '#607D8B', '#CDDC39']
  return palette[index % palette.length]
}

export function useAgents(
  inputAgents: Agent[],
  sessionId: string | undefined,
  defaultAgent?: string,
) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [currentAgent, setCurrentAgent] = useState<string | undefined>(undefined)
  const loadedSessionRef = useRef<string | undefined>(undefined)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (inputAgents.length === 0) return
    setAgents(inputAgents.map((a, i) => ({ ...a, color: assignAgentColor(a, i) })))
  }, [inputAgents])

  useEffect(() => {
    if (initializedRef.current || agents.length === 0) return
    initializedRef.current = true

    ;(async () => {
      const sessionSaved = sessionId ? await readSessionAgent(sessionId) : undefined
      if (sessionSaved) { setCurrentAgent(sessionSaved); return }

      const globalSaved = await readGlobalAgent()
      if (globalSaved && agents.some((a) => a.name === globalSaved)) { setCurrentAgent(globalSaved); return }

      if (defaultAgent && agents.some((a) => a.name === defaultAgent)) { setCurrentAgent(defaultAgent); return }

      const buildExists = agents.some((a) => a.name === 'build')
      setCurrentAgent(buildExists ? 'build' : agents[0].name)
    })()
  }, [agents, sessionId, defaultAgent])

  const setAgent = useCallback((name: string | undefined) => {
    setCurrentAgent(name)
    if (name) {
      AsyncStorage.setItem(AGENT_KEY, name).catch(() => {})
      if (sessionId) {
        AsyncStorage.getItem(SESSION_AGENT_KEY).then((raw) => {
          const all: Record<string, string> = raw ? JSON.parse(raw) : {}
          all[sessionId] = name
          AsyncStorage.setItem(SESSION_AGENT_KEY, JSON.stringify(all)).catch(() => {})
        }).catch(() => {})
      }
    }
  }, [sessionId])

  const activeAgent = agents.find((a) => a.name === currentAgent) || agents.find((a) => a.name === 'build') || agents[0]

  return { agents, currentAgent: activeAgent, setAgent }
}

async function readGlobalAgent(): Promise<string | undefined> {
  try {
    const raw = await AsyncStorage.getItem(AGENT_KEY)
    return raw || undefined
  } catch { return undefined }
}

async function readSessionAgent(sessionId: string): Promise<string | undefined> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_AGENT_KEY)
    if (!raw) return undefined
    const saved: Record<string, string> = JSON.parse(raw)
    return saved[sessionId]
  } catch { return undefined }
}