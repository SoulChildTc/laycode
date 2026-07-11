import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutChangeEvent, ActivityIndicator, Platform, Keyboard, Animated, Easing } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
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
  var { create } = useTerminal(client, directory, host, port)
  var eventWsUrl = 'ws://' + host + ':' + (port + 1) + '/event'

  usePTYEvents(eventWsUrl, serverId, {
    onDeleted: function(id) {
      setPtys(function(prev) { return prev.filter(function(p) { return p.id !== id }) })
      setActivePtyID(function(cur) {
        if (cur !== id) return cur
        return null // 当前 tab 被外部删除，交给下方 effect 决定切到哪个
      })
    },
  })
  var [ptys, setPtys] = useState<any[]>([])
  var [activePtyID, setActivePtyID] = useState<string | null>(null)
  var [exited, setExited] = useState(false)
  var [timedOut, setTimedOut] = useState(false)
  var mountedRef = useRef(true)

  // 当前激活的 tab 为空但仍有其他 tab 时，自动切到第一个
  useEffect(function() {
    if (!activePtyID && ptys.length > 0) setActivePtyID(ptys[0].id)
  }, [activePtyID, ptys])

  var kbAnim = useRef(new Animated.Value(0)).current

  useEffect(function() {
    // 用键盘事件自带的动画时长驱动 Animated，让内容与键盘同步平移（无延迟、丝滑）。
    // iOS 用 willShow/willHide（拿得到 duration，可同步动画）；安卓用 didShow/didHide。
    // 关键：用 Animated.Value 走原生动画、不触发 React 重渲染，避免瞬间布局跳变
    // 打断 WebView 内输入框的聚焦（这正是之前 iOS 键盘弹出又缩回的根因）。
    var isIOS = Platform.OS === 'ios'
    function animateTo(h: number, duration?: number) {
      Animated.timing(kbAnim, {
        toValue: h,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start()
    }
    var onShow = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow',
      function(e) { animateTo(e.endCoordinates.height, e.duration) }
    )
    var onHide = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide',
      function(e) { animateTo(0, e && e.duration) }
    )
    return function() {
      onShow.remove()
      onHide.remove()
    }
  }, [])

  var initTerminal = useCallback(async function() {
    setExited(false)
    setTimedOut(false)
    // 加载该目录下所有已打开的终端填充 Tab 栏。每个 tab 自己建立连接，这里只决定
    // 列表和默认激活哪个。带 initialPtyID 时激活它，否则第一个；都为空则新建。
    var list: any[] = []
    if (directory) {
      try { list = await client.listPty(directory) || [] } catch {}
    }
    if (list.length > 0) {
      setPtys(list)
      var targetID = initialPtyID && list.some(function(p) { return p.id === initialPtyID }) ? initialPtyID : list[0].id
      setActivePtyID(targetID)
      return
    }
    if (initialPtyID) {
      setActivePtyID(initialPtyID)
      setPtys([{ id: initialPtyID }])
      return
    }
    if (!directory) return
    var result = await create()
    if (result) {
      setActivePtyID(result.ptyID)
      var fresh: any[] = []
      try { fresh = await client.listPty(directory) || [] } catch {}
      setPtys(fresh.length > 0 ? fresh : [{ id: result.ptyID }])
    }
  }, [directory, initialPtyID, client, create])

  useEffect(function() {
    mountedRef.current = true
    initTerminal()
    return function() {
      mountedRef.current = false
    }
  }, [])

  function handleTabSelect(id: string) {
    // 切换 tab 只改激活项，不重连（各 tab 的 WebView 与连接始终保持）
    if (id === activePtyID) return
    setExited(false)
    setActivePtyID(id)
  }

  async function handleTabClose(id: string) {
    var remaining = ptys.filter(function(p) { return p.id !== id })
    setPtys(remaining)
    await client.removePty(id, directory)
    if (id === activePtyID) {
      if (remaining.length > 0) {
        setActivePtyID(remaining[0].id)
      } else {
        setActivePtyID(null)
        navigation.goBack()
      }
    }
  }

  async function handleNewTab() {
    if (!directory) {
      navigation.goBack()
      return
    }
    var result = await create()
    if (result) {
      setActivePtyID(result.ptyID)
      // 重新拉取列表，用后端返回的真实 title 填充 Tab（而不是硬编码 zsh）
      await refreshPtys(result.ptyID)
    }
  }

  var refreshPtys = useCallback(async function(fallbackID?: string) {
    if (!directory) return
    try {
      var list = await client.listPty(directory) || []
      if (list.length > 0) { setPtys(list); return }
    } catch {}
    if (fallbackID) setPtys([{ id: fallbackID }])
  }, [directory, client])

  var tabs = useMemo(function() {
    return ptys.map(function(p) {
      return { ptyID: p.id, title: p.title || (p.cwd ? p.cwd.split('/').pop() : undefined) || 'zsh', isActive: p.id === activePtyID }
    })
  }, [ptys, activePtyID])

  var hasPtys = ptys.length > 0
  var showLoading = !hasPtys && !timedOut

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
      <Animated.View style={{ flex: 1, paddingBottom: kbAnim }}>
        <View style={isWeb ? styles.terminalContainer : styles.webViewContainer}>
          {showLoading && (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={[styles.centerText, { color: theme.textTertiary }]}>Starting...</Text>
            </View>
          )}
          {timedOut && !hasPtys && (
            <View style={styles.center}>
              <Feather name="alert-circle" size={32} color={theme.error} />
              <Text style={[styles.errorTitle, { color: theme.error }]}>Connection failed</Text>
              <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.accent }]} onPress={initTerminal}>
                <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* 每个 pty 一个 WebView，全部挂载，仅 active 可见——切换 tab 不重连 */}
          {ptys.map(function(p) {
            return isWeb ? (
              <TerminalViewWeb key={p.id} directory={directory} ptyID={p.id} active={p.id === activePtyID} client={client} setExited={setExited} bridgeHost={host} bridgePort={port} />
            ) : (
              <TerminalViewNative key={p.id} directory={directory} ptyID={p.id} active={p.id === activePtyID} client={client} setExited={setExited} bridgeHost={host} bridgePort={port} />
            )
          })}
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
        <TerminalToolbar theme={theme} onKeystroke={terminalKeystroke} visible={hasPtys && !exited} />
      </Animated.View>
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
      background-color: #0f0f1a;
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

    /* 选区拖动模式下禁止原生滚动惯性，交由 JS 处理选区 */
    #t.selecting .xterm-viewport {
      overflow: hidden;
      touch-action: none;
    }

    .xterm .xterm-helper-textarea {
      padding: 0;
      border: 0;
      margin: 0;
      position: absolute;
      opacity: 0;
      /* 安卓 IME 只对"真正可见、有实际尺寸"的输入框维持焦点。若太小(1px)或
         z-index 为负(被埋在后面)，IME 会弹一下就把焦点踢回 body，导致键盘缩回。
         这里给它真实尺寸、透明、放在视口内左上角，视觉隐藏但 IME 认可。 */
      left: 0;
      top: 0;
      width: 200px;
      height: 40px;
      z-index: 0;
      white-space: nowrap;
      overflow: hidden;
      resize: none;
      color: transparent;
      background: transparent;
      caret-color: transparent;
      pointer-events: none;
    }

    /* 选区手柄：一条竖线 + 底部圆点，命中区域放大便于手指拖动 */
    .sel-handle {
      display: none;
      position: absolute;
      width: 2px;
      background: #6c7dff;
      z-index: 20;
      pointer-events: auto;
    }
    .sel-handle::after {
      content: '';
      position: absolute;
      left: -8px;
      bottom: -14px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #6c7dff;
    }
    /* 扩大手柄触摸命中区 */
    .sel-handle::before {
      content: '';
      position: absolute;
      left: -16px;
      top: -12px;
      right: -16px;
      bottom: -24px;
    }
    #h-start::after { left: -8px; top: -18px; bottom: auto; }

    #copy-btn {
      display: none;
      position: absolute;
      z-index: 21;
      background: rgba(30,30,45,0.96);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 16px;
      border: 1px solid #6c7dff66;
      pointer-events: auto;
    }
  </style>
</head>
<body>
  <div id="t">
    <div id="h-start" class="sel-handle"></div>
    <div id="h-end" class="sel-handle"></div>
    <div id="copy-btn">复制</div>
  </div>

  <script src="${baseUrl}/xterm.js"></script>
  <script src="${baseUrl}/xterm-addon-fit.js"></script>

  <script>
    // 统一日志：仅用于上报错误
    function RNLOG(msg) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
      } catch (e) {}
    }

    // 全局错误兜底：任何未捕获错误/Promise 拒绝都上报，避免静默黑屏
    window.onerror = function(message, source, lineno, colno, error) {
      RNLOG('window.onerror: ' + message + ' @' + lineno + ':' + colno);
    };
    window.addEventListener('unhandledrejection', function(ev) {
      RNLOG('unhandledrejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason));
    });

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

    var inited = false;
    function tryInit() {
      if (fontsReady && pageLoaded && !inited) {
        inited = true;
        init();
      }
    }

    function init() {
      try {
        var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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
            selectionBackground: '#6c7dff88',
          },
          cols: Math.floor(cw / 9) || 80,
          rows: Math.floor(ch / 20) || 24,
        });

        var fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);

        // --- 移动端滚动 + 长按拖动选区 + 手柄 ---
        // 平时 viewport 在顶层处理原生滚动。长按进入选区模式，用 xterm 选区 API
        // 选中文字并显示两个可拖动手柄和一个复制按钮，拖手柄微调范围，点按钮复制。
        var vp = container.querySelector('.xterm-viewport');
        if (vp) {
          var tapFlag = true;
          var lpTimer = null;
          var dragging = false;        // touchstart 后到 touchend 前的即时拖动
          var selActive = false;       // 选区是否处于活动（显示手柄）状态
          var startCell = null;        // 选区起点 {col,row}（buffer 绝对行）
          var endCell = null;          // 选区终点
          var handleDrag = null;       // 正在拖动的手柄: 'start' | 'end' | null

          var hStart = document.getElementById('h-start');
          var hEnd = document.getElementById('h-end');
          var copyBtn = document.getElementById('copy-btn');

          // 像素坐标 -> buffer 绝对行列（参考 xterm 内部 MouseService）
          function pointToCell(clientX, clientY) {
            var rect = vp.getBoundingClientRect();
            var cellW = 9, cellH = 20;
            try {
              var dims = term._core._renderService.dimensions.css.cell;
              if (dims && dims.width) { cellW = dims.width; cellH = dims.height; }
            } catch (ex) {}
            var x = clientX - rect.left;
            var y = clientY - rect.top;
            var col = Math.max(0, Math.min(term.cols - 1, Math.floor(x / cellW)));
            var viewRow = Math.max(0, Math.min(term.rows - 1, Math.floor(y / cellH)));
            var base = term.buffer.active.viewportY;
            return { col: col, row: base + viewRow };
          }

          // 行列 -> 相对 viewport 的像素坐标（用于放手柄）
          function cellToPoint(cell) {
            var cellW = 9, cellH = 20;
            try {
              var dims = term._core._renderService.dimensions.css.cell;
              if (dims && dims.width) { cellW = dims.width; cellH = dims.height; }
            } catch (ex) {}
            var base = term.buffer.active.viewportY;
            var viewRow = cell.row - base;
            return { x: cell.col * cellW, y: viewRow * cellH, h: cellH };
          }

          function normalize() {
            var a = startCell, b = endCell;
            if (b.row < a.row || (b.row === a.row && b.col < a.col)) return { a: b, b: a };
            return { a: a, b: b };
          }

          function applySelection() {
            var n = normalize();
            var a = n.a, b = n.b;
            if (a.row === b.row) {
              term.select(a.col, a.row, b.col - a.col + 1);
            } else {
              // 跨行：用 select 的跨行 length（沿 buffer 折行延伸），
              // 这样只选起止字符之间的部分，而不是整行。
              var cols = term.cols;
              var len = (cols - a.col) + (b.row - a.row - 1) * cols + (b.col + 1);
              term.select(a.col, a.row, len);
            }
          }

          // 根据当前选区端点更新手柄与复制按钮的位置
          function updateHandles() {
            if (!selActive) {
              hStart.style.display = 'none';
              hEnd.style.display = 'none';
              copyBtn.style.display = 'none';
              return;
            }
            var n = normalize();
            var ps = cellToPoint(n.a);
            var pe = cellToPoint({ col: n.b.col + 1, row: n.b.row });
            hStart.style.display = 'block';
            hEnd.style.display = 'block';
            hStart.style.left = ps.x + 'px';
            hStart.style.top = ps.y + 'px';
            hStart.style.height = ps.h + 'px';
            hEnd.style.left = pe.x + 'px';
            hEnd.style.top = pe.y + 'px';
            hEnd.style.height = pe.h + 'px';
            // 复制按钮：放在选区起点更上方，并整体上移，避免压住起点手柄圆点。
            // 若起点太靠顶部（上方放不下），则改放到选区下方。
            copyBtn.style.display = 'block';
            var btnLeft = Math.max(4, ps.x - 4);
            if (ps.y >= 44) {
              copyBtn.style.top = (ps.y - 40) + 'px';
            } else {
              copyBtn.style.top = (ps.y + ps.h + 22) + 'px';
            }
            copyBtn.style.left = btnLeft + 'px';
          }

          function enterSelection() {
            selActive = true;
            container.classList.add('selecting');
            // 长按选字时收起键盘：仅安卓 blur。iOS 上 blur 会让键盘进入"用户已收起"
            // 状态导致后续 focus 弹不出，所以 iOS 不 blur（iOS 进入终端本就不自动弹键盘）。
            if (!IS_IOS) {
              var ta = container.querySelector('.xterm-helper-textarea');
              if (ta) ta.blur();
            }
          }

          function exitSelection() {
            selActive = false;
            startCell = endCell = null;
            container.classList.remove('selecting');
            if (term.hasSelection()) term.clearSelection();
            updateHandles();
          }

          // 选区变化（含滚动重绘）时刷新手柄位置
          term.onSelectionChange(function() { updateHandles(); });
          term.onScroll(function() { if (selActive) updateHandles(); });

          // 拦截浏览器在 touch 之后合成的鼠标事件：它们会到达 xterm 并把
          // helper-textarea 失焦（表现为键盘弹出瞬间又缩回）。聚焦完全由我们
          // 在 touchend 里用 term.focus() 控制。
          ['mousedown', 'mouseup', 'click'].forEach(function(evt) {
            vp.addEventListener(evt, function(e) {
              e.preventDefault();
              e.stopPropagation();
            }, true);
          });

          // --- viewport 触摸：滚动 / 长按选区 ---
          vp.addEventListener('touchstart', function(e) {
            if (handleDrag) return; // 手柄拖动优先
            tapFlag = true;
            if (e.touches.length === 1) {
              var t0 = e.touches[0];
              lpTimer = setTimeout(function() {
                tapFlag = false;
                dragging = true;
                enterSelection();
                startCell = pointToCell(t0.clientX, t0.clientY);
                endCell = { col: startCell.col, row: startCell.row };
                applySelection();
              }, 400);
            }
            e.stopPropagation();
          }, { passive: true });

          vp.addEventListener('touchmove', function(e) {
            if (dragging) {
              e.preventDefault();
              endCell = pointToCell(e.touches[0].clientX, e.touches[0].clientY);
              applySelection();
              updateHandles();
            } else {
              tapFlag = false;
              if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
              if (selActive) { exitSelection(); } // 滚动时退出选区
            }
            e.stopPropagation();
          }, { passive: false });

          vp.addEventListener('touchend', function(e) {
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            e.stopPropagation();
            if (dragging) {
              e.preventDefault();
              dragging = false;
              updateHandles(); // 选区保持，显示手柄+复制按钮
            } else if (tapFlag) {
              // 单击：退出选区并在用户手势同步栈内聚焦终端，确保安卓弹出键盘
              if (selActive) { exitSelection(); }
              term.focus();
            }
          }, { passive: false });

          // --- 手柄拖动 ---
          function bindHandle(el, which) {
            el.addEventListener('touchstart', function(e) {
              handleDrag = which;
              e.preventDefault();
              e.stopPropagation();
            }, { passive: false });
          }
          bindHandle(hStart, 'start');
          bindHandle(hEnd, 'end');

          document.addEventListener('touchmove', function(e) {
            if (!handleDrag) return;
            e.preventDefault();
            var cell = pointToCell(e.touches[0].clientX, e.touches[0].clientY);
            if (handleDrag === 'start') startCell = cell; else endCell = cell;
            applySelection();
            updateHandles();
          }, { passive: false });

          document.addEventListener('touchend', function(e) {
            if (handleDrag) { handleDrag = null; e.stopPropagation(); }
          }, { passive: true });

          // --- 复制按钮 ---
          copyBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var text = term.getSelection();
            if (text) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'copy', text: text }));
            }
            exitSelection();
          }, { passive: false });
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
          // 不自动 focus：iOS 上 focus 会立刻弹键盘。进入终端不弹，等用户点击再弹。
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
      } catch (e) {
        RNLOG('init:ERROR ' + e.message + ' | ' + (e.stack ? String(e.stack).slice(0, 120) : ''));
      }
    }
  </script>
</body>
</html>`
}

function TerminalViewNative({ directory, ptyID, active, client, setExited, bridgeHost, bridgePort }: any) {
  var ref = useRef<any>(null)
  var WebView = require('react-native-webview').WebView
  var baseUrl = 'http://' + bridgeHost + ':' + bridgePort + '/static'
  var [toast, setToast] = useState(false)
  var [conn, setConn] = useState<{ wsUrl: string; ticket: string } | null>(null)
  var toastTimer = useRef<any>(null)

  var showCopiedToast = useCallback(function() {
    setToast(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(function() { setToast(false) }, 1500)
  }, [])

  useEffect(function() {
    return function() { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [])

  // 每个 tab 自己获取 token 并建立连接（只做一次）。切换 tab 只改可见性，连接不断。
  useEffect(function() {
    var cancelled = false
    ;(async function() {
      try {
        var token = await client.connectPtyToken(ptyID, directory)
        if (cancelled || !token) return
        var wsu = 'ws://' + bridgeHost + ':' + bridgePort + '/opencode-api/pty/' + ptyID + '/connect'
        setConn({ wsUrl: wsu, ticket: token.ticket })
      } catch {}
    })()
    return function() { cancelled = true }
  }, [ptyID, directory, client, bridgeHost, bridgePort])

  // 每个 tab 各自的 resize 走自己的 ptyID
  var resize = useCallback(function(cols: number, rows: number) {
    if (cols > 0 && rows > 0) client.updatePtySize(ptyID, cols, rows, directory).catch(function() {})
  }, [client, ptyID, directory])

  // 仅当此 tab 为 active 时，把工具栏按键路由到它自己的 WebSocket
  useEffect(function() {
    if (!active) return
    terminalPaste = function(data: string) {
      ref.current?.injectJavaScript(
        "try{window.__ws&&window.__ws.send(" + JSON.stringify(data) + ")}catch(e){};true"
      )
    }
    return function() {
      if (terminalPaste) terminalPaste = null
    }
  }, [active])

  var html = useMemo(function() {
    if (!conn) {
      return '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0f0f1a"></body></html>'
    }
    return buildTerminalHtml(baseUrl, conn.wsUrl, conn.ticket, directory)
  }, [conn, directory, baseUrl])

  var handleMessage = useCallback(function(event: any) {
    try {
      var msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ws-close') {
        setExited(true)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        resize(msg.cols, msg.rows)
      } else if (msg.type === 'copy' && msg.text) {
        Clipboard.setStringAsync(msg.text).then(function() { showCopiedToast() }).catch(function() {})
      } else if (msg.type === 'log') {
        console.log('[WebView]', msg.message)
      }
    } catch {}
  }, [setExited, resize, showCopiedToast])

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

  var handleError = useCallback(function(e: any) {
    console.log('[WebView] onError', e?.nativeEvent?.description, e?.nativeEvent?.url)
  }, [])

  var handleHttpError = useCallback(function(e: any) {
    console.log('[WebView] onHttpError status=' + e?.nativeEvent?.statusCode, e?.nativeEvent?.url)
  }, [])

  return (
    <View
      style={[StyleSheet.absoluteFill, { opacity: active ? 1 : 0, zIndex: active ? 1 : 0 }]}
      pointerEvents={active ? 'auto' : 'none'}
      onLayout={handleLayout}
    >
      <WebView
        ref={ref}
        source={{ html: html || '<html><body style="background:#0f0f1a"></body></html>' }}
        style={{ flex: 1, backgroundColor: '#0f0f1a' }}
        onMessage={handleMessage}
        onLoad={handleLoad}
        onError={handleError}
        onHttpError={handleHttpError}
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
      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Feather name="check" size={13} color="#fff" style={{ marginRight: 5 }} />
          <Text style={styles.toastText}>已复制</Text>
        </View>
      )}
    </View>
  )
}

function TerminalViewWeb({ directory, ptyID, active, client, setExited, bridgeHost, bridgePort }: any) {
  var divRef = useRef<HTMLDivElement>(null)

  useEffect(function() {
    var style = document.createElement('style')
    style.textContent = '.xterm-helper-textarea{position:absolute!important;bottom:0!important;left:0!important;width:1px!important;height:1px!important;opacity:0!important;z-index:10!important}#t *{-webkit-user-select:text!important;user-select:text!important}'
    document.head.appendChild(style)
    return function() { try { style.remove() } catch {} }
  }, [])

  useEffect(function() {
    if (!divRef.current) return
    var disposed = false
    var term: any = null
    var ws: WebSocket | null = null
    var ro: ResizeObserver | null = null

    function doResize(cols: number, rows: number) {
      if (cols > 0 && rows > 0) client.updatePtySize(ptyID, cols, rows, directory).catch(function() {})
    }

    async function init() {
      try {
        var token = await client.connectPtyToken(ptyID, directory)
        if (disposed || !token) return
        var wsUrl = 'ws://' + bridgeHost + ':' + bridgePort + '/opencode-api/pty/' + ptyID + '/connect'
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
        var fullUrl = wsUrl + '?ticket=' + encodeURIComponent(token.ticket) + '&cursor=0' + dirParam
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
          try { fitAddon.fit(); var c = Math.floor((divRef.current!.clientWidth || 800) / 9); var r = Math.floor((divRef.current!.clientHeight || 400) / 20); doResize(c, r) } catch {}
        })
        ro.observe(divRef.current)
} catch {}
    }

    init()
    return function() { disposed = true; if (ro) ro.disconnect(); if (ws) ws.close(); if (term) term.dispose() }
  }, [ptyID, directory, client, setExited, bridgeHost, bridgePort])

  return <div ref={divRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#0f0f1a', opacity: active ? 1 : 0, zIndex: active ? 1 : 0, pointerEvents: active ? 'auto' : 'none' }} />
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
  toast: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30,30,45,0.92)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
})