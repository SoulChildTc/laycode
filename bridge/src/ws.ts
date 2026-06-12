import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { BridgeConfig } from './types.js'

let wss: WebSocketServer | null = null
let httpServer: ReturnType<typeof createServer> | null = null

export function startWebSocketServer(config: BridgeConfig) {
  httpServer = createServer()
  wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws) => {
    const sseUrl = `${config.opencodeUrl}/global/event`
    const controller = new AbortController()

    const connectSSE = async () => {
      try {
        const response = await fetch(sseUrl, {
          headers: { 'Accept': 'text/event-stream' },
          signal: controller.signal,
        })

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(line.slice(6))
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('SSE connection error:', err)
        }
      }
    }

    connectSSE()

    ws.on('close', () => controller.abort())
    ws.on('error', () => controller.abort())
  })

  wss.on('error', (err) => {
    console.error('WebSocket error:', err)
  })

  const wsPort = config.port + 1
  httpServer.listen(wsPort, () => {
    console.log(`  WebSocket:   ws://0.0.0.0:${wsPort}/event`)
  })
}

export function stopWebSocketServer() {
  wss?.close()
  wss = null
  httpServer?.close()
  httpServer = null
}
