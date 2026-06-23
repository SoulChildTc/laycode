import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent, ActivityIndicator, Platform, Keyboard } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import TerminalToolbar from '../components/TerminalToolbar'
import TerminalTabBar from '../components/TerminalTabBar'
import { useTerminal } from '../hooks/useTerminal'
import { usePTYEvents } from '../hooks/usePTYEvents'
import type { LayCodeClient } from '../api/client'
import type { ServerEntry } from '../types'
import { getTheme, type ThemeMode } from '../theme'

interface Props {
  navigation: any
  route: { params?: { directory?: string; ptyID?: string } }
  themeMode: ThemeMode
  client: LayCodeClient
  config: ServerEntry
}

const CHAR_W = 9
const CHAR_H = 20
const LOADING_TIMEOUT = 15000
const isWeb = Platform.OS === 'web'

export default function TerminalView({ navigation, route, themeMode, client, config }: Props) {
  var theme = getTheme(themeMode)
  var directory = route.params?.directory || ''
  var initialPtyID = route.params?.ptyID
  var host = config?.host || 'localhost'
  var port = config?.port || 8079
  var serverId = config?.id || 'default'
  var { ptyID, status, wsUrl, ticket, errorMessage, create, connect, destroy, reset, resize, setStatus } = useTerminal(client, directory, host, port)
  var webViewRef = useRef<any>(null)
  var eventWsUrl = 'ws://' + host + ':' + (port + 1) + '/event'

  usePTYEvents(eventWsUrl, serverId, {
    onDeleted: function(id) {
      setPtys(function(prev) { return prev.filter(function(p) { return p.id !== id }) })
      if (id === ptyID) {
        reset()
        setTimedOut(true)
      }
    },
  })
  var [ptys, setPtys] = useState<any[]>([])
  var [activePtyID, setActivePtyID] = useState<string | null>(null)
  var [exited, setExited] = useState(false)
  var [timedOut, setTimedOut] = useState(false)
  var mountedRef = useRef(true)
  var statusRef = useRef(status)
  statusRef.current = status

  var [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(function() {
    var onShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      function(e) { setKeyboardHeight(e.endCoordinates.height) }
    )
    var onHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      function() { setKeyboardHeight(0) }
    )
    return function() {
      onShow.remove()
      onHide.remove()
    }
  }, [])

  var initTerminal = useCallback(async function() {
    setExited(false)
    setTimedOut(false)
    if (initialPtyID) {
      await connect(initialPtyID)
      setActivePtyID(initialPtyID)
      return
    }
    if (!directory) return
    var list: any[] = []
    try { list = await client.listPty(directory) || [] } catch {}
    if (list.length > 0) {
      setPtys(list)
      var firstID = list[0].id
      await connect(firstID)
      setActivePtyID(firstID)
    } else {
      var result = await create()
      if (result) {
        setActivePtyID(result.ptyID)
        setPtys([{ id: result.ptyID, title: 'zsh', cwd: result.ptyID }])
      }
    }
  }, [directory, initialPtyID, client, connect, create])

  useEffect(function() {
    mountedRef.current = true
    initTerminal()
    var timer = setTimeout(function() {
      if (mountedRef.current && statusRef.current === 'creating') setTimedOut(true)
    }, LOADING_TIMEOUT)
    return function() {
      mountedRef.current = false
      clearTimeout(timer)
      reset()
    }
  }, [])

  async function handleTabSelect(id: string) {
    if (id === activePtyID) return
    setExited(false)
    var result = await connect(id)
    if (result) setActivePtyID(id)
  }

  async function handleTabClose(id: string) {
    var remaining = ptys.filter(function(p) { return p.id !== id })
    setPtys(remaining)
    if (id === activePtyID) {
      if (remaining.length > 0) {
        await client.removePty(id, directory)
        await handleTabSelect(remaining[0].id)
      } else {
        await client.removePty(id, directory)
        reset()
      }
    } else {
      await client.removePty(id, directory)
    }
  }

  async function handleNewTab() {
    if (!directory) {
      navigation.goBack()
      return
    }
    var result = await create()
    if (result) {
      setPtys(function(prev) { return [...prev, { id: result!.ptyID, title: 'zsh', cwd: directory }] })
      setActivePtyID(result.ptyID)
    }
  }

  var tabs = useMemo(function() {
    return ptys.map(function(p) {
      return { ptyID: p.id, title: p.title || (p.cwd ? p.cwd.split('/').pop() : undefined) || 'zsh', isActive: p.id === activePtyID }
    })
  }, [ptys, activePtyID])

  var showLoading = (status === 'creating' || status === 'idle') && !timedOut
  var showError = status === 'error' || timedOut
  var showTerminal = status !== 'creating' && status !== 'idle' && !showError

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <TerminalTabBar
        tabs={tabs}
        theme={theme}
        onBack={function() { navigation.goBack() }}
        onSelectTab={handleTabSelect}
        onCloseTab={handleTabClose}
        onNewTab={handleNewTab}
      />
      <View style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? 0 : keyboardHeight }}>
        <View style={isWeb ? styles.terminalContainer : styles.webViewContainer}>
          {showLoading && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.centerText, { color: theme.textTertiary }]}>Starting...</Text>
          </View>
        )}
        {showError && (
          <View style={styles.center}>
            <Feather name="alert-circle" size={32} color={theme.error} />
            <Text style={[styles.errorTitle, { color: theme.error }]}>Connection failed</Text>
            {errorMessage ? <Text style={[styles.errorDetail, { color: theme.textTertiary }]}>{errorMessage}</Text> : null}
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.accent }]} onPress={initTerminal}>
              <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
        {showTerminal && (
          isWeb ? (
            <TerminalViewWeb wsUrl={wsUrl} ticket={ticket} directory={directory} ptyID={ptyID} resize={resize} setExited={setExited} />
          ) : (
            <TerminalViewNative wsUrl={wsUrl} ticket={ticket} directory={directory} ptyID={ptyID} resize={resize} setExited={setExited} bridgeHost={host} bridgePort={port} />
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
      </View>
    </SafeAreaView>
  )
}

var terminalPaste: ((data: string) => void) | null = null
function terminalKeystroke(data: string) {
  if (terminalPaste) terminalPaste(data)
}

function buildTerminalHtml(
  baseUrl: string,
  wsUrl: string,
  ticket: string,
  directory: string,
): string {
  const dirParam = directory ? '&directory=' + encodeURIComponent(directory) : ''
  const fullWsUrl = wsUrl + '?ticket=' + ticket + '&cursor=0' + dirParam

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="${baseUrl}/xterm.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      background: #0f0f1a;
      overflow: hidden;
    }

    #t {
      width: 100%;
      height: 100%;
      position: relative;
    }

    .xterm {
      height: 100% !important;
      width: 100% !important;
      cursor: text;
      position: relative;
      user-select: none;
      -webkit-user-select: none;
      touch-action: pan-y;
      -webkit-touch-callout: none;
    }
    .xterm.focus, .xterm:focus { outline: none; }

    .xterm .xterm-viewport {
      background-color: #0f0f1a;
      overflow-y: scroll;
      cursor: default;
      position: absolute;
      right: 0;
      left: 0;
      top: 0;
      bottom: 0;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    .xterm .xterm-screen {
      pointer-events: none;
    }

    .xterm .xterm-helper-textarea {
      padding: 0;
      border: 0;
      margin: 0;
      position: absolute;
      opacity: 0;
      left: -9999em;
      top: 0;
      width: 0;
      height: 0;
      z-index: -5;
      white-space: nowrap;
      overflow: hidden;
      resize: none;
    }
  </style>
</head>
<body>
  <div id="t"></div>

  <script src="${baseUrl}/xterm.js"></script>
  <script src="${baseUrl}/xterm-addon-fit.js"></script>

  <script>
    var fontsReady = false;
    var pageLoaded = false;

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        fontsReady = true;
        tryInit();
      });
    } else {
      fontsReady = true;
    }

    window.addEventListener('load', function() {
      pageLoaded = true;
      tryInit();
    });

    function tryInit() {
      if (fontsReady && pageLoaded) {
        init();
      }
    }

    function init() {
      try {
        var container = document.getElementById('t');
        var cw = container.clientWidth;
        var ch = container.clientHeight;

        var term = new Terminal({
          cursorBlink: true,
          cursorStyle: 'bar',
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, Courier New, monospace',
          allowTransparency: false,
          scrollback: 5000,
          drawBoldTextInBrightColors: false,
          rendererType: 'dom',
          theme: {
            background: '#0f0f1a',
            foreground: '#e8e8f0',
            cursor: '#e8e8f0',
            selectionBackground: '#6c7dff44',
          },
          cols: Math.floor(cw / 9) || 80,
          rows: Math.floor(ch / 20) || 24,
        });

        var fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);

        // --- 移动端滚动修复 ---
        // viewport 已通过 CSS z-index:10 置于最上层，浏览器原生处理滚动
        // 这里只需阻止事件冒泡到 xterm 的内部触摸处理器（它会把手势转成按行滚动）
        var vp = container.querySelector('.xterm-viewport');
        if (vp) {
          var tapFlag = true;

          vp.addEventListener('touchstart', function(e) {
            tapFlag = true;
            e.stopPropagation();
          }, { passive: true });

          vp.addEventListener('touchmove', function(e) {
            tapFlag = false;
            e.stopPropagation();
          }, { passive: true });

          vp.addEventListener('touchend', function(e) {
            e.stopPropagation();
            if (tapFlag) term.focus();
          }, { passive: true });
        }

        // --- 智能自动滚动 ---
        var autoScroll = true;

        function isAtBottom() {
          var viewport = container.querySelector('.xterm-viewport');
          if (!viewport) return true;
          return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 30;
        }

        function scrollToBottomIfNeeded() {
          if (autoScroll || isAtBottom()) {
            term.scrollToBottom();
            autoScroll = true;
          }
        }

        term.onScroll(function() {
          autoScroll = isAtBottom();
        });

        // --- 尺寸适配 ---
        function doFit() {
          try {
            fitAddon.fit();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'resize',
              cols: term.cols,
              rows: term.rows,
              clientW: container.clientWidth,
              clientH: container.clientHeight,
            }));
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'log',
              message: 'fit err: ' + e.message,
            }));
          }
        }

        function fitLoop(count) {
          count = count || 0;
          if (count < 10) {
            doFit();
            setTimeout(function() { fitLoop(count + 1) }, count === 0 ? 50 : count * 100);
          }
        }
        fitLoop();

        try {
          var ro = new ResizeObserver(doFit);
          ro.observe(container);
        } catch (e) {}

        window.addEventListener('resize', doFit);

        // --- 暴露给 RN 层的接口 ---
        window.__term = term;
        window.__doFit = doFit;

        // --- 连接 PTY ---
        var ws = new WebSocket(${JSON.stringify(fullWsUrl)});
        window.__ws = ws;

        ws.onopen = function() {
          term.focus();
          doFit();
        };

        ws.onmessage = function(e) {
          if (e.data instanceof Blob) {
            e.data.arrayBuffer().then(function(b) {
              var u8 = new Uint8Array(b);
              if (u8[0] === 0) return;
              term.write(new Uint8Array(b));
              scrollToBottomIfNeeded();
            });
            return;
          }
          term.write(e.data);
          scrollToBottomIfNeeded();
        };

        ws.onclose = function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ws-close',
            code: e.code,
          }));
        };

        ws.onerror = function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ws-error' }));
        };

        term.onData(function(data) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'log',
          message: 'xterm ready, w:' + cw + ' h:' + ch + ' cols:' + term.cols + ' rows:' + term.rows,
        }));
      } catch (e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'log',
          message: 'init error: ' + e.message,
        }));
      }
    }
  </script>
</body>
</html>`
}

function TerminalViewNative({ wsUrl, ticket, directory, ptyID, resize, setExited, bridgeHost, bridgePort }: any) {
  var ref = useRef<any>(null)
  var WebView = require('react-native-webview').WebView
  var baseUrl = 'http://' + bridgeHost + ':' + bridgePort + '/static'

  useEffect(function() {
    terminalPaste = function(data: string) {
      ref.current?.injectJavaScript(
        "try{window.__ws&&window.__ws.send(" + JSON.stringify(data) + ")}catch(e){};true"
      )
    }
    return function() {
      terminalPaste = null
    }
  }, [])

  var html = useMemo(function() {
    if (!wsUrl || !ticket) {
      return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0f0f1a"></body></html>'
    }
    return buildTerminalHtml(baseUrl, wsUrl, ticket, directory)
  }, [wsUrl, ticket, directory, baseUrl])

  var handleMessage = useCallback(function(event: any) {
    try {
      var msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ws-close') {
        setExited(true)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        resize(msg.cols, msg.rows)
      } else if (msg.type === 'log') {
        console.log('[WebView]', msg.message)
      }
    } catch {}
  }, [setExited, resize])

  var handleLayout = useCallback(function(e: LayoutChangeEvent) {
    var cols = Math.floor(e.nativeEvent.layout.width / CHAR_W)
    var rows = Math.floor(e.nativeEvent.layout.height / CHAR_H)
    if (cols > 5 && rows > 2) {
      resize(cols, rows)
    }
  }, [resize])

  var handleLoad = useCallback(function() {
    ref.current?.injectJavaScript("try{window.__doFit&&window.__doFit()}catch(e){};true;")
  }, [])

  return (
    <View style={{ flex: 1 }} onLayout={handleLayout}>
      <WebView
        ref={ref}
        source={{ html: html || '<html><body style="background:#0f0f1a"></body></html>' }}
        style={{ flex: 1, backgroundColor: '#0f0f1a' }}
        onMessage={handleMessage}
        onLoad={handleLoad}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={true}
        bounces={false}
        overScrollMode="never"
        hideKeyboardAccessoryView={false}
        keyboardDisplayRequiresUserAction={false}
        setSupportMultipleWindows={false}
        textInteractionEnabled={true}
        allowsLinkPreview={false}
        allowFileAccess={true}
        mixedContentMode="always"
        androidLayerType="hardware"
      />
    </View>
  )
}

function TerminalViewWeb({ wsUrl, ticket, directory, ptyID, resize, setExited }: any) {
  var divRef = useRef<HTMLDivElement>(null)

  useEffect(function() {
    var style = document.createElement('style')
    style.textContent = '.xterm-helper-textarea{position:absolute!important;bottom:0!important;left:0!important;width:1px!important;height:1px!important;opacity:0!important;z-index:10!important}#t *{-webkit-user-select:text!important;user-select:text!important}'
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
      try {
        var m = await import('xterm')
        var fa = await import('xterm-addon-fit')
        if (disposed || !divRef.current) return
        var Terminal = m.Terminal
        var FitAddon = fa.FitAddon

        term = new Terminal({
          cursorBlink: true, cursorStyle: 'bar', fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          letterSpacing: 0, lineHeight: 1.1, convertEol: true, allowTransparency: false,
          theme: { background: '#0f0f1a', foreground: '#e8e8f0', cursor: '#e8e8f0', selectionBackground: '#6c7dff44' },
          cols: 80, rows: 24,
        })

        var fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(divRef.current)
        fitAddon.fit()

        terminalPaste = function(data: string) { term.paste(data) }

        var dirParam = directory ? '&directory=' + encodeURIComponent(directory) : ''
        var fullUrl = wsUrl + '?ticket=' + encodeURIComponent(ticket) + '&cursor=0' + dirParam
        ws = new WebSocket(fullUrl)
        ws.onopen = function() { term.focus() }
        ws.onmessage = function(ev) {
          if (ev.data instanceof Blob) {
            ev.data.arrayBuffer().then(function(buf) { var u8 = new Uint8Array(buf); if (u8[0] === 0x00) return; term.write(new Uint8Array(buf)) })
            return
          }
          term.write(ev.data)
        }
        ws.onclose = function(e) { if (!disposed) setExited(true) }
        ws.onerror = function() {}
        term.onData(function(data: string) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(data) })

        ro = new ResizeObserver(function() {
          try { fitAddon.fit(); var c = Math.floor((divRef.current!.clientWidth || 800) / 9); var r = Math.floor((divRef.current!.clientHeight || 400) / 20); resize(c, r) } catch {}
        })
        ro.observe(divRef.current)
} catch {}
    }

    init()
    return function() { disposed = true; if (ro) ro.disconnect(); if (ws) ws.close(); if (term) term.dispose() }
  }, [wsUrl, ticket, directory, resize, setExited])

  return <div ref={divRef} style={{ width: '100%', height: '100%', background: '#0f0f1a' }} />
}

var styles = StyleSheet.create({
  container: { flex: 1 },
  webViewContainer: { flex: 1 },
  terminalContainer: { flex: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  centerText: { fontSize: 14 },
  errorTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  errorDetail: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 4 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, marginTop: 16 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  exitedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 8, backgroundColor: 'rgba(248,113,113,0.1)' },
  exitedText: { color: '#f87171', fontSize: 13, fontWeight: '600' },
  restartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restartText: { color: '#f87171', fontSize: 12 },
})