import AsyncStorage from '@react-native-async-storage/async-storage'
import { storageKey } from '../utils/storage'

function storeKey(serverId: string): string {
  return storageKey(serverId, 'terminal_sessions')
}

export async function addKnownDir(serverId: string, dir: string): Promise<void> {
  try {
    var raw = await AsyncStorage.getItem(storeKey(serverId))
    var store: { knownDirs: string[] } = raw ? JSON.parse(raw) : { knownDirs: [] }
    if (!store.knownDirs.includes(dir)) {
      store.knownDirs.push(dir)
      await AsyncStorage.setItem(storeKey(serverId), JSON.stringify(store))
    }
  } catch {}
}

export async function getKnownDirs(serverId: string): Promise<string[]> {
  try {
    var raw = await AsyncStorage.getItem(storeKey(serverId))
    if (raw) {
      var store = JSON.parse(raw)
      return store.knownDirs || []
    }
  } catch {}
  return []
}

export async function removeKnownDir(serverId: string, dir: string): Promise<void> {
  try {
    var raw = await AsyncStorage.getItem(storeKey(serverId))
    if (raw) {
      var store = JSON.parse(raw)
      store.knownDirs = store.knownDirs.filter((d: string) => d !== dir)
      await AsyncStorage.setItem(storeKey(serverId), JSON.stringify(store))
    }
  } catch {}
}
