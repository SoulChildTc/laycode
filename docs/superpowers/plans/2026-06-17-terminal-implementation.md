# Terminal Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-featured terminal (WebView + xterm.js) to LayCode mobile, accessible via bottom tab bar and chat session FAB.

**Architecture:** WebView hosts xterm.js which manages its own WebSocket to opencode's PTY via bridge WebSocket proxy. RN native layer provides virtual keyboard toolbar and PTY lifecycle management. Zero SSH support.

**Tech Stack:** `react-native-webview`, `xterm` v5, `xterm-addon-fit`, `@opencode-ai/sdk` v2 PTY API, `ws`, Node.js `net`

---

### Task 1: Bridge — WebSocket upgrade proxy for PTY

**Files:**
- Modify: `bridge/src/index.ts:242-253`

- [ ] **Step 1: Add `net` import and WebSocket upgrade handler**

Add `import net from 'net'` to the top of bridge/src/index.ts.

Add upgrade handler right after the `server = app.listen(...)` block (after line 253). The handler intercepts WebSocket upgrade requests to `/opencode-api/pty/{ptyID}/connect`, proxies them to opencode via raw TCP:

```ts
import net from 'net'

// ... existing code ...

const server = app.listen(config.port, async () => {
  // existing startup code...
})

// WebSocket proxy for PTY connections
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  const match = url.pathname.match(/^\/opencode-api\/pty\/([^/]+)\/connect$/)
  if (!match) {
    socket.destroy()
    return
  }

  const targetPath = `/pty/${match[1]}/connect${url.search}`
  const target = new URL(targetPath, config.opencodeUrl)

  const proxy = net.connect(Number(target.port) || 80, target.hostname, () => {
    proxy.write(
      `GET ${targetPath} HTTP/1.1\r\n` +
      `Host: ${target.host}\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key'] || ''}\r\n` +
      `Sec-WebSocket-Version: ${req.headers['sec-websocket-version'] || '13'}\r\n` +
      `\r\n`
    )
    proxy.pipe(socket)
    socket.pipe(proxy)
  })

  proxy.on('error', () => { try { socket.destroy() } catch {} })
  socket.on('error', () => { try { proxy.destroy() } catch {} })
})
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npx tsc --noEmit` in bridge/ directory. Should pass.

- [ ] **Step 3: Commit**

```bash
git add bridge/src/index.ts
git commit -m "feat(bridge): add WebSocket upgrade proxy for PTY connections"
```

---

### Task 2: App — Install react-native-webview

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Install react-native-webview**

```bash
cd app && npx expo install react-native-webview
```

- [ ] **Step 2: Commit**

```bash
git add app/package.json app/yarn.lock
git commit -m "chore: install react-native-webview for terminal"
```

---

### Task 3: App — Add PTY methods to LayCodeClient

**Files:**
- Modify: `app/src/api/client.ts` (append before closing brace)

- [ ] **Step 1: Add PTY methods**

Append these methods to the `LayCodeClient` class before the closing `}`:

```ts
async createPty(directory: string, cwd?: string, command?: string): Promise<any> {
  const res = await fetch(`${this.baseUrl}/opencode-api/pty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
    body: JSON.stringify({ directory, cwd, command }),
  })
  if (!res.ok) return null
  return res.json()
}

async listPty(directory?: string): Promise<any[]> {
  const params = directory ? `?directory=${encodeURIComponent(directory)}` : ''
  const res = await fetch(`${this.baseUrl}/opencode-api/pty${params}`, {
    headers: { Authorization: `Bearer ${this.token}` },
  })
  if (!res.ok) return []
  return res.json()
}

async getPty(ptyID: string): Promise<any> {
  const res = await fetch(`${this.baseUrl}/opencode-api/pty/${encodeURIComponent(ptyID)}`, {
    headers: { Authorization: `Bearer ${this.token}` },
  })
  if (!res.ok) return null
  return res.json()
}

async removePty(ptyID: string): Promise<boolean> {
  const res = await fetch(`${this.baseUrl}/opencode-api/pty/${encodeURIComponent(ptyID)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${this.token}` },
  })
  return res.ok
}

async updatePtySize(ptyID: string, cols: number, rows: number): Promise<boolean> {
  const res = await fetch(`${this.baseUrl}/opencode-api/pty/${encodeURIComponent(ptyID)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
    body: JSON.stringify({ size: { cols, rows } }),
  })
  return res.ok
}

async connectPtyToken(ptyID: string): Promise<{ ticket: string } | null> {
  const res = await fetch(`${this.baseUrl}/opencode-api/pty/${encodeURIComponent(ptyID)}/connect-token`, {
    headers: { Authorization: `Bearer ${this.token}` },
  })
  if (!res.ok) return null
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/api/client.ts
git commit -m "feat(client): add PTY lifecycle methods"
```

---

### Task 4: App — Create xterm.js HTML asset

**Files:**
- Create: `app/src/assets/terminal.html`

- [ ] **Step 1: Create the HTML file**

```html
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  body { margin: 0; padding: 0; background: #0f0f1a; overflow: hidden; }
  #terminal { width: 100vw; height: 100vh; }
  #overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,15,26,0.9); color: #888; font-family: monospace; font-size: 16px; align-items: center; justify-content: center; z-index: 10; }
</style>
</head>
<body>
<div id="terminal"></div>
<div id="overlay"></div>
<script>
const params = new URLSearchParams(location.search)
const wsUrl = params.get('wsUrl')
const ticket = params.get('ticket')
const cursor = params.get('cursor') || '-1'

if (!wsUrl) {
  document.getElementById('overlay').style.display = 'flex'
  document.getElementById('overlay').textContent = 'Error: No WebSocket URL provided'
} else {
  importScripts = false
  const s = document.createElement('script')
  s.src = 'https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.min.js'
  s.onload = () => {
    const fit = document.createElement('script')
    fit.src = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.10.0/lib/xterm-addon-fit.min.js'
    fit.onload = init
    document.head.appendChild(fit)
  }
  document.head.appendChild(s)
}

function init() {
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: { background: '#0f0f1a', foreground: '#e8e8f0', cursor: '#e8e8f0', selectionBackground: '#6c7dff44' },
    allowTransparency: false,
    cols: 80,
    rows: 24,
  })

  const fitAddon = new FitAddon.FitAddon()
  term.loadAddon(fitAddon)

  term.open(document.getElementById('terminal'))
  fitAddon.fit()

  let ws = null
  let reconnectTimer = null
  let reconnectAttempts = 0
  const MAX_RECONNECT = 3

  function connect() {
    const fullUrl = wsUrl + '?ticket=' + ticket + '&cursor=' + cursor
    ws = new WebSocket(fullUrl)

    ws.onopen = () => {
      reconnectAttempts = 0
      term.focus()
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ws-open' }))
    }

    ws.onmessage = (ev) => {
      if (ev.data instanceof Blob) {
        ev.data.arrayBuffer().then(buf => {
          const u8 = new Uint8Array(buf)
          if (u8[0] === 0x00) {
            const meta = JSON.parse(new TextDecoder().decode(u8.slice(1)))
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cursor', cursor: meta.cursor }))
          } else {
            term.write(new Uint8Array(buf))
          }
        })
        return
      }
      term.write(ev.data)
    }

    ws.onclose = (e) => {
      if (e.code !== 1000 && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++
        reconnectTimer = setTimeout(connect, 2000 * reconnectAttempts)
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ws-close', code: e.code }))
    }

    ws.onerror = () => {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ws-error' }))
    }
  }

  connect()

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })

  window.addEventListener('resize', () => {
    try { fitAddon.fit() } catch {}
  })

  window.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'keystroke') {
        term.paste(msg.data)
      } else if (msg.type === 'resize') {
        term.resize(msg.cols, msg.rows)
      }
    } catch {}
  })

  window.termReady = true
}
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/assets/terminal.html
git commit -m "feat: add xterm.js HTML asset for WebView terminal"
```

---

### Task 5: App — Create useTerminal hook

**Files:**
- Create: `app/src/hooks/useTerminal.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useState, useRef, useCallback, useEffect } from 'react'
import { LayCodeClient } from '../api/client'

export type TerminalStatus = 'idle' | 'creating' | 'connected' | 'exited' | 'error'

export function useTerminal(client: LayCodeClient, directory: string, bridgeHost: string, bridgePort: number) {
  const [ptyID, setPtyID] = useState<string | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('idle')
  const [wsUrl, setWsUrl] = useState<string>('')
  const [lastCursor, setLastCursor] = useState<string>('-1')
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

  const handleCursorUpdate = useCallback((cursor: number) => {
    setLastCursor(String(cursor))
  }, [])

  useEffect(() => {
    return () => {
      const id = ptyIdRef.current
      if (id) {
        client.removePty(id).catch(() => {})
      }
    }
  }, [client])

  return { ptyID, status, wsUrl, lastCursor, createPty, destroyPty, resizePty, handleCursorUpdate, setStatus }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/hooks/useTerminal.ts
git commit -m "feat: add useTerminal hook for PTY lifecycle management"
```

---

### Task 6: App — Create TerminalToolbar component

**Files:**
- Create: `app/src/components/TerminalToolbar.tsx`

- [ ] **Step 1: Create the toolbar component**

```tsx
import React, { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { Theme } from '../theme'

interface Props {
  theme: Theme
  onKeystroke: (data: string) => void
  visible: boolean
}

const CTRL_MAP: Record<string, string> = {
  C: '\x03', D: '\x04', Z: '\x1a', L: '\x0c', U: '\x15',
  A: '\x01', E: '\x05', W: '\x17', R: '\x12',
}

const LETTERS = ['C', 'D', 'Z', 'L', 'U', 'A', 'E', 'W', 'R']

export default function TerminalToolbar({ theme, onKeystroke, visible }: Props) {
  const [ctrlOn, setCtrlOn] = useState(false)
  const [altOn, setAltOn] = useState(false)

  const handleCtrl = useCallback(() => {
    if (ctrlOn) { setCtrlOn(false); return }
    setCtrlOn(true)
    setAltOn(false)
  }, [ctrlOn])

  const handleAlt = useCallback(() => {
    if (altOn) { setAltOn(false); return }
    setAltOn(true)
    setCtrlOn(false)
  }, [altOn])

  const handleKey = useCallback((key: string) => {
    onKeystroke(key)
    setCtrlOn(false)
    setAltOn(false)
  }, [onKeystroke])

  const handleCtrlLetter = useCallback((letter: string) => {
    onKeystroke(CTRL_MAP[letter])
    setCtrlOn(false)
  }, [onKeystroke])

  if (!visible) return null

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, ctrlOn && { backgroundColor: theme.accent + '40' }]} onPress={handleCtrl}>
          <Text style={[styles.btnText, ctrlOn ? { color: theme.accent } : { color: theme.textSecondary }]}>Ctrl</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, altOn && { backgroundColor: theme.accent + '40' }]} onPress={handleAlt}>
          <Text style={[styles.btnText, altOn ? { color: theme.accent } : { color: theme.textSecondary }]}>Alt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => handleKey('\x1b')}>
          <Text style={styles.btnText}>Esc</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => handleKey('\t')}>
          <Text style={styles.btnText}>Tab</Text>
        </TouchableOpacity>
      </View>
      {ctrlOn && (
        <View style={styles.subRow}>
          {LETTERS.map((l) => (
            <TouchableOpacity key={l} style={[styles.smallBtn, { borderColor: theme.accent + '40' }]} onPress={() => handleCtrlLetter(l)}>
              <Text style={[styles.smallBtnText, { color: theme.accent }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {altOn && (
        <View style={styles.subRow}>
          {['B', 'F', 'D', '←', '→'].map((k) => (
            <TouchableOpacity key={k} style={[styles.smallBtn, { borderColor: theme.accent + '40' }]} onPress={() => {
              if (k === '←') handleKey('\x1b[D')
              else if (k === '→') handleKey('\x1b[C')
              else handleKey('\x1b' + k.toLowerCase())
            }}>
              <Text style={[styles.smallBtnText, { color: theme.accent }]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[A')}>
          <Text style={styles.btnText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[B')}>
          <Text style={styles.btnText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[D')}>
          <Text style={styles.btnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[C')}>
          <Text style={styles.btnText}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b0b0cc',
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 36,
    alignItems: 'center',
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  arrowBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/TerminalToolbar.tsx
git commit -m "feat: add TerminalToolbar with Ctrl/Alt/Esc/Tab/arrow keys"
```

---

### Task 7: App — Create TerminalScreen

**Files:**
- Create: `app/src/screens/TerminalScreen.tsx`

- [ ] **Step 1: Create the terminal screen**

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { Feather } from '@expo/vector-icons'
import TerminalToolbar from '../components/TerminalToolbar'
import { useTerminal } from '../hooks/useTerminal'
import type { LayCodeClient } from '../api/client'
import type { ThemeMode, ServerEntry } from '../types'
import { getTheme } from '../theme'

interface Props {
  navigation: any
  route: { params?: { directory?: string } }
  themeMode: ThemeMode
  client: LayCodeClient
  config: ServerEntry
}

const CHAR_W = 9
const CHAR_H = 20

export default function TerminalScreen({ navigation, route, themeMode, client, config }: Props) {
  const theme = getTheme(themeMode)
  const directory = route.params?.directory || ''
  const [host, port] = (config?.host && config?.port) ? [config.host, config.port] : ['localhost', 8079]
  const { ptyID, status, wsUrl, createPty, destroyPty, resizePty, setStatus } = useTerminal(client, directory, host, port)
  const webViewRef = useRef<WebView>(null)
  const [containerSize, setContainerSize] = useState({ width: 400, height: 400 })
  const [exited, setExited] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ticketRef = useRef('')

  useEffect(() => {
    (async () => {
      const pty = await client.createPty(directory, directory)
      if (!pty) { setStatus('error'); return }
      const token = await client.connectPtyToken(pty.id)
      if (!token) { setStatus('error'); return }
      ticketRef.current = token.ticket
      setLoaded(true)
    })()
    return () => { destroyPty() }
  }, [])

  const htmlUri = useCallback(() => {
    if (!ticketRef.current) return 'about:blank'
    const wsu = `ws://${host}:${port}/opencode-api/pty/ptyID/connect`
    return undefined
  }, [host, port])

  const htmlContent = useCallback(() => {
    if (!ticketRef.current) return '<html><body></body></html>'
    const ptyIDVal = ptyID
    const ptyHtml = `
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>body{margin:0;padding:0;background:#0f0f1a;overflow:hidden}#t{width:100vw;height:100vh}#o{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,15,26,0.9);color:#888;font-family:monospace;font-size:16px;align-items:center;justify-content:center;z-index:10}</style></head>
<body><div id="t"></div><div id="o"></div>
<script>
var w='${wsu}',p='${ticketRef.current}',c='-1'
if(!w){document.getElementById('o').style.display='flex';document.getElementById('o').textContent='No WS URL'}
else{
var s=document.createElement('script')
s.src='https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.min.js'
s.onload=function(){
var f=document.createElement('script')
f.src='https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.10.0/lib/xterm-addon-fit.min.js'
f.onload=init;document.head.appendChild(f)
}
document.head.appendChild(s)
}
function init(){
var t=new Terminal({cursorBlink:true,cursorStyle:'bar',fontSize:14,fontFamily:'Menlo,Monaco,Courier New,monospace',theme:{background:'#0f0f1a',foreground:'#e8e8f0',cursor:'#e8e8f0',selectionBackground:'#6c7dff44'},cols:80,rows:24})
var a=new FitAddon.FitAddon();t.loadAddon(a);t.open(document.getElementById('t'));a.fit()
var ws=null,r=0;var u=w+'?ticket='+p+'&cursor='+c
function connect(){ws=new WebSocket(u)
ws.onopen=function(){r=0;t.focus();window.ReactNativeWebView.postMessage(JSON.stringify({type:'ws-open'}))}
ws.onmessage=function(e){
if(e.data instanceof Blob){e.data.arrayBuffer().then(function(b){var u8=new Uint8Array(b);if(u8[0]===0){var m=JSON.parse(new TextDecoder().decode(u8.slice(1)));window.ReactNativeWebView.postMessage(JSON.stringify({type:'cursor',cursor:m.cursor}))}else{t.write(new Uint8Array(b))}});return}
t.write(e.data)}
ws.onclose=function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ws-close',code:e.code}))}
ws.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ws-error'}))}}
connect()
t.onData(function(d){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(d)})
window.addEventListener('resize',function(){try{a.fit()}catch(e){}})
window.addEventListener('message',function(e){try{var m=JSON.parse(e.data);if(m.type==='keystroke')t.paste(m.data);if(m.type==='resize')t.resize(m.cols,m.rows)}catch(ex){}})
}
</script></body></html>`
    return ptyHtml
  }, [ptyID, wsUrl, host, port])

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ws-close') {
        setExited(true)
        setStatus('exited')
      } else if (msg.type === 'ws-error') {
        setStatus('error')
      }
    } catch {}
  }, [setStatus])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setContainerSize({ width, height })
    const cols = Math.floor(width / CHAR_W)
    const rows = Math.floor(height / CHAR_H)
    if (cols > 5 && rows > 2) {
      resizePty(cols, rows)
    }
  }, [resizePty])

  const handleKeystroke = useCallback((data: string) => {
    webViewRef.current?.injectJavaScript(`
      window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(JSON.stringify({ type: 'keystroke', data }))} }));
      true;
    `)
  }, [])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Terminal</Text>
        {status === 'error' && <Text style={styles.errorBadge}>Error</Text>}
      </View>

      <View style={styles.webViewContainer} onLayout={handleLayout}>
        {loaded ? (
          <WebView
            ref={webViewRef}
            source={{ html: htmlContent() }}
            style={styles.webView}
            onMessage={handleWebViewMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: theme.textTertiary }]}>Starting terminal...</Text>
          </View>
        )}
      </View>

      <TerminalToolbar theme={theme} onKeystroke={handleKeystroke} visible={loaded && !exited} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, marginRight: 8 },
  title: { fontSize: 16, fontWeight: '600', flex: 1 },
  errorBadge: { color: '#f87171', fontSize: 12, fontWeight: '600' },
  webViewContainer: { flex: 1 },
  webView: { flex: 1, backgroundColor: '#0f0f1a' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14 },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/src/screens/TerminalScreen.tsx
git commit -m "feat: add TerminalScreen with WebView + xterm.js"
```

---

### Task 8: App — Add Terminal tab + FAB entry

**Files:**
- Modify: `app/src/navigation/RootNavigator.tsx`
- Modify: `app/src/components/FabMenu.tsx`
- Modify: `app/src/screens/SessionScreen.tsx`

- [ ] **Step 1: Update RootNavigator — add Terminal tab param + route**

In `RootNavigator.tsx`:
1. Import `TerminalScreen`
2. Add `Terminal: { directory: string }` to `RootStackParamList`
3. Add `Terminal` screen in `TabParamList` (new tab between Files and Settings)
4. Add Stack.Screen for Terminal (after Session)

Tab params:
```ts
export type TabParamList = {
  Home: undefined
  Todos: undefined
  Files: undefined
  Terminal: undefined
  Settings: undefined
}
```

Terminal tab in `MainTabs` (insert between Files and Settings):
```tsx
<Tab.Screen name="Terminal" options={{
  tabBarIcon: ({ color, size }) => <Feather name="terminal" size={size} color={color} />,
  tabBarLabel: 'Terminal',
}}>
  {() => <TerminalScreen navigation={stackNav} route={{ params: { directory: config?.lastDirectory || undefined } }} themeMode={themeMode} client={client!} config={config!} />}
</Tab.Screen>
```

Stack screen for Terminal (for navigation from FAB):
```tsx
<Stack.Screen name="Terminal">
  {(props) => <TerminalScreen {...props} themeMode={themeMode} client={client!} config={config!} />}
</Stack.Screen>
```

- [ ] **Step 2: Add Terminal to FabMenu TOOLS**

In `FabMenu.tsx`:
```ts
const TOOLS: ToolEntry[] = [
  { id: 'git', icon: 'git-commit', label: 'Git' },
  { id: 'terminal', icon: 'terminal', label: 'Terminal' },
]
```

- [ ] **Step 3: Update SessionScreen FAB handler**

In `SessionScreen.tsx`, find the `onToolPress` handler (line 1217), change it from:
```tsx
onToolPress={(tool) => { setFabMenuVisible(false); navigation.push('Git', { directory: cwd }) }}
```
To:
```tsx
onToolPress={(tool) => {
  setFabMenuVisible(false)
  if (tool === 'git') navigation.push('Git', { directory: cwd })
  else if (tool === 'terminal') navigation.push('Terminal', { directory: cwd })
}}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/navigation/RootNavigator.tsx app/src/components/FabMenu.tsx app/src/screens/SessionScreen.tsx
git commit -m "feat: add Terminal tab and FAB entry for terminal"
```

---

### Task 9: Verify — TypeScript compilation

**Files:**
- None (verify step)

- [ ] **Step 1: Check TypeScript in app**

```bash
cd app && npx tsc --noEmit 2>&1 | head -50
```
Fix any type errors.

- [ ] **Step 2: Check TypeScript in bridge**

```bash
cd bridge && npx tsc --noEmit 2>&1 | head -20
```
Fix any type errors.

---

### Task 10: Verify — Start bridge and test

**Files:**
- None (manual test)

- [ ] **Step 1: Start the bridge**

```bash
cd bridge && npm start
```
Verify no errors in startup logs.

- [ ] **Step 2: Start the app**

```bash
cd app && npx expo start
```
Verify:
- Terminal tab appears in bottom bar
- Tapping terminal tab shows terminal screen with WebView loading
- WebView loads xterm.js and connects via WebSocket
- Virtual keyboard toolbar renders
- Typing in toolbar sends characters to terminal
