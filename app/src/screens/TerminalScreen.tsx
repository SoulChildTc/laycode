import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent, ActivityIndicator } from 'react-native'
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

function buildTerminalHtml(wsUrl: string, ticket: string): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>body{margin:0;padding:0;background:#0f0f1a;overflow:hidden}#t{width:100vw;height:100vh}#o{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,15,26,0.9);color:#888;font-family:monospace;font-size:16px;align-items:center;justify-content:center;z-index:10}</style></head><body><div id="t"></div><div id="o"></div><script>var w=${JSON.stringify(wsUrl)},p=${JSON.stringify(ticket)};if(!w){document.getElementById('o').style.display='flex';document.getElementById('o').textContent='No WS URL'}else{var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.min.js';s.onload=function(){var f=document.createElement('script');f.src='https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.10.0/lib/xterm-addon-fit.min.js';f.onload=init;document.head.appendChild(f)};document.head.appendChild(s)}function init(){var t=new Terminal({cursorBlink:true,cursorStyle:'bar',fontSize:14,fontFamily:'Menlo,Monaco,Courier New,monospace',theme:{background:'#0f0f1a',foreground:'#e8e8f0',cursor:'#e8e8f0',selectionBackground:'#6c7dff44'},cols:80,rows:24});var a=new FitAddon.FitAddon();t.loadAddon(a);t.open(document.getElementById('t'));a.fit();window.__t=t;var ws=null,r=0;function connect(){ws=new WebSocket(w+'?ticket='+encodeURIComponent(p)+'&cursor=-1');ws.onopen=function(){r=0;t.focus();window.ReactNativeWebView.postMessage(JSON.stringify({type:'ws-open'}))};ws.onmessage=function(e){if(e.data instanceof Blob){e.data.arrayBuffer().then(function(b){var u8=new Uint8Array(b);if(u8[0]===0){try{var m=JSON.parse(new TextDecoder().decode(u8.slice(1)));window.ReactNativeWebView.postMessage(JSON.stringify({type:'cursor',cursor:m.cursor}))}catch(ex){}return}t.write(new Uint8Array(b))});return}t.write(e.data)};ws.onclose=function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ws-close',code:e.code}))};ws.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ws-error'}))}}connect();t.onData(function(d){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(d)});window.addEventListener('resize',function(){try{a.fit()}catch(e){}})}</script></body></html>`
}

export default function TerminalScreen({ navigation, route, themeMode, client, config }: Props) {
  const theme = getTheme(themeMode)
  const directory = route.params?.directory || ''
  const host = config?.host || 'localhost'
  const port = config?.port || 8079
  const { ptyID, status, wsUrl, createPty, destroyPty, resizePty, setStatus } = useTerminal(client, directory, host, port)
  const webViewRef = useRef<WebView>(null)
  const [terminalReady, setTerminalReady] = useState(false)
  const [ticket, setTicket] = useState('')
  const [exited, setExited] = useState(false)
  const ticketRef = useRef('')

  useEffect(() => {
    (async () => {
      const result = await createPty()
      if (result) {
        setTicket(result.ticket)
        ticketRef.current = result.ticket
        setTerminalReady(true)
        resizePty(80, 24)
      }
    })()
    return () => { destroyPty() }
  }, [])

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
    const cols = Math.floor(width / CHAR_W)
    const rows = Math.floor(height / CHAR_H)
    if (cols > 5 && rows > 2) {
      resizePty(cols, rows)
      if (ptyID) {
        webViewRef.current?.injectJavaScript(`try{window.__t&&__t.resize(${cols},${rows})}catch(e){};true`)
      }
    }
  }, [resizePty, ptyID])

  const handleKeystroke = useCallback((data: string) => {
    webViewRef.current?.injectJavaScript(`try{window.__t&&window.__t.paste(${JSON.stringify(data)})}catch(e){};true`)
  }, [])

  const htmlContent = terminalReady ? buildTerminalHtml(wsUrl, ticket) : ''

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Terminal</Text>
        <View style={{ flex: 1 }} />
        {ptyID && <Text style={[styles.ptyId, { color: theme.textTertiary }]}>{ptyID.slice(0, 8)}</Text>}
      </View>

      <View style={styles.webViewContainer} onLayout={handleLayout}>
        {terminalReady ? (
          <WebView
            ref={webViewRef}
            source={{ html: htmlContent }}
            style={styles.webView}
            onMessage={handleWebViewMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            hideKeyboardAccessoryView={false}
            keyboardDisplayRequiresUserAction={false}
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textTertiary }]}>Starting terminal...</Text>
          </View>
        )}
      </View>

      {exited && (
        <View style={styles.exitedBanner}>
          <Text style={styles.exitedText}>Process exited</Text>
        </View>
      )}

      <TerminalToolbar theme={theme} onKeystroke={handleKeystroke} visible={terminalReady && !exited} />
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
  title: { fontSize: 16, fontWeight: '600' },
  ptyId: { fontSize: 11 },
  webViewContainer: { flex: 1 },
  webView: { flex: 1, backgroundColor: '#0f0f1a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { fontSize: 14 },
  exitedBanner: {
    padding: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  exitedText: { color: '#f87171', fontSize: 13, fontWeight: '600' },
})
