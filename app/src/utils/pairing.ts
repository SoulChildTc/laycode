// 解析 bridge 打印的配对 URI：laycode://connect?host=..&port=..&token=..&name=..
export interface PairingInfo {
  host: string
  port: number
  token: string
  name?: string
}

export function parsePairingUri(raw: string): PairingInfo | null {
  try {
    if (!raw.startsWith('laycode://')) return null
    // RN 的 URL 对自定义 scheme 支持不稳，手动取 query 部分
    const q = raw.split('?')[1]
    if (!q) return null
    const params = new URLSearchParams(q)
    const host = params.get('host')
    const token = params.get('token')
    const port = parseInt(params.get('port') || '8079', 10)
    if (!host || !token) return null
    return {
      host,
      port: Number.isFinite(port) ? port : 8079,
      token,
      name: params.get('name') || undefined,
    }
  } catch {
    return null
  }
}
