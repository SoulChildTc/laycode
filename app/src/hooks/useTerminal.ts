import { useState, useRef, useCallback, useEffect } from 'react'
import { LayCodeClient } from '../api/client'

export type TerminalStatus = 'idle' | 'creating' | 'connected' | 'exited' | 'error'

export function useTerminal(client: LayCodeClient, directory: string, bridgeHost: string, bridgePort: number) {
  const [ptyID, setPtyID] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('idle')
  const [wsUrl, setWsUrl] = useState<string>('')
  const ptyIdRef = useRef<string | null>(null)

  const createPty = useCallback(async () => {
    setStatus('creating')
    const pty = await client.createPty(directory, directory)
    if (!pty) {
      setStatus('error')
      return null
    }

    const token = await client.connectPtyToken(pty.id)
    if (!token) {
      setStatus('error')
      return null
    }

    ptyIdRef.current = pty.id
    setPtyID(pty.id)

    const wsu = `ws://${bridgeHost}:${bridgePort}/opencode-api/pty/${pty.id}/connect`
    setWsUrl(wsu)

    return { ptyID: pty.id, wsUrl: wsu, ticket: token.ticket }
  }, [client, directory, bridgeHost, bridgePort])

  const destroyPty = useCallback(async () => {
    const id = ptyIdRef.current
    if (id) {
      await client.removePty(id)
      ptyIdRef.current = null
      setPtyID(null)
      setWsUrl('')
      setStatus('idle')
    }
  }, [client])

  const resizePty = useCallback(async (cols: number, rows: number) => {
    const id = ptyIdRef.current
    if (id && cols > 0 && rows > 0) {
      await client.updatePtySize(id, cols, rows)
    }
  }, [client])

  useEffect(() => {
    return () => {
      const id = ptyIdRef.current
      if (id) {
        client.removePty(id).catch(() => {})
      }
    }
  }, [client])

  return { ptyID, status, wsUrl, createPty, destroyPty, resizePty, setStatus }
}
