import { useState, useRef, useCallback } from 'react'
import { LayCodeClient } from '../api/client'

export type TerminalStatus = 'idle' | 'creating' | 'connected' | 'exited' | 'error'

export function useTerminal(client: LayCodeClient, directory: string, bridgeHost: string, bridgePort: number) {
  const [ptyID, setPtyID] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('idle')
  const [wsUrl, setWsUrl] = useState<string>('')
  const [ticket, setTicket] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const connect = useCallback(async (id: string) => {
    setStatus('creating')
    setErrorMessage('')
    try {
      const pty = await client.getPty(id, directory)
      if (!pty) {
        setPtyID(null)
        setStatus('idle')
        setErrorMessage('')
        return null
      }

      const token = await client.connectPtyToken(id, directory)
      if (!token) {
        setErrorMessage('Failed to get token')
        setStatus('error')
        return null
      }

      setPtyID(id)
      const wsu = 'ws://' + bridgeHost + ':' + bridgePort + '/opencode-api/pty/' + id + '/connect'
      setWsUrl(wsu)
      setTicket(token.ticket)
      setStatus('connected')

      return { ptyID: id, wsUrl: wsu, ticket: token.ticket }
    } catch (err: any) {
      setErrorMessage(err?.message || String(err))
      setStatus('error')
      return null
    }
  }, [client, directory, bridgeHost, bridgePort])

  const create = useCallback(async () => {
    setStatus('creating')
    setErrorMessage('')
    try {
      const pty = await client.createPty(directory, directory)
      if (!pty) {
        setErrorMessage('PTY creation returned empty')
        setStatus('error')
        return null
      }

      const token = await client.connectPtyToken(pty.id, directory)
      if (!token) {
        setErrorMessage('Failed to get token')
        setStatus('error')
        return null
      }

      setPtyID(pty.id)
      const wsu = 'ws://' + bridgeHost + ':' + bridgePort + '/opencode-api/pty/' + pty.id + '/connect'
      setWsUrl(wsu)
      setTicket(token.ticket)
      setStatus('connected')

      return { ptyID: pty.id, wsUrl: wsu, ticket: token.ticket }
    } catch (err: any) {
      setErrorMessage(err?.message || String(err))
      setStatus('error')
      return null
    }
  }, [client, directory, bridgeHost, bridgePort])

  const destroy = useCallback(async () => {
    const id = ptyID
    if (id) {
      try {
        await client.removePty(id, directory)
      } catch {}
      setPtyID(null)
      setWsUrl('')
      setTicket('')
      setStatus('idle')
      setErrorMessage('')
    }
  }, [client, directory, ptyID])

  const reset = useCallback(() => {
    setPtyID(null)
    setWsUrl('')
    setTicket('')
    setStatus('idle')
    setErrorMessage('')
  }, [])

  const resize = useCallback(async (cols: number, rows: number) => {
    const id = ptyID
    if (id && cols > 0 && rows > 0) {
      await client.updatePtySize(id, cols, rows, directory)
    }
  }, [client, directory, ptyID])

  return { ptyID, status, wsUrl, ticket, errorMessage, create, connect, destroy, reset, resize, setStatus }
}