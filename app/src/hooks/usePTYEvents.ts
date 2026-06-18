import { useEffect, useRef } from 'react'

type PTYEvent = {
  type: 'pty.created' | 'pty.updated' | 'pty.exited' | 'pty.deleted'
  properties: { id: string; exitCode?: number; info?: any }
}

type EventCallback = {
  onDeleted?: (ptyID: string) => void
  onExited?: (ptyID: string, exitCode: number) => void
}

export function usePTYEvents(wsUrl: string, serverId: string, callbacks?: EventCallback) {
  var cbRef = useRef(callbacks)
  cbRef.current = callbacks

  useEffect(function() {
    if (!wsUrl) return
    var ws: WebSocket | null = null
    var reconnectTimer: any = null
    var closed = false

    function connect() {
      if (closed) return
      ws = new WebSocket(wsUrl)

      ws.onmessage = function(ev) {
        try {
          var msg = JSON.parse(ev.data)
          if (msg && msg.payload) {
            var payload = msg.payload as PTYEvent
            if (payload.type === 'pty.deleted') {
              cbRef.current?.onDeleted?.(payload.properties.id)
            } else if (payload.type === 'pty.exited') {
              cbRef.current?.onExited?.(payload.properties.id, payload.properties.exitCode || 0)
            }
          }
        } catch {}
      }

      ws.onclose = function() {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 5000)
        }
      }

      ws.onerror = function() {
        ws?.close()
      }
    }

    connect()
    return function() {
      closed = true
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [wsUrl, serverId])
}
