import { useState, useRef, useCallback, useEffect } from 'react'
import { LayCodeClient } from '../api/client'

export type TerminalStatus = 'idle' | 'creating' | 'connected' | 'exited' | 'error'

export function useTerminal(client: LayCodeClient, directory: string, bridgeHost: string, bridgePort: number) {
  const [ptyID, setPtyID] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('idle')
  const [wsUrl, setWsUrl] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const ptyIdRef = useRef<string | null>(null)

  const createPty = useCallback(async () => {
    setStatus('creating')
    setErrorMessage('')
    try {
      const pty = await client.createPty(directory, directory)
      if (!pty) {
        setErrorMessage('PTY creation returned empty response')
        setStatus('error')
        return null
      }

      const token = await client.connectPtyToken(pty.id)
      if (!token) {
        setErrorMessage('Failed to get WebSocket token')
        setStatus('error')
        return null
      }

      ptyIdRef.current = pty.id
      setPtyID(pty.id)

      const wsu = 'ws://' + bridgeHost + ':' + bridgePort + '/opencode-api/pty/' + pty.id + '/connect'
      setWsUrl(wsu)

      return { ptyID: pty.id, wsUrl: wsu, ticket: token.ticket }
    } catch (err: any) {
      setErrorMessage(err?.message || String(err))
      setStatus('error')
      return null
    }
  }, [client, directory, bridgeHost, bridgePort])

  const destroyPty = useCallback(async () => {
    const id = ptyIdRef.current
    if (id) {
      try {
        await client.removePty(id)
      } catch {}
      ptyIdRef.current = null
      setPtyID(null)
      setWsUrl('')
      setStatus('idle')
      setErrorMessage('')
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

  return { ptyID, status, wsUrl, errorMessage, createPty, destroyPty, resizePty, setStatus }
}