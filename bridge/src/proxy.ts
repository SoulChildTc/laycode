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

    try {
      if (req.path.includes('prompt_async') || req.path.includes('message')) {
        console.log(`\n[PROXY DEBUG] ${req.method} ${req.path}`)
        console.log(`[PROXY DEBUG] Body:`, JSON.stringify(req.body))
        console.log(`[PROXY DEBUG] Target: ${targetUrl}\n`)
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...headers,
          'host': new URL(config.opencodeUrl).host,
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
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
