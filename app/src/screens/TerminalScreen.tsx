import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent, ActivityIndicator, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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
const isWeb = Platform.OS === 'web'

function escapeJsStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildTerminalHtml(wsUrl: string, ticket: string, directory?: string): string {
  var w = escapeJsStr(wsUrl)
  var p = escapeJsStr(ticket)
  var d = directory ? '&directory=' + encodeURIComponent(directory) : ''
  return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>body{margin:0;padding:0;background:#0f0f1a;overflow:hidden}#t{width:100vw;height:100vh}.xterm-helper-textarea{position:absolute!important;left:-9999px!important;top:0!important;opacity:0!important;width:1px!important;height:1px!important;z-index:-1!important}#e{display:none;position:fixed;top:0;left:0;width:100%;height:100%;color:#f87171;font-family:monospace;font-size:14px;align-items:center;justify-content:center;z-index:10;padding:20px;text-align:center;box-sizing:border-box}#l{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5c5c7a;font-family:monospace;font-size:13px;z-index:5}</style></head><body><div id="t"></div><div id="l">Loading terminal...</div><div id="e"></div><script>var w="' + w + '",p="' + p + '",d="' + d + '";var l=document.getElementById("l");function log(m){window.ReactNativeWebView.postMessage(JSON.stringify({type:"log",message:m}))}function loadScript(u,fallback,onload){var s=document.createElement("script");s.src=u;s.onload=function(){l.style.display="none";if(onload)onload()};s.onerror=function(){if(fallback){log("CDN fallback: "+u);loadScript(fallback[0],fallback[1],fallback[2])}else{l.style.display="none";var e=document.getElementById("e");e.style.display="flex";e.textContent="Failed to load xterm from CDN"}};document.head.appendChild(s)}log("loading xterm");loadScript("https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.min.js",["https://unpkg.com/xterm@5.5.0/lib/xterm.min.js",null,function(){loadScript("https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.10.0/lib/xterm-addon-fit.min.js",["https://unpkg.com/xterm-addon-fit@0.10.0/lib/xterm-addon-fit.min.js",null,init])}]);function init(){try{var t=new Terminal({cursorBlink:true,cursorStyle:"bar",fontSize:14,fontFamily:"Menlo,Monaco,Courier New,monospace",theme:{background:"#0f0f1a",foreground:"#e8e8f0",cursor:"#e8e8f0",selectionBackground:"#6c7dff44"},cols:80,rows:24});var a=new FitAddon.FitAddon();t.loadAddon(a);t.open(document.getElementById("t"));setTimeout(function(){try{a.fit()}catch(e){}},500);window.__t=t;var url=w+"?ticket="+encodeURIComponent(p)+"&cursor=-1"+d;log("connecting: "+url);var ws=new WebSocket(url);ws.onopen=function(){log("ws open");t.focus()};ws.onmessage=function(e){if(e.data instanceof Blob){e.data.arrayBuffer().then(function(b){var u8=new Uint8Array(b);if(u8[0]===0)return;t.write(new Uint8Array(b))});return}t.write(e.data)};ws.onclose=function(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:"ws-close",code:e.code}))};ws.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:"ws-error"}))};t.onData(function(d){if(ws.readyState===WebSocket.OPEN)ws.send(d)});window.addEventListener("resize",function(){try{a.fit()}catch(e){log("fit error: "+e.message)}})}catch(e){l.style.display="none";var e2=document.getElementById("e");e2.style.display="flex";e2.textContent="Terminal error: "+e.message}}</script></body></html>'
}

export default function TerminalScreen({ navigation, route, themeMode, client, config }: Props) {
  const theme = getTheme(themeMode)
  const directory = route.params?.directory || ''
  const host = config?.host || 'localhost'
  const port = config?.port || 8079
  const { ptyID, status, wsUrl, errorMessage, createPty, destroyPty, resizePty } = useTerminal(client, directory, host, port)
  const [ticket, setTicket] = useState('')
  const [exited, setExited] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [wsError, setWsError] = useState('')
  const mountedRef = useRef(true)
  const statusRef = useRef(status)
  statusRef.current = status

  const initTerminal = useCallback(async () => {
    setExited(false)
    setTimedOut(false)
    setWsError('')
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
    var timer = setTimeout(function() {
      if (mountedRef.current && statusRef.current === 'creating') {
        setTimedOut(true)
      }
    }, LOADING_TIMEOUT)
    return function() {
      mountedRef.current = false
      clearTimeout(timer)
    }
  }, [])

  var initializing = status === 'creating' || status === 'idle'
  var showError = status === 'error' || timedOut || !!wsError
  var showTerminal = status !== 'creating' && status !== 'idle' && !showError
  var displayError = wsError || errorMessage

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Terminal</Text>
        <View style={{ flex: 1 }} />
      </View>

      <View style={isWeb ? styles.terminalContainer : styles.webViewContainer}>
        {initializing && !timedOut && !wsError && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.centerText, { color: theme.textTertiary }]}>Starting terminal...</Text>
          </View>
        )}

        {showError && (
          <View style={styles.center}>
            <Feather name="alert-circle" size={32} color={theme.error} />
            <Text style={[styles.errorTitle, { color: theme.error }]}>Connection failed</Text>
            {displayError ? (
              <Text style={[styles.errorDetail, { color: theme.textTertiary }]}>{displayError}</Text>
            ) : null}
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.accent }]} onPress={initTerminal}>
              <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {showTerminal && !showError && (
          isWeb ? (
            <TerminalViewWeb wsUrl={wsUrl} ticket={ticket} directory={directory} ptyID={ptyID} resizePty={resizePty} setExited={setExited} onError={setWsError} />
          ) : (
            <TerminalViewNative wsUrl={wsUrl} ticket={ticket} directory={directory} ptyID={ptyID} resizePty={resizePty} setExited={setExited} onError={setWsError} />
          )
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

      <TerminalToolbar theme={theme} onKeystroke={terminalKeystroke} visible={showTerminal && !exited} />
    </SafeAreaView>
  )
}

var terminalPaste: ((data: string) => void) | null = null
function terminalKeystroke(data: string) {
  if (terminalPaste) terminalPaste(data)
}

function TerminalViewNative({ wsUrl, ticket, directory, ptyID, resizePty, setExited, onError }: any) {
  var ref = useRef<any>(null)
  var html = buildTerminalHtml(wsUrl, ticket, directory)
  var WebView = require('react-native-webview').WebView

  useEffect(function() {
    terminalPaste = function(data: string) {
      ref.current?.injectJavaScript("try{window.__t&&window.__t.paste(" + JSON.stringify(data) + ")}catch(e){};true")
    }
  }, [])

  var handleMessage = useCallback(function(event: any) {
    try {
      var msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ws-close') setExited(true)
      else if (msg.type === 'ws-error') onError('WebSocket connection failed')
      else if (msg.type === 'log') console.log('[WebView]', msg.message)
    } catch {}
  }, [setExited, onError])

  var handleLayout = useCallback(function(e: LayoutChangeEvent) {
    var cols = Math.floor(e.nativeEvent.layout.width / CHAR_W)
    var rows = Math.floor(e.nativeEvent.layout.height / CHAR_H)
    if (cols > 5 && rows > 2) {
      resizePty(cols, rows)
      ref.current?.injectJavaScript("try{window.__t&&__t.resize(" + cols + "," + rows + ")}catch(e){};true")
    }
  }, [resizePty])

  return (
    <View style={{ flex: 1 }} onLayout={handleLayout}>
      <WebView
        ref={ref}
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#0f0f1a' }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        hideKeyboardAccessoryView={false}
        keyboardDisplayRequiresUserAction={false}
      />
    </View>
  )
}

function TerminalViewWeb({ wsUrl, ticket, directory, ptyID, resizePty, setExited, onError }: any) {
  var divRef = useRef<HTMLDivElement>(null)

  useEffect(function() {
    var style = document.createElement('style')
    style.textContent = '.xterm-helper-textarea{position:absolute!important;left:-9999px!important;top:0!important;opacity:0!important;width:1px!important;height:1px!important;z-index:-1!important}'
    document.head.appendChild(style)
    return function() { try { style.remove() } catch {} }
  }, [])

  useEffect(function() {
    if (!divRef.current || !wsUrl || !ticket) return

    var disposed = false
    var term: any = null
    var ws: WebSocket | null = null
    var ro: ResizeObserver | null = null

    async function init() {
      console.log('[TerminalViewWeb] init start')
      try {
        var m = await import('xterm')
        var fa = await import('xterm-addon-fit')
        if (disposed || !divRef.current) return
        console.log('[TerminalViewWeb] xterm loaded')

        var Terminal = m.Terminal
        var FitAddon = fa.FitAddon

        term = new Terminal({
          cursorBlink: true,
          cursorStyle: 'bar',
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: { background: '#0f0f1a', foreground: '#e8e8f0', cursor: '#e8e8f0', selectionBackground: '#6c7dff44' },
          cols: 80,
          rows: 24,
        })

        var fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(divRef.current)
        fitAddon.fit()

        terminalPaste = function(data: string) { term.paste(data) }

        var dirParam = directory ? '&directory=' + encodeURIComponent(directory) : ''
        var fullUrl = wsUrl + '?ticket=' + encodeURIComponent(ticket) + '&cursor=-1' + dirParam
        console.log('[TerminalViewWeb] connecting:', fullUrl)

        ws = new WebSocket(fullUrl)
        ws.onopen = function() { console.log('[TerminalViewWeb] ws open'); term.focus() }
        ws.onmessage = function(ev) {
          if (ev.data instanceof Blob) {
            ev.data.arrayBuffer().then(function(buf) {
              var u8 = new Uint8Array(buf)
              if (u8[0] === 0x00) return
              term.write(new Uint8Array(buf))
            })
            return
          }
          term.write(ev.data)
        }
        ws.onclose = function(e) { console.log('[TerminalViewWeb] ws close', e.code); if (!disposed) setExited(true) }
        ws.onerror = function() { console.log('[TerminalViewWeb] ws error'); if (!disposed) onError('WebSocket connection failed') }
        term.onData(function(data: string) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(data) })

        ro = new ResizeObserver(function() {
          try {
            fitAddon.fit()
            var c = Math.floor((divRef.current!.clientWidth || 800) / 9)
            var r = Math.floor((divRef.current!.clientHeight || 400) / 20)
            resizePty(c, r)
          } catch(e) {}
        })
        ro.observe(divRef.current)
        console.log('[TerminalViewWeb] ready')
      } catch (err: any) {
        console.error('[TerminalViewWeb] init error:', err)
        if (!disposed) onError(err?.message || 'Terminal init failed')
      }
    }

    init()
    return function() { disposed = true; if (ro) ro.disconnect(); if (ws) ws.close(); if (term) term.dispose() }
  }, [wsUrl, ticket, directory, resizePty, setExited, onError])

  return <div ref={divRef} style={{ width: '100%', height: '100%', background: '#0f0f1a' }} />
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
  terminalContainer: { flex: 1, overflow: 'hidden' },
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
