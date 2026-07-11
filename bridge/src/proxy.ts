import { Request, Response } from 'express'
import { BridgeConfig } from './types.js'

export function createProxyHandler(config: BridgeConfig) {
  return async (req: Request, res: Response) => {
    const queryString = req.url.includes('?') ? req.url.split('?')[1] : ''
    const targetUrl = `${config.opencodeUrl}${req.path}${queryString ? '?' + queryString : ''}`

    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'connection'].includes(key)) continue
      if (value) headers[key] = Array.isArray(value) ? value.join(', ') : value
    }

    // 按请求体的实际形态转发：JSON 请求体经 express.json 解析为对象，需重新序列化；
    // 其他类型经 express.raw 保留为 Buffer，原样透传。空体不发。
    let requestBody: string | Buffer | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (Buffer.isBuffer(req.body)) {
        requestBody = req.body.length > 0 ? req.body : undefined
      } else if (req.body && Object.keys(req.body).length > 0) {
        requestBody = JSON.stringify(req.body)
      }
    }

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...headers,
          'host': new URL(config.opencodeUrl).host,
        },
        body: requestBody,
      })

      const body = await response.text()

      res.status(response.status)
      for (const [key, value] of response.headers) {
        if (key === 'content-encoding' || key === 'content-length') continue
        res.setHeader(key, value)
      }
      res.setHeader('content-length', Buffer.byteLength(body, 'utf-8'))

      res.send(body)
    } catch (err) {
      console.error('Proxy error:', err)
      res.status(502).json({ error: 'Bad Gateway', message: 'Cannot reach opencode server' })
    }
  }
}
