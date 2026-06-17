import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { Feather } from '@expo/vector-icons'
import TerminalToolbar from '../components/TerminalToolbar'
import { useTerminal } from '../hooks/useTerminal'
import type { LayCodeClient } from '../api/client'
import type { ServerEntry } from '../types'
import { getTheme, type ThemeMode } from '../theme'

interface Props {
  navigation: any
  route: { params?: { directory?: string } }
  themeMode: ThemeMode
  client: LayCodeClient
  config: ServerEntry
}

const CHAR_W = 9
const CHAR_H = 20
const LOADING_TIMEOUT = 15000

function buildTerminalHtml(wsUrl: string, ticket: string): string {
  return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>body{margin:0;padding:0;background:#0f0f1a;overflow:hidden}#t{width:100vw;height:100vh}#o{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,15,26,0.9);color:#888;font-family:monospace;font-size:16px;align-items:center;justify-content:center;z-index:10}</style></head><body><div id="t"></div><div id="o"></div><script>var w=' + JSON.stringify(wsUrl) + ',p=' + JSON.stringify(ticket) + ';if(!w){document.getElementById("o").style.display="flex";document.getElementById("o").textContent="No WS URL"}else{var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.min.js";s.onload=function(){var f=document.createElement("script");f.src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.10.0/lib/xterm-addon-fit.min.js";f.onload=init;document.head.appendChild(f)};document.head.appendChild(s)}function init(){var t=new Terminal({cursorBlink:true,cursorStyle:"bar",fontSize:14,fontFamily:"Menlo,Monaco,Courier New,monospace",theme:{background:"#0f0f1a",foreground:"#e8e8f0",cursor:"#e8e8f0",selectionBackground:"#6c7dff44"},cols:80,rows:24});var a=new FitAddon.FitAddon();t.loadAddon(a);t.open(document.getElementById("t"));a.fit();window.__t=t;var ws=null;function connect(){ws=new WebSocket(w+"?ticket="+encodeURIComponent(p)+"&cursor=-1");ws.onopen=function(){t.focus();window.ReactNativeWebView.postMessage(JSON.stringify({type:"ws-open"}))};ws.onmessage=function(e){if(e.data instanceof Blob){e.data.arrayBuffer().then(function(b){var u8=new Uint8Array(b);if(u8[0]===0){try{var m=JSON.parse(new TextDecoder().decode(u8.slice(1)));window.ReactNativeWebView.postMessage(JSON.stringify({type:"cursor",cursor:m.cursor}))}catch(ex){}return}t.write(new Uint8Array(b))});return}t.write(e.data)};ws.onclose=function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:"ws-close",code:e.code}))};ws.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:"ws-error"}))}}connect();t.onData(function(d){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(d)});window.addEventListener("resize",function(){try{a.fit()}catch(e){}})}</script></body></html>'
}

export default function TerminalScreen({ navigation, route, themeMode, client, config }: Props) {
  const theme = getTheme(themeMode)
  const directory = route.params?.directory || ''
  const host = config?.host || 'localhost'
  const port = config?.port || 8079
  const { ptyID, status, wsUrl, errorMessage, createPty, destroyPty, resizePty } = useTerminal(client, directory, host, port)
  const webViewRef = useRef<WebView>(null)
  const [ticket, setTicket] = useState('')
  const [exited, setExited] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const mountedRef = useRef(true)
  const statusRef = useRef(status)
  statusRef.current = status

  const initTerminal = useCallback(async () => {
    setExited(false)
    setTimedOut(false)
    const result = await createPty()
    if (!mountedRef.current) return
    if (result) {
      setTicket(result.ticket)
      resizePty(80, 24)
    }
  }, [createPty, resizePty])

  useEffect(() => {
    mountedRef.current = true
    initTerminal()

    const timer = setTimeout(() => {
      if (mountedRef.current && statusRef.current === 'creating') {
        setTimedOut(true)
      }
    }, LOADING_TIMEOUT)

    return () => {
      mountedRef.current = false
      clearTimeout(timer)
      destroyPty()
    }
  }, [])

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ws-close') {
        setExited(true)
      }
    } catch {}
  }, [])

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    const cols = Math.floor(width / CHAR_W)
    const rows = Math.floor(height / CHAR_H)
    if (cols > 5 && rows > 2) {
      resizePty(cols, rows)
      if (ptyID) {
        webViewRef.current?.injectJavaScript('try{window.__t&&__t.resize(' + cols + ',' + rows + ')}catch(e){};true')
      }
    }
  }, [resizePty, ptyID])

  const handleKeystroke = useCallback((data: string) => {
    webViewRef.current?.injectJavaScript('try{window.__t&&window.__t.paste(' + JSON.stringify(data) + ')}catch(e){};true')
  }, [])

  const initializing = status === 'creating' || status === 'idle'
  const showError = status === 'error' || timedOut
  const showTerminal = status !== 'creating' && status !== 'idle' && !showError

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Terminal</Text>
        <View style={{ flex: 1 }} />
      </View>

      <View style={styles.webViewContainer} onLayout={handleLayout}>
        {initializing && !timedOut && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.centerText, { color: theme.textTertiary }]}>Starting terminal...</Text>
          </View>
        )}

        {showError && (
          <View style={styles.center}>
            <Feather name="alert-circle" size={32} color={theme.error} />
            <Text style={[styles.errorTitle, { color: theme.error }]}>Connection failed</Text>
            {errorMessage ? (
              <Text style={[styles.errorDetail, { color: theme.textTertiary }]}>{errorMessage}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: theme.accent }]}
              onPress={initTerminal}
            >
              <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {showTerminal && !showError && (
          <WebView
            ref={webViewRef}
            source={{ html: buildTerminalHtml(wsUrl, ticket) }}
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
        )}
      </View>

      {exited && (
        <View style={styles.exitedBanner}>
          <Text style={styles.exitedText}>Process exited</Text>
          <TouchableOpacity style={styles.restartBtn} onPress={initTerminal}>
            <Feather name="refresh-cw" size={12} color="#f87171" />
            <Text style={styles.restartText}>Restart</Text>
          </TouchableOpacity>
        </View>
      )}

      <TerminalToolbar theme={theme} onKeystroke={handleKeystroke} visible={showTerminal && !exited} />
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
  webViewContainer: { flex: 1 },
  webView: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  centerText: { fontSize: 14 },
  errorTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  errorDetail: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 4 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 16,
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  exitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  exitedText: { color: '#f87171', fontSize: 13, fontWeight: '600' },
  restartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restartText: { color: '#f87171', fontSize: 12 },
})
