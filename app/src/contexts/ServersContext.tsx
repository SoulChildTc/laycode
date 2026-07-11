import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ServerEntry } from '../types'
import { LayCodeClient } from '../api/client'

// token 校验三态：'ok'=可用，'unauthorized'=token 错，'offline'=连不上服务器。
export type VerifyResult = 'ok' | 'unauthorized' | 'offline'

const SERVERS_KEY = '@laycode/saved-servers'
const LAST_KEY = '@laycode/last-server-id'

function genId() {
  return 'srv_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

interface ServersContextValue {
  servers: ServerEntry[]
  loaded: boolean
  add: (entry: Omit<ServerEntry, 'id'>) => Promise<{ server: ServerEntry; reused: boolean }>
  update: (id: string, entry: Partial<ServerEntry>) => Promise<ServerEntry | undefined>
  remove: (id: string) => Promise<void>
  test: (entry: { host: string; port: number; token: string }) => Promise<VerifyResult>
  connect: (entry: ServerEntry) => Promise<VerifyResult>
  getLast: () => Promise<ServerEntry | undefined>
  reload: () => Promise<void>
}

const ServersContext = createContext<ServersContextValue | null>(null)

export function ServersProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const serversRef = useRef<ServerEntry[]>([])

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SERVERS_KEY)
      if (raw) {
        const list = JSON.parse(raw)
        serversRef.current = list
        setServers(list)
      }
    } catch {}
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (list: ServerEntry[]) => {
    serversRef.current = list
    setServers(list)
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(list))
  }, [])

  const add = useCallback(async (entry: Omit<ServerEntry, 'id'>) => {
    const current = serversRef.current
    const existing = current.find((s) => s.host === entry.host && s.port === entry.port)
    if (existing) {
      const merged: ServerEntry = { ...existing, ...entry, id: existing.id }
      await save(current.map((s) => (s.id === existing.id ? merged : s)))
      return { server: merged, reused: true }
    }
    const newEntry: ServerEntry = { ...entry, id: genId() }
    await save([newEntry, ...current])
    return { server: newEntry, reused: false }
  }, [save])

  const update = useCallback(async (id: string, entry: Partial<ServerEntry>) => {
    const current = serversRef.current
    let updated: ServerEntry | undefined
    const list = current.map((s) => {
      if (s.id === id) { updated = { ...s, ...entry }; return updated }
      return s
    })
    await save(list)
    return updated
  }, [save])

  const remove = useCallback(async (id: string) => {
    await save(serversRef.current.filter((s) => s.id !== id))
  }, [save])

  const test = useCallback(async (entry: { host: string; port: number; token: string }): Promise<VerifyResult> => {
    const client = new LayCodeClient(entry)
    return await client.verify()
  }, [])

  const connect = useCallback(async (entry: ServerEntry): Promise<VerifyResult> => {
    const client = new LayCodeClient({ host: entry.host, port: entry.port, token: entry.token })
    const result = await client.verify()
    // 只有 token 校验通过才记为「上次连接」，避免下次自动连到一个 token 已失效的服务器。
    if (result === 'ok') await AsyncStorage.setItem(LAST_KEY, entry.id)
    return result
  }, [])

  const getLast = useCallback(async () => {
    const lastId = await AsyncStorage.getItem(LAST_KEY)
    if (lastId) return serversRef.current.find((s) => s.id === lastId)
    return undefined
  }, [])

  const value: ServersContextValue = { servers, loaded, add, update, remove, test, connect, getLast, reload: load }
  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>
}

export function useServers(): ServersContextValue {
  const ctx = useContext(ServersContext)
  if (!ctx) throw new Error('useServers must be used within ServersProvider')
  return ctx
}
