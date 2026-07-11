import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import { BridgeConfig } from './types.js'

// 事件 WS 不再独占端口，改为挂在主 HTTP server 的 upgrade 事件上（与 PTY WS 共用 8079）。
let wss: WebSocketServer | null = null

export function startWebSocketServer(config: BridgeConfig) {
  wss = new WebSocketServer({ noServer: true })

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
          // 按行切分，兼容 \r\n 与 \n；保留最后一段不完整的行留待下次拼接
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data:')) {
              // SSE 规范：data: 后可有一个可选空格
              const data = line.slice(5).replace(/^ /, '')
              if (data && ws.readyState === WebSocket.OPEN) {
                ws.send(data)
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

  console.log(`  Event WS:    ws://0.0.0.0:${config.port}/event`)
}

// 由主 server 的 upgrade 事件调用：处理事件流 WS 握手
export function handleEventUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  if (!wss) { socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss!.emit('connection', ws, req)
  })
}

export function stopWebSocketServer() {
  if (wss) {
    // 先强制终结所有已连接客户端，否则底层 socket 会吊住事件循环、进程无法退出。
    for (const client of wss.clients) {
      try { client.terminate() } catch {}
    }
    wss.close()
    wss = null
  }
}
