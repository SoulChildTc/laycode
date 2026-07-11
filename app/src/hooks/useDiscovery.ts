import { useState, useEffect, useCallback, useRef } from 'react'
import { NativeModules } from 'react-native'

const BRIDGE_PORT = 8079

// mDNS 依赖原生模块，Expo Go（iOS/Android）都不含它。运行时检测模块是否可用即可，
// 无需按平台猜测：模块不在则功能隐藏，在则启用（不论 iOS 还是 Android）。
const MDNS_AVAILABLE = !!NativeModules.RNZeroconf

export interface DiscoveredBridge {
  host: string
  port: number
  name?: string
}

function mdnsScan(onFound: (b: DiscoveredBridge) => void, onError: (e: any) => void): () => void {
  let Zeroconf: any
  try {
    Zeroconf = require('react-native-zeroconf').default
  } catch {
    onError(new Error('react-native-zeroconf not available'))
    return () => {}
  }

  const zeroconf = new Zeroconf()
  // 保底：即便 require 成功，实例或 scan 方法缺失时也不崩溃。
  if (!zeroconf || typeof zeroconf.scan !== 'function') {
    onError(new Error('mDNS 不可用'))
    return () => {}
  }

  zeroconf.on('resolved', (service: any) => {
    const addr = service.addresses?.[0]
    if (addr) {
      onFound({ host: addr, port: service.port || BRIDGE_PORT, name: service.name })
    }
  })

  zeroconf.on('error', (err: any) => onError(err))

  zeroconf.scan('laycode', 'tcp', 'local')

  return () => {
    zeroconf.stop()
    zeroconf.removeDeviceListeners()
  }
}

export function useDiscovery() {
  const [scanning, setScanning] = useState(false)
  const [bridges, setBridges] = useState<DiscoveredBridge[]>([])
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const scan = useCallback(() => {
    cleanupRef.current?.()
    setScanning(true)
    setBridges([])

    if (!MDNS_AVAILABLE) {
      setScanning(false)
      return
    }

    const found: DiscoveredBridge[] = []
    const onFound = (b: DiscoveredBridge) => {
      if (!found.some((f) => f.host === b.host)) {
        found.push(b)
        setBridges([...found])
      }
    }

    const cleanup = mdnsScan(onFound, () => setScanning(false))
    cleanupRef.current = cleanup
    setTimeout(() => setScanning(false), 10000)
  }, [])

  return { scan, scanning, bridges, available: MDNS_AVAILABLE }
}
