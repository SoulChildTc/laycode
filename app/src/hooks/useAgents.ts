import { useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Agent } from '../types'

const AGENT_KEY = '@laycode/current-agent'
const SESSION_AGENT_KEY = '@laycode/session-agents'

export function useAgents(
  agents: Agent[],
  sessionId: string | undefined,
) {
  const [currentAgent, setCurrentAgent] = useState<string | undefined>(undefined)
  const loadedSessionRef = useRef<string | undefined>(undefined)
  const loadedPersistedRef = useRef(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current || agents.length === 0) return
    initializedRef.current = true

    const buildExists = agents.some((a) => a.name === 'build')
    if (buildExists) {
      setCurrentAgent((prev) => prev || 'build')
    } else {
      setCurrentAgent((prev) => prev || agents[0].name)
    }
  }, [agents])

  useEffect(() => {
    if (!sessionId || loadedSessionRef.current === sessionId) return
    loadedSessionRef.current = sessionId

    AsyncStorage.getItem(SESSION_AGENT_KEY).then((raw) => {
      if (!raw) return
      try {
        const saved: Record<string, string> = JSON.parse(raw)
        if (saved[sessionId]) {
          setCurrentAgent(saved[sessionId])
        }
      } catch {}
    }).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (loadedPersistedRef.current || currentAgent || agents.length === 0) return
    AsyncStorage.getItem(AGENT_KEY).then((raw) => {
      if (raw) {
        loadedPersistedRef.current = true
        setCurrentAgent(raw)
      }
    }).catch(() => {})
  }, [currentAgent, agents.length])

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