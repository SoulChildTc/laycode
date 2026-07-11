import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ServerEntry } from '../types'
import { LayCodeClient } from '../api/client'

const SERVERS_KEY = '@laycode/saved-servers'
const LAST_KEY = '@laycode/last-server-id'

let idCounter = Date.now()
function genId() {
  return String(++idCounter)
}

export function useServers() {
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const raw = await AsyncStorage.getItem(SERVERS_KEY)
      if (raw) {
        setServers(JSON.parse(raw))
      }
    } catch {}
    setLoaded(true)
  }

  const save = async (list: ServerEntry[]) => {
    setServers(list)
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(list))
  }

  const add = useCallback(async (entry: Omit<ServerEntry, 'id'>): Promise<ServerEntry> => {
    // 同一台电脑（host+port 相同）复用已有记录，保留原 id，只更新 token/name。
    // 否则扫码/手动重连会生成新 id，导致按 serverId 存储的工作区等数据丢失。
    const existing = servers.find((s) => s.host === entry.host && s.port === entry.port)
    if (existing) {
      const merged: ServerEntry = { ...existing, ...entry, id: existing.id }
      const list = servers.map((s) => (s.id === existing.id ? merged : s))
      await save(list)
      return merged
    }
    const newEntry: ServerEntry = { ...entry, id: genId() }
    const list = [newEntry, ...servers]
    await save(list)
    return newEntry
  }, [servers])

  const update = useCallback(async (id: string, entry: Partial<ServerEntry>) => {
    const list = servers.map((s) => (s.id === id ? { ...s, ...entry } : s))
    await save(list)
  }, [servers])

  const remove = useCallback(async (id: string) => {
    const list = servers.filter((s) => s.id !== id)
    await save(list)
  }, [servers])

  const test = useCallback(async (entry: { host: string; port: number; token: string }): Promise<boolean> => {
    const client = new LayCodeClient(entry)
    return await client.health()
  }, [])

  const connect = useCallback(async (entry: ServerEntry): Promise<boolean> => {
    const client = new LayCodeClient({ host: entry.host, port: entry.port, token: entry.token })
    const ok = await client.health()
    if (ok) {
      await AsyncStorage.setItem(LAST_KEY, entry.id)
    }
    return ok
  }, [])

  const getLast = useCallback(async (): Promise<ServerEntry | undefined> => {
    const lastId = await AsyncStorage.getItem(LAST_KEY)
    if (lastId) {
      return servers.find((s) => s.id === lastId)
    }
    return undefined
  }, [servers])

  return { servers, loaded, add, update, remove, test, connect, getLast, reload: load }
}