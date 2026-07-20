import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform, Animated, Modal, KeyboardAvoidingView, AppState, AppStateStatus, PanResponder, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LayCodeClient } from '../api/client'
import { useToast } from '../contexts/ToastContext'
import { getTheme, ThemeMode } from '../theme'
import MessageBubble from '../components/MessageBubble'
import InputBar from '../components/InputBar'
import SubagentFooter from '../components/SubagentFooter'
import PermissionPrompt from '../components/PermissionPrompt'
import QuestionPrompt from '../components/QuestionPrompt'
import ModelSelectorModal from '../components/ModelSelectorModal'
import AgentSelectorModal from '../components/AgentSelectorModal'
import RevertBanner from '../components/RevertBanner'
import FabMenu from '../components/FabMenu'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { useAgents } from '../hooks/useAgents'
import type { ToolCall, ModelKey, Provider, Agent, PermissionRequest, PermissionReply, QuestionRequest, ServerEntry, ListItem, RevertBannerMsg, UserMsg, FileAttachment } from '../types'
import { isRevertBanner, isCompaction } from '../types'
import { storageKey } from '../utils/storage'
import { parseRevertDiff } from '../utils/revertDiff'
import { canSendMessage } from '../utils/messageParts'
import { chatReducer } from '../chat/reducer'
import { initialChatState } from '../chat/types'
import { v2Reducer } from '../chat/v2Reducer'
import { initialV2State } from '../chat/v2Types'
import { adaptMessages } from '../chat/adaptMessages'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as Network from 'expo-network'
import { File } from 'expo-file-system'

function formatSessionError(error: any): string {
  const name = error?.name || ''
  const message = error?.data?.message || error?.message || ''
  const statusCode = name === 'APIError' ? error?.data?.statusCode : undefined
  const parts = [name, message].filter(Boolean)
  if (statusCode) parts.splice(1, 0, String(statusCode))
  return parts.join(' ') || 'Unknown error'
}

function tokenSum(t: any): number {
  return (t?.input || 0) + (t?.output || 0) + (t?.reasoning || 0) + (t?.cache?.read || 0) + (t?.cache?.write || 0)
}

interface Props {
  route: any
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
  config: ServerEntry
}

const GREETINGS = ['有什么我可以帮你的？', '开始一段新的对话吧']
const PAGE_SIZE = 10

export default function SessionScreen({ route, navigation, themeMode, client, config }: Props) {
  const { sessionId, title: routeTitle, agents: agentsJson, defaultAgent, agent: routeAgent } = route.params || {}
  const agentsFromParent = useMemo<Agent[]>(() => agentsJson ? JSON.parse(agentsJson) : [], [agentsJson])
  const [fallbackAgents, setFallbackAgents] = useState<Agent[]>([])
  const fallbackAgentsLoadedRef = useRef(false)
  const theme = getTheme(themeMode)
  const toast = useToast()
  const [chatState, dispatch] = useReducer(chatReducer, initialChatState)
  const { pendingPermissions, pendingQuestions, sending, banner: sessionBanner } = chatState
  // V2 消息状态：消费 message/part 事件，是消息流的唯一真相源（渲染经 adaptMessages 派生）。
  const [v2State, v2Dispatch] = useReducer(v2Reducer, initialV2State)
  const [sessionTitle, setSessionTitle] = useState(routeTitle || sessionId?.slice(0, 8) || '')
  const [cwd, setCwd] = useState('')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  // 乐观回显：发送后先显示这条用户消息（纯视图层，不进 v2Reducer）。
  // status：sending（发送中，等提交确认）/ failed（提交失败，可点击重发）。真实消息到达即清除。
  const [pendingSend, setPendingSend] = useState<{ msg: UserMsg; text: string; attachments: FileAttachment[]; status: 'sending' | 'failed' } | null>(null)
  const setError = useCallback((msg: string | null) => {
    dispatch({ type: 'banner/set', banner: msg ? { text: msg } : null })
  }, [])
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [currentModel, setCurrentModel] = useState<ModelKey | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [agentSelectorVisible, setAgentSelectorVisible] = useState(false)
  const [defaultModel, setDefaultModel] = useState<ModelKey | null>(null)
  const [revertMessageId, setRevertMessageId] = useState<string | null>(null)
  const [revertDiff, setRevertDiff] = useState<string | null>(null)
  const [contextTokens, setContextTokens] = useState(0)
  const [parentID, setParentID] = useState<string | null>(route.params?.parentId || null)
  const [childSessions, setChildSessions] = useState<{ id: string; title: string; agent: string }[]>([])
  const [showChildSessions, setShowChildSessions] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingMoreRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const initialLoadDoneRef = useRef(false)
  const loadGenRef = useRef(0)
  const [fabMenuVisible, setFabMenuVisible] = useState(false)
  const fabPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const fabDrag = useRef({ x: 0, y: 0 })
  const fabMoved = useRef(false)
  const fabRotate = useRef(new Animated.Value(0)).current
  const fabPositionKey = storageKey(config.id, 'fab-position')
  const flatListRef = useRef<FlatList>(null)
  // 用户是否贴在视觉底部（倒置列表）。同步 ref，供打字机自动滚判断是否跟随。
  const isAtBottom = useRef(true)
  // 是否正处于用户手动滚动中。用于区分「用户拖动」与「程序化 scrollToBottom」：
  // 程序化滚动也会触发 onScroll，若不区分，自动滚会把 isAtBottom 重新置回底部 → 停不下来。
  const userScrolling = useRef(false)
  // 最近一次滚动事件的 offset。倒置列表里 offset≈0 表示贴底。onContentSizeChange 用它做最终裁决，
  // 不依赖拖动事件时序（Android 上 onScrollBeginDrag/onMomentumScrollEnd 时序不可靠）。
  const lastOffset = useRef(0)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  // 供发送/重发主动触发 SSE 重连（重连逻辑在 SSE useEffect 内，通过 ref 暴露）。
  const forceReconnectRef = useRef<(() => void) | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const appStateRef = useRef(AppState.currentState)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<TextInput>(null)
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current
  const { keyboardOffset, isKeyboardOpen } = useKeyboardHeight()
  const sessionModelKey = storageKey(config.id, 'session-models')
  const effectiveAgents = agentsFromParent.length > 0 ? agentsFromParent : fallbackAgents
  const { agents: availableAgents, currentAgent, setAgent: setCurrentAgent } = useAgents(effectiveAgents, sessionId, defaultAgent, config.id)

  useEffect(() => {
    if (agentsFromParent.length > 0) return
    if (fallbackAgentsLoadedRef.current) return
    if (!cwd) return
    fallbackAgentsLoadedRef.current = true
    client.getAgents(cwd).then((list) => {
      const filtered = list.filter((a) => a.mode !== 'subagent' && !a.hidden)
      if (filtered.length > 0) {
        setFallbackAgents(filtered)
      } else {
        client.getAgents().then((list2) => {
          setFallbackAgents(list2.filter((a) => a.mode !== 'subagent' && !a.hidden))
        }).catch(() => {})
      }
    }).catch(() => {
      fallbackAgentsLoadedRef.current = false
    })
  }, [agentsFromParent, cwd, client])

  useEffect(() => {
    AsyncStorage.getItem(fabPositionKey).then((raw) => {
      if (!raw) return
      try {
        const pos = JSON.parse(raw)
        fabDrag.current = pos
        fabPan.setOffset(pos)
        fabPan.setValue({ x: 0, y: 0 })
      } catch {}
    }).catch(() => {})
  }, [])

  const saveFabPosition = useCallback(async (pos: { x: number; y: number }) => {
    try { await AsyncStorage.setItem(fabPositionKey, JSON.stringify(pos)) } catch {}
  }, [fabPositionKey])

  const fabPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        fabMoved.current = false
        fabPan.setOffset({ x: fabDrag.current.x, y: fabDrag.current.y })
        fabPan.setValue({ x: 0, y: 0 })
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5) {
          fabMoved.current = true
        }
        fabPan.setValue({ x: gestureState.dx, y: gestureState.dy })
      },
      onPanResponderRelease: (_, gestureState) => {
        fabPan.flattenOffset()
        fabDrag.current = { x: fabDrag.current.x + gestureState.dx, y: fabDrag.current.y + gestureState.dy }
        saveFabPosition(fabDrag.current)
        if (!fabMoved.current) {
          setFabMenuVisible((v) => !v)
        }
      },
    })
  ).current

  useEffect(() => {
    Animated.spring(fabRotate, {
      toValue: fabMenuVisible ? 1 : 0,
      useNativeDriver: true,
      damping: 12,
      stiffness: 200,
    }).start()
  }, [fabMenuVisible])

  const handlePermissionReply = useCallback(async (reply: PermissionReply, message?: string) => {
    const req = pendingPermissions[0]
    if (!req) return

    dispatch({ type: 'permission/removed', id: req.id })

    try {
      await client.replyPermission(req.id, reply, message, cwd || undefined)
    } catch (e: any) {
      toast.error(e?.message || '响应权限请求失败')
    }
  }, [pendingPermissions, client, cwd, toast])

  const handleQuestionReply = useCallback(async (answers: string[][]) => {
    const req = pendingQuestions[0]
    if (!req) return
    dispatch({ type: 'question/removed', id: req.id })
    try {
      await client.replyQuestion(req.id, answers, cwd || undefined)
    } catch (e: any) {
      toast.error(e?.message || '回复提问失败')
    }
  }, [pendingQuestions, client, cwd, toast])

  const handleQuestionReject = useCallback(async () => {
    const req = pendingQuestions[0]
    if (!req) return
    dispatch({ type: 'question/removed', id: req.id })
    try {
      await client.rejectQuestion(req.id, cwd || undefined)
    } catch (e: any) {
      toast.error(e?.message || '拒绝提问失败')
    }
  }, [pendingQuestions, client, cwd, toast])

  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

  const reloadSession = async () => {
    if (!sessionId) return

    loadGenRef.current++
    loadingMoreRef.current = false

    try {
      const [sessionData, pageResult, providersRes] = await Promise.all([
        client.getSession(sessionId).catch(() => null),
        client.getMessagesPage(sessionId, PAGE_SIZE).catch(() => ({ messages: [], nextCursor: null })),
        client.getProviders().catch(() => null),
      ])
      const raw = pageResult.messages
      cursorRef.current = pageResult.nextCursor

      // [3b-3 影子模式] 把 HTTP 拉取的历史消息灌进 v2Reducer（hydrate）。
      // raw 每项为 { info: Message, parts: Part[] }，正是 V2 所需结构。
      {
        const v2Messages = (raw as any[])
          .map((item) => item.info)
          .filter(Boolean)
          .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        const v2Parts: Record<string, any[]> = {}
        for (const item of raw as any[]) {
          if (item.info?.id) v2Parts[item.info.id] = item.parts || []
        }
        v2Dispatch({ type: 'hydrate', messages: v2Messages, parts: v2Parts })
      }

      // Session metadata
      if (sessionData?.info?.title) setSessionTitle(sessionData.info.title)
      if (sessionData?.info?.parentID) setParentID(sessionData.info.parentID)
      const dir = sessionData?.directory || sessionData?.info?.directory
      if (dir) setCwd(dir)
      if (sessionData?.revert?.messageID) setRevertMessageId(sessionData.revert.messageID)
      if (sessionData?.revert?.diff) setRevertDiff(sessionData.revert.diff)

      // Messages
      if (raw.length > 0) {
        const lastAssistant = (raw as any[]).findLast((item: any) => item.info?.role === 'assistant')
        if (lastAssistant?.info?.providerID && lastAssistant?.info?.modelID) {
          setCurrentModel({
            providerID: lastAssistant.info.providerID,
            modelID: lastAssistant.info.modelID,
          })
        }

        // Find the last completed assistant message for token display
        const lastCompleted = (raw as any[]).findLast((item: any) => {
          if (item.info?.role !== 'assistant') return false
          const hasRunning = (item.parts || []).some((p: any) => p.type === 'tool' && (p.state?.status === 'running' || p.state?.status === 'pending'))
          const t = item.info?.tokens
          return !hasRunning && t && tokenSum(t) > 0
        })
        if (lastCompleted?.info?.tokens) {
          const newTokens = tokenSum(lastCompleted.info.tokens)
          setContextTokens(newTokens)
        }

        // Infer session activity from the LAST assistant message only.
        // 只看最后一条 assistant 消息是否完成，避免历史里某条异常/中止的老消息
        // （缺 time.completed）把整个会话误判为「运行中」。
        const lastAssistantMsg = (raw as any[]).findLast((item: any) => item.info?.role === 'assistant')
        const hasRunning = !!lastAssistantMsg && (() => {
          const parts = lastAssistantMsg.parts || []
          if (parts.some((p: any) => p.type === 'tool' && (p.state?.status === 'running' || p.state?.status === 'pending'))) return true
          // 完成标志：time.completed（权威）或 finish（旧字段，兜底）。二者皆无才算未完成。
          const completed = lastAssistantMsg.info?.time?.completed != null || !!lastAssistantMsg.info?.finish
          return !completed
        })()
        dispatch({ type: 'session/sending', sending: hasRunning })

        const lastMsg = (raw as any[]).findLast(() => true)
        if (lastMsg?.info?.agent) {
          setCurrentAgent(lastMsg.info.agent)
        }
      }

      // Providers
      if (providersRes) {
        setProviders(providersRes.providers)
        const defaults = Object.entries(providersRes.default)
        if (defaults.length > 0) {
          const [providerID, modelID] = defaults[defaults.length - 1]
          setDefaultModel({ providerID, modelID })
        }
      }

      // Saved model preference
      AsyncStorage.getItem(sessionModelKey).then((raw) => {
        if (!raw) return
        try {
          const saved: Record<string, ModelKey> = JSON.parse(raw)
          if (saved[sessionId]) {
            setCurrentModel(saved[sessionId])
          }
        } catch {}
      }).catch(() => {})

      // Pending permissions & questions (need dir)。listPending* 返回的是整个目录下
      // 所有会话的待办，必须按 sessionID 过滤出当前会话的，否则会弹出同目录其它会话的审批/提问。
      if (dir) {
        const [reqs, qs] = await Promise.all([
          client.listPendingPermissions(dir).catch(() => []),
          client.listPendingQuestions(dir).catch(() => []),
        ])
        for (const r of reqs) {
          if (r.sessionID === sessionId) dispatch({ type: 'permission/asked', request: r })
        }
        for (const q of qs) {
          if (q.sessionID === sessionId) dispatch({ type: 'question/asked', request: q })
        }
      }
    } catch (e: any) {
      setError(`加载失败: ${e.message}`)
    } finally {
      initialLoadDoneRef.current = true
    }
  }

  const handleLoadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMoreRef.current || !initialLoadDoneRef.current || !sessionId) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const gen = loadGenRef.current
    try {
      const { messages: raw, nextCursor } = await client.getMessagesPage(sessionId, PAGE_SIZE, cursorRef.current, cwd || undefined)
      if (gen !== loadGenRef.current) return
      cursorRef.current = nextCursor
      if (raw.length > 0) {
        // V2：把更早的消息与其 part upsert 进 v2Reducer（有序插入 + 按 id 去重，
        // 自动并入现有列表，无需手动对账）。
        for (const item of raw as any[]) {
          if (!item.info?.id) continue
          v2Dispatch({ type: 'message.upsert', message: item.info })
          for (const part of (item.parts || [])) {
            v2Dispatch({ type: 'part.upsert', part })
          }
        }
      }
    } catch {
    } finally {
      if (gen === loadGenRef.current) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }, [sessionId, client, cwd])

  useEffect(() => {
    setPendingSend(null)
    if (sessionId) reloadSession()
  }, [sessionId])

  // [3b-3] 渲染源：从 V2 状态派生。inverted 列表需最新在前，故 reverse。
  // 参照官方：无混合列表、无 loading 占位——数据层只有干净的 message/part。
  // revert 态时：隐藏撤回点及之后的消息，顶部叠加 RevertBanner（独立于消息流）。
  // pendingSend：乐观回显的用户消息叠加在最新处（inverted 列表的最前 = 视觉最底）。
  const renderMessages = useMemo<ListItem[]>(() => {
    const adapted = adaptMessages(v2State.messages, v2State.parts)
    if (revertMessageId) {
      const revertIdx = adapted.findIndex((m) => m.id === revertMessageId)
      if (revertIdx >= 0) {
        const before = adapted.slice(0, revertIdx)
        // 统计被撤回的 user 消息数（撤回点及之后）。
        let count = 0
        for (let i = revertIdx; i < adapted.length; i++) if (adapted[i].role === 'user') count++
        const diffFiles = parseRevertDiff(revertDiff || '')
        const banner: RevertBannerMsg = { id: 'revert-banner', role: 'revert-banner', revertedCount: count, diffFiles }
        return [banner, ...before.reverse()]
      }
    }
    const list = adapted.reverse()
    return pendingSend ? [pendingSend.msg, ...list] : list
  }, [v2State, revertMessageId, revertDiff, pendingSend])

  // 清除乐观回显：当 v2State 里出现一条「文本与本次发送相同、且已含 text 内容」的真实 user 消息。
  // 用「内容匹配」判断，对「断网重连后 reloadSession 已把真实消息拉入」的场景鲁棒
  // （那种情况真实消息不是『新』的，用 id 差集会永远匹配不到、导致一直卡发送中）。
  // 代价：极少数「连发两条相同文本」会让乐观气泡稍早让位给已有消息，属可接受的轻微闪动。
  useEffect(() => {
    if (!pendingSend || pendingSend.status === 'failed') return
    const arrived = v2State.messages.some((m) => {
      if ((m as any).role !== 'user') return false
      const textPart = (v2State.parts[m.id] || []).find((p) => p.type === 'text') as any
      return typeof textPart?.text === 'string' && textPart.text.length > 0 && textPart.text === pendingSend.text
    })
    if (arrived) setPendingSend(null)
  }, [v2State, pendingSend])

  useEffect(() => {
    if (!parentID || !cwd) return
    client.listSessionsByDirectory(cwd).then((list: any[]) => {
      const siblings = list
        .filter((s: any) => s.parentID === parentID)
        .map((s: any) => {
          const agentName = s.agent || (s.title || '').match(/@(\w+)/)?.[1] || ''
          return { id: s.id, title: s.title || s.id.slice(0, 8), agent: agentName }
        })
        .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      setChildSessions(siblings)
    }).catch(() => {})
  }, [parentID, cwd])

  const handleToolPress = useCallback((toolCall: ToolCall) => {
    if (toolCall.name !== 'task') return
    const childId = toolCall.metadata?.sessionId
    if (childId) {
      navigation.push('Session', { sessionId: childId, agent: toolCall.input?.subagent_type, parentId: sessionId })
      return
    }
    const outputMatch = typeof toolCall.output === 'string' ? toolCall.output.match(/<task id="([^"]+)"/) : null
    if (outputMatch) {
      navigation.push('Session', { sessionId: outputMatch[1], agent: toolCall.input?.subagent_type, parentId: sessionId })
      return
    }
    if (cwd) {
      client.listSessionsByDirectory(cwd).then((list: any[]) => {
        const children = list
          .filter((s: any) => s.parentID === sessionId)
          .map((s: any) => {
            const agentName = s.agent || (s.title || '').match(/@(\w+)/)?.[1] || ''
            return { id: s.id, title: s.title || s.id.slice(0, 8), agent: agentName }
          })
          .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        setChildSessions(children)
      }).catch(() => {})
    }
    setShowChildSessions(true)
  }, [navigation, sessionId, client, cwd])

  const subagentInfo = useMemo(() => {
    if (!parentID || !sessionId) return null
    const idx = childSessions.findIndex((s) => s.id === sessionId)
    const name = routeAgent || (idx >= 0 ? childSessions[idx].agent : '') || 'Subagent'
    const agentName = name.charAt(0).toUpperCase() + name.slice(1)
    return { agentName, currentIndex: idx + 1, totalCount: childSessions.length }
  }, [parentID, sessionId, childSessions, routeAgent])

  const handlePrevChild = useCallback(() => {
    if (!parentID || !sessionId) return
    const idx = childSessions.findIndex((s) => s.id === sessionId)
    if (idx > 0) {
      const prev = childSessions[idx - 1]
      navigation.replace('Session', { sessionId: prev.id, parentId: parentID, agent: prev.agent })
    }
  }, [parentID, sessionId, childSessions, navigation])

  const handleNextChild = useCallback(() => {
    if (!parentID || !sessionId) return
    const idx = childSessions.findIndex((s) => s.id === sessionId)
    if (idx < childSessions.length - 1) {
      const next = childSessions[idx + 1]
      navigation.replace('Session', { sessionId: next.id, parentId: parentID, agent: next.agent })
    }
  }, [parentID, sessionId, childSessions, navigation])

  useEffect(() => {
    if (defaultModel && !currentModel) {
      setCurrentModel(defaultModel)
    }
  }, [defaultModel])

  const saveSessionModel = useCallback((key: ModelKey) => {
    AsyncStorage.getItem(sessionModelKey).then((raw) => {
      const all: Record<string, ModelKey> = raw ? JSON.parse(raw) : {}
      all[sessionId] = key
      AsyncStorage.setItem(sessionModelKey, JSON.stringify(all)).catch(() => {})
    }).catch(() => {})
  }, [sessionId])

  const handleModelSelect = useCallback((key: ModelKey) => {
    setCurrentModel(key)
    saveSessionModel(key)
  }, [saveSessionModel])

  const handleRenameTitle = useCallback(() => {
    setRenameValue(sessionTitle)
    setShowRenameModal(true)
  }, [sessionTitle])

  const handleRenameSubmit = useCallback(() => {
    const newTitle = renameValue.trim()
    if (!newTitle || newTitle === sessionTitle) {
      setShowRenameModal(false)
      return
    }
    setSessionTitle(newTitle)
    setShowRenameModal(false)
    client.renameSession(sessionId, newTitle).catch(() => {})
  }, [renameValue, sessionTitle, sessionId, client])

  // ==================== SSE STATE MACHINE ====================
  useEffect(() => {
    if (!sessionId) return

    let aborted = false
    let lastProcessed = 0
    let buf = ''

    const connect = () => {
      if (aborted) return
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.open('GET', `${client.baseUrl}/opencode-api/global/event`)
      xhr.setRequestHeader('Authorization', `Bearer ${client.token}`)

      xhr.onprogress = () => {
        if (retryCountRef.current > 0) {
          retryCountRef.current = 0
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
          setError('已重连')
          setTimeout(() => setError(null), 1500)
        }
        const fullText = xhr.responseText
        const chunk = fullText.substring(lastProcessed)
        lastProcessed = fullText.length

        buf += chunk
        buf = buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const blocks = buf.split('\n\n')
        buf = blocks.pop() || ''

        for (const block of blocks) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
          if (!dataLine) continue
          let raw: any
          try { raw = JSON.parse(dataLine.slice(6)) } catch { continue }
          const payload = raw?.payload || raw
          const evType: string = payload?.type || ''
          const props = payload?.properties || {}

          // [3b-3 影子模式] 把 V2 事件同步喂给 v2Reducer（仅更新 v2State，不接管渲染）。
          // 只关心当前会话。事后接管渲染时，这段升级为唯一消息来源。
          {
            if (evType === 'message.updated' && props.info?.sessionID === sessionId) {
              v2Dispatch({ type: 'message.upsert', message: props.info })
            } else if (evType === 'message.removed' && props.sessionID === sessionId) {
              v2Dispatch({ type: 'message.remove', messageID: props.messageID })
            } else if (evType === 'message.part.updated' && props.part?.sessionID === sessionId) {
              v2Dispatch({ type: 'part.upsert', part: props.part })
            } else if (evType === 'message.part.removed' && props.sessionID === sessionId) {
              v2Dispatch({ type: 'part.remove', messageID: props.messageID, partID: props.partID })
            } else if (evType === 'message.part.delta' && props.sessionID === sessionId) {
              v2Dispatch({ type: 'part.delta', messageID: props.messageID, partID: props.partID, field: props.field, delta: props.delta })
            }
          }

          if (evType === 'session.idle' && props.sessionID === sessionId) { dispatch({ type: 'session/sending', sending: false }); setError(null); continue }
          if (evType === 'session.status' && props.status?.type === 'idle' && props.sessionID === sessionId) { dispatch({ type: 'session/sending', sending: false }); setError(null); continue }
          if (evType === 'session.status' && props.status?.type === 'busy' && props.sessionID === sessionId) { dispatch({ type: 'session/sending', sending: true }); continue }
          if (evType === 'session.status' && props.status?.type === 'retry' && props.sessionID === sessionId) { dispatch({ type: 'session/sending', sending: true }); setError(`⚠️ ${props.status.message}`); continue }
          if (evType === 'session.next.compaction.started' && props.sessionID === sessionId) { setError('正在压缩对话...'); continue }
          if (evType === 'session.next.compaction.ended' && props.sessionID === sessionId) { setError(null); continue }
          if (evType === 'session.compacted' && props.sessionID === sessionId) { setError(null); continue }
          if (evType === 'session.error') {
            dispatch({ type: 'session/sending', sending: false })
            const isAbort = props.error?.name === 'MessageAbortedError'
            if (!isAbort) setError(formatSessionError(props.error))
            continue
          }

          // step-finish：更新上下文 token 用量（消息内容由 v2Reducer 处理）。
          if (evType === 'message.part.updated' && props.part?.type === 'step-finish' && props.part?.sessionID === sessionId) {
            const t = props.part.tokens
            if (t && tokenSum(t) > 0) setContextTokens(tokenSum(t))
            continue
          }

          if (evType === 'permission.asked') {
              const req = props as PermissionRequest
              // 只处理当前会话的审批，忽略同目录其它会话的事件。
              if (req.sessionID === sessionId) dispatch({ type: 'permission/asked', request: req })
              continue
            }

            if (evType === 'permission.replied') {
              const { permissionID, requestID } = props
              const id = requestID || permissionID
              if (id) {
                dispatch({ type: 'permission/removed', id })
              }
              continue
            }

            if (evType === 'question.asked') {
              const req = props as QuestionRequest
              // 只处理当前会话的提问，忽略同目录其它会话的事件。
              if (req.sessionID === sessionId) dispatch({ type: 'question/asked', request: req })
              continue
            }

            if (evType === 'question.replied' || evType === 'question.rejected') {
              const { requestID, questionID } = props
              const id = requestID || questionID
              if (id) {
                dispatch({ type: 'question/removed', id })
              }
              continue
            }
        }
      }

      let retryScheduled = false

      // 安排一次重连：倒计时与真正的重连动作同源，严格对齐。
      // onerror/onloadend 可能就同一次断连都触发，retryScheduled 守卫确保每个连接周期只调度一次。
      const scheduleReconnect = () => {
        if (aborted || retryScheduled) return
        retryScheduled = true

        // 清掉可能残留的旧计时器，避免多个倒计时/重连叠加导致秒数跳变。
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }

        const count = retryCountRef.current++
        const delay = Math.min(1000 * Math.pow(2, count), 30000)
        let secs = Math.ceil(delay / 1000)

        const doReconnect = () => {
          if (aborted) return
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
          setRetryCountdown(0)
          setError('正在重连…')
          retryScheduled = false
          connect()
        }

        // 第一次断连不显示倒计时（沿用原行为：count>=1 才显示）。
        if (count < 1) {
          retryRef.current = setTimeout(doReconnect, delay)
          return
        }

        // 显示倒计时；秒数走到 0 的那一刻正好触发重连，二者对齐。
        setRetryCountdown(secs)
        setError(`连接断开，${secs}s 后重试…`)
        countdownRef.current = setInterval(() => {
          secs -= 1
          if (secs <= 0) {
            doReconnect()
            return
          }
          setRetryCountdown(secs)
          setError(`连接断开，${secs}s 后重试…`)
        }, 1000)
      }

      xhr.onerror = scheduleReconnect
      xhr.onloadend = scheduleReconnect

      xhr.send()
    }

    connect()

    // 主动重连：切后台回前台、网络恢复、或发送/重发时，不等退避倒计时，立即重连 + 刷新。
    const forceReconnect = (showBanner = true) => {
      if (aborted) return
      retryCountRef.current = 0
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
      if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
      if (showBanner) {
        setError('已重连')
        setTimeout(() => setError(null), 1500)
      }
      reloadSession()
      connect()
    }
    forceReconnectRef.current = () => forceReconnect(false)

    const onAppState = (next: AppStateStatus) => {
      if (aborted) return
      if (next === 'active') {
        const wasBackground = appStateRef.current.match(/inactive|background/)
        if (wasBackground) forceReconnect()
      }
      appStateRef.current = next
    }
    const sub = AppState.addEventListener('change', onAppState)

    // 网络从断到通时主动重连（否则要干等指数退避，最长 30s）。
    let wasConnected = true
    const netSub = Network.addNetworkStateListener(({ isConnected }) => {
      if (aborted) return
      const nowConnected = isConnected !== false
      if (nowConnected && !wasConnected) forceReconnect()
      wasConnected = nowConnected
    })

    return () => {
      aborted = true
      forceReconnectRef.current = null
      sub.remove()
      netSub.remove()
      if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
      if (retryRef.current) clearTimeout(retryRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [sessionId])

  const getModelDisplayName = useCallback((key: ModelKey | null): string => {
    const k = key || defaultModel
    if (!k) return ''
    for (const p of providers) {
      if (p.id === k.providerID) {
        const m = p.models[k.modelID]
        return m?.name || k.modelID
      }
    }
    return k.modelID
  }, [providers, defaultModel])

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToIndex({ index: 0, animated })
  }, [])

  const handleScroll = useCallback((e: any) => {
    const offset = e.nativeEvent.contentOffset.y
    lastOffset.current = offset
    const isNearBottom = offset < 80
    if (userScrolling.current) {
      isAtBottom.current = isNearBottom
    }
    if (isNearBottom !== !showScrollButton) {
      setShowScrollButton(!isNearBottom)
      Animated.spring(scrollButtonOpacity, {
        toValue: isNearBottom ? 0 : 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start()
    }
  }, [showScrollButton, scrollButtonOpacity])

  const handleRevert = useCallback(async (revertMessageId: string) => {
    let sessionData: any
    try {
      sessionData = await client.revertMessage(sessionId, revertMessageId, cwd)
    } catch (e: any) {
      toast.error(e?.message || '回退失败')
      return
    }
    if (sessionData?.revert) {
      dispatch({ type: 'session/sending', sending: false })
      setError(null)
      setRevertMessageId(sessionData.revert.messageID)
      setRevertDiff(sessionData.revert.diff || null)
      // 回填被撤回的那条用户输入到输入框（从当前 V2 消息里取，无需再拉取）。
      const reverted = v2State.messages.find((m) => m.id === revertMessageId)
      if (reverted && (reverted as any).role === 'user') {
        const textPart = (v2State.parts[reverted.id] || []).find((p) => p.type === 'text') as any
        if (textPart?.text) setInput(textPart.text)
      }
    }
  }, [client, sessionId, cwd, toast, v2State])

  const handleUnrevert = useCallback(async () => {
    try {
      await client.unrevertMessage(sessionId, cwd)
      setRevertMessageId(null)
      setRevertDiff(null)
      setError(null)
      // 消息仍在 v2State 中，清除 revert 态后 renderMessages 会自动全部重新显示。
    } catch (e: any) {
      toast.error(e?.message || '撤销回退失败')
    }
  }, [client, sessionId, cwd, toast])

  const handleAbort = useCallback(async () => {
    dispatch({ type: 'session/sending', sending: false })
    try {
      await client.abortSession(sessionId, cwd)
    } catch (e: any) {
      toast.error(e?.message || '中止失败')
    }
  }, [client, sessionId, cwd, toast])

  const handleCompact = useCallback(async () => {
    try {
      toast.show('正在压缩对话...', 'info')
      await client.summarizeSession(sessionId, currentModel?.modelID, currentModel?.providerID)
    } catch (e: any) {
      toast.error(e?.message || '压缩失败')
    }
  }, [client, sessionId, currentModel, toast])

  // 实际发送。text+attachments 已确定；乐观回显 + 失败标记均在此处理。
  const doSend = useCallback(async (text: string, sendAttachments: FileAttachment[]) => {
    dispatch({ type: 'session/sending', sending: true })
    setError(null)
    isAtBottom.current = true
    userScrolling.current = false
    lastOffset.current = 0

    const msg: UserMsg = {
      id: `pending-${Date.now()}`,
      role: 'user',
      text,
      files: sendAttachments.map((a) => ({ url: `data:${a.mime};base64,${a.base64}`, mime: a.mime, filename: a.filename })),
    }
    setPendingSend({ msg, text, attachments: sendAttachments, status: 'sending' })

    try {
      const parts: any[] = [{ type: 'text' as any, text }]
      for (const a of sendAttachments) {
        parts.push({ type: 'file' as any, mime: a.mime, filename: a.filename, url: `data:${a.mime};base64,${a.base64}` })
      }
      await client.promptMessage(
        sessionId,
        parts,
        currentModel ? { providerID: currentModel.providerID, modelID: currentModel.modelID } : undefined,
        currentAgent ? currentAgent.name : undefined,
      )
    } catch (e: any) {
      dispatch({ type: 'session/sending', sending: false })
      setError(`发送失败: ${e.message}`)
      // 保留失败消息（不删），标记 failed 供点击重发。
      setPendingSend((prev) => (prev ? { ...prev, status: 'failed' } : prev))
    }
  }, [sessionId, client, currentModel, currentAgent])

  const handleSend = useCallback(() => {
    if (!canSendMessage(input, attachments) || sending || !sessionId) return
    const text = input.trim()
    const currentAttachments = attachments
    setInput('')
    setAttachments([])
    doSend(text, currentAttachments)
  }, [input, sending, sessionId, attachments, doSend])

  // 点击失败消息重发：用保存的原始 text+附件重新发送。
  // 重发前主动重连 SSE——失败通常源于断网，此时事件流多半仍是断开的，
  // 不重连的话即使消息发出去，AI 回复的实时事件也收不到（表现为一直「发送中」）。
  const handleResend = useCallback(() => {
    if (pendingSend?.status !== 'failed') return
    forceReconnectRef.current?.()
    doSend(pendingSend.text, pendingSend.attachments)
  }, [pendingSend, doSend])

  const addAttachment = async (uri: string, mime: string, filename: string) => {
    try {
      const file = new File(uri)
      const bytes = await file.bytes()
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      setAttachments(prev => [...prev, { id: `a-${Date.now()}-${prev.length}`, uri, mime, filename, base64 }])
    } catch (e: any) {
      setError(`读取附件失败: ${e?.message || '未知错误'}`)
    }
  }

  const handlePickCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        setError('需要相机权限才能拍照')
        return
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] })
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0]
        addAttachment(a.uri, a.mimeType || 'image/jpeg', a.fileName || `camera-${Date.now()}.jpg`)
      }
    } catch (e: any) {
      setError(`打开相机失败: ${e?.message || '未知错误'}`)
    }
  }

  const handlePickLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true })
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0]
        if (a.base64) {
          setAttachments(prev => [...prev, { id: `a-${Date.now()}-${prev.length}`, uri: a.uri, mime: a.mimeType || 'image/jpeg', filename: a.fileName || `image-${Date.now()}.jpg`, base64: a.base64! }])
        } else {
          addAttachment(a.uri, a.mimeType || 'image/jpeg', a.fileName || `image-${Date.now()}.jpg`)
        }
      }
    } catch (e: any) {
      setError(`打开相册失败: ${e?.message || '未知错误'}`)
    }
  }

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0]
        addAttachment(a.uri, a.mimeType || 'application/octet-stream', a.name)
      }
    } catch (e: any) {
      setError(`选择文件失败: ${e?.message || '未知错误'}`)
    }
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  const currentModelName = getModelDisplayName(currentModel)
  const headerModelCwd = currentModelName ? `${currentModelName} · ${cwd || '对话'}` : (cwd || '对话')
  const headerAgentName = currentAgent ? currentAgent.name.charAt(0).toUpperCase() + currentAgent.name.slice(1) : ''

  const renderEmpty = () => (
    <View style={styles.emptyOuter}>
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconRow}>
          <Text style={styles.emptyIcon}>💬</Text>
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>LayCode</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>{greeting}</Text>
        <View style={styles.suggestions}>
          {['帮我写一段 Python 代码', '解释一下这个算法', '重构我的项目'].map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.suggestionChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => { setInput(s); inputRef.current?.focus() }}
              activeOpacity={0.7}
            >
              <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  )

  const headerTitle = sending ? 'AI 思考中...' : (sessionTitle || '对话')
  const headerSubtitle = headerAgentName ? `${headerAgentName} · ${headerModelCwd}` : headerModelCwd
  const ContentContainer = Animated.View
  const contentStyle = [styles.contentArea, { transform: [{ translateY: keyboardOffset }] }]
  const contextLimit = currentModel
    ? providers.find((p) => p.id === currentModel.providerID)?.models[currentModel.modelID]?.limit?.context
    : undefined

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border, zIndex: 2 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-left" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <TouchableOpacity onPress={handleRenameTitle} style={styles.headerTitleTouch}>
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{headerTitle}</Text>
            </TouchableOpacity>
            <View style={styles.statusRow}>
              <Text style={[styles.statusText, { color: theme.textTertiary }]} numberOfLines={1}>{headerSubtitle}</Text>
              <View style={[styles.statusDot, { backgroundColor: sending ? theme.warning : theme.success }]} />
            </View>
          </View>
          <View style={styles.headerRight} />
        </View>

        {sessionBanner && (() => {
          const isReconnect = sessionBanner.text === '已重连'
          const bg = sessionBanner.bg || (isReconnect ? theme.success : theme.error)
          const icon = isReconnect ? 'check-circle' : 'refresh-cw'
          return (
            <View style={[styles.errorBar, { backgroundColor: bg }]}>
              <Feather name={icon} size={14} color="rgba(255,255,255,0.8)" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{sessionBanner.text}</Text>
              <TouchableOpacity onPress={() => dispatch({ type: 'banner/set', banner: null })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={16} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>
          )
        })()}

        {pendingPermissions.length > 0 && (
          <View style={[styles.permissionBanner, { backgroundColor: theme.warning + '20', borderBottomColor: theme.warning + '40' }]}>
            <Feather name="shield" size={14} color={theme.warning} />
            <Text style={[styles.permissionBannerText, { color: theme.warning }]}>
              {pendingPermissions.length} permission request{pendingPermissions.length > 1 ? 's' : ''} pending
            </Text>
          </View>
        )}

        {renderMessages.length === 0 ? (
          <>
            <View style={styles.emptyWrapper}>
              {renderEmpty()}
            </View>
            {parentID && subagentInfo ? (
              <SubagentFooter
                theme={theme}
                agentName={subagentInfo.agentName}
                currentIndex={subagentInfo.currentIndex}
                totalCount={subagentInfo.totalCount}
                onPrev={handlePrevChild}
                onNext={handleNextChild}
              />
            ) : (
              <Animated.View style={{ transform: [{ translateY: keyboardOffset }] }}>
                  <InputBar
                    input={input}
                    onChangeText={setInput}
                    onSend={handleSend}
                    onStop={handleAbort}
                    sending={sending}
                    disabled={pendingPermissions.length > 0 || pendingQuestions.length > 0}
                    theme={theme}
                    inputRef={inputRef}
                    isKeyboardOpen={isKeyboardOpen}
                    currentModel={currentModel}
                    onPressModelSelector={() => setModelSelectorVisible(true)}
                    currentAgent={currentAgent}
                    onPressAgentSelector={() => setAgentSelectorVisible(true)}
                    contextTokens={contextTokens}
                    contextLimit={contextLimit}
                    attachments={attachments}
                    onPickCamera={handlePickCamera}
                    onPickLibrary={handlePickLibrary}
                    onPickFile={handlePickFile}
                    onRemoveAttachment={handleRemoveAttachment}
                  />
                </Animated.View>
              )}
            </>
          ) : (
            <ContentContainer style={contentStyle}>
              <FlatList
                ref={flatListRef}
                inverted
                data={renderMessages}
                keyExtractor={(item) => item.id}
              renderItem={({ item }: { item: ListItem }) => {
                if (isRevertBanner(item)) {
                  return <RevertBanner banner={item} theme={theme} onUnrevert={handleUnrevert} />
                }
                if (isCompaction(item)) {
                  return (
                    <View style={[styles.compactionDivider, { borderColor: theme.border }]}>
                      <View style={[styles.compactionBadge, { backgroundColor: theme.warning + '20' }]}>
                        <Text style={[styles.compactionBadgeText, { color: theme.warning }]}>
                          {item.reason === 'auto' ? '自动压缩' : '手动压缩'}
                        </Text>
                      </View>
                    </View>
                  )
                }
                const isPending = pendingSend?.msg.id === item.id
                const sendStatus = isPending ? pendingSend!.status : undefined
                return <MessageBubble message={item} theme={theme} onToolPress={handleToolPress} onRevert={item.role === 'user' ? () => handleRevert(item.id) : undefined} workspaceDir={cwd} sendStatus={sendStatus} onResend={sendStatus === 'failed' ? handleResend : undefined} />
              }}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
              ListFooterComponent={loadingMore ? <View style={styles.loadingMore}><ActivityIndicator size="small" color={theme.accent} /></View> : null}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                // 贴底时才跟随打字机增长；上滑查看历史时不打扰。
                // 配合 maintainVisibleContentPosition：离底时内容增长不会顶动用户视图。
                if (sending && lastOffset.current < 80) scrollToBottom(true)
              }}
              onScrollBeginDrag={() => {
                userScrolling.current = true
                isAtBottom.current = false
              }}
              onScrollEndDrag={(e) => {
                isAtBottom.current = e.nativeEvent.contentOffset.y < 80
              }}
              onMomentumScrollEnd={(e) => {
                isAtBottom.current = e.nativeEvent.contentOffset.y < 80
                userScrolling.current = false
              }}
              keyboardShouldPersistTaps="handled"
            />

            {parentID && subagentInfo ? (
              <SubagentFooter
                theme={theme}
                agentName={subagentInfo.agentName}
                currentIndex={subagentInfo.currentIndex}
                totalCount={subagentInfo.totalCount}
                onPrev={handlePrevChild}
                onNext={handleNextChild}
              />
            ) : (
              <InputBar
                input={input}
                onChangeText={setInput}
                onSend={handleSend}
                onStop={handleAbort}
                sending={sending}
                disabled={pendingPermissions.length > 0 || pendingQuestions.length > 0}
                theme={theme}
                inputRef={inputRef}
                isKeyboardOpen={isKeyboardOpen}
                currentModel={currentModel}
                onPressModelSelector={() => setModelSelectorVisible(true)}
                currentAgent={currentAgent}
                onPressAgentSelector={() => setAgentSelectorVisible(true)}
                contextTokens={contextTokens}
                contextLimit={contextLimit}
                attachments={attachments}
                onPickCamera={handlePickCamera}
                onPickLibrary={handlePickLibrary}
                onPickFile={handlePickFile}
                onRemoveAttachment={handleRemoveAttachment}
              />
            )}
          </ContentContainer>
        )}

        {pendingPermissions.length > 0 && (
        <PermissionPrompt
          request={pendingPermissions[0]}
          theme={theme}
          onReply={handlePermissionReply}
          onDismiss={() => dispatch({ type: 'permission/removed', id: pendingPermissions[0].id })}
        />
      )}

        {pendingQuestions.length > 0 && (
        <QuestionPrompt
          request={pendingQuestions[0]}
          theme={theme}
          onReply={handleQuestionReply}
          onReject={handleQuestionReject}
          onDismiss={() => dispatch({ type: 'question/removed', id: pendingQuestions[0].id })}
        />
      )}

      {showScrollButton && renderMessages.length > 0 && (
          <Animated.View style={[styles.scrollButton, { opacity: scrollButtonOpacity, backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity onPress={() => { isAtBottom.current = true; userScrolling.current = false; lastOffset.current = 0; scrollToBottom() }} style={styles.scrollButtonTouch} activeOpacity={0.7}>
              <Feather name="chevron-down" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {cwd && (
          <Animated.View style={[styles.fabContainer, { transform: fabPan.getTranslateTransform() }]} {...fabPanResponder.panHandlers}>
            <FabMenu visible={fabMenuVisible} theme={theme} onToolPress={(tool) => { setFabMenuVisible(false); if (tool === 'git') navigation.push('Git', { directory: cwd }); else if (tool === 'terminal') navigation.push('Terminal', { directory: cwd }); else if (tool === 'compact') handleCompact() }} />
            <Animated.View style={[styles.fab, { backgroundColor: theme.accent, transform: [{ rotate: fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }]}>
              <Feather name="tool" size={22} color="#fff" />
            </Animated.View>
          </Animated.View>
        )}
      </View>

      <ModelSelectorModal
        visible={modelSelectorVisible}
        onClose={() => setModelSelectorVisible(false)}
        onSelect={handleModelSelect}
        currentModel={currentModel}
        themeMode={themeMode}
        client={client}
        config={config}
      />

      <AgentSelectorModal
        visible={agentSelectorVisible}
        onClose={() => setAgentSelectorVisible(false)}
        agents={availableAgents}
        currentAgent={currentAgent}
        onSelect={(agent) => setCurrentAgent(agent.name)}
        theme={theme}
      />

      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <KeyboardAvoidingView style={styles.renameOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.renameOverlayDismiss} activeOpacity={1} onPress={() => setShowRenameModal(false)} />
          <View style={[styles.renameDialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.renameTitle, { color: theme.text }]}>重命名会话</Text>
            <TextInput
              style={[styles.renameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={handleRenameSubmit}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity style={[styles.renameBtn, { backgroundColor: theme.surfaceSecondary }]} onPress={() => setShowRenameModal(false)}>
                <Text style={[styles.renameBtnText, { color: theme.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.renameBtn, styles.renameBtnPrimary, { backgroundColor: theme.accent }]} onPress={handleRenameSubmit}>
                <Text style={[styles.renameBtnText, { color: '#fff' }]}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={styles.renameOverlayDismiss} activeOpacity={1} onPress={() => setShowRenameModal(false)} />
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showChildSessions} transparent animationType="slide" onRequestClose={() => setShowChildSessions(false)}>
        <SafeAreaView style={[styles.childSessionsOverlay, { backgroundColor: theme.background }]}>
          <View style={[styles.childSessionsHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.childSessionsTitle, { color: theme.text }]}>子 Agent</Text>
            <TouchableOpacity onPress={() => setShowChildSessions(false)}>
              <Feather name="x" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          {childSessions.length === 0 ? (
            <View style={styles.childSessionsEmpty}>
              <Text style={[styles.childSessionsEmptyText, { color: theme.textTertiary }]}>暂无子 Agent</Text>
            </View>
          ) : (
            <FlatList
              data={childSessions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const agentDisplay = item.agent ? item.agent.charAt(0).toUpperCase() + item.agent.slice(1) : 'Subagent'
                return (
                  <TouchableOpacity
                    style={[styles.childSessionItem, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      setShowChildSessions(false)
                      navigation.push('Session', { sessionId: item.id, agent: item.agent, parentId: sessionId })
                    }}
                  >
                    <Text style={styles.childSessionIcon}>🤖</Text>
                    <View style={styles.childSessionContent}>
                      <Text style={[styles.childSessionAgent, { color: theme.text }]}>{agentDisplay}</Text>
                      {item.title ? (
                        <Text style={[styles.childSessionText, { color: theme.textTertiary }]} numberOfLines={1}>{item.title}</Text>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={14} color={theme.textTertiary} />
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  contentArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 0.5 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerTitleTouch: { paddingHorizontal: 8, paddingVertical: 2 },

  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginLeft: 4 },
  statusText: { fontSize: 11 },
headerRight: { width: 36 },
  errorBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7 },
  errorText: { flex: 1, color: '#fff', fontSize: 13 },
  permissionBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, gap: 6, borderBottomWidth: 1 },
  permissionBannerText: { fontSize: 12, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 16 },
  emptyWrapper: { flex: 1 },
  emptyOuter: { flex: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIconRow: { marginBottom: 16 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, marginBottom: 28, textAlign: 'center', lineHeight: 20 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  suggestionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  suggestionText: { fontSize: 13 },
  compactionDivider: { marginVertical: 8, borderTopWidth: 1, alignItems: 'center', paddingTop: 4 },
  compactionBadge: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10 },
  compactionBadgeText: { fontSize: 11, fontWeight: '600' },
  scrollButton: { position: 'absolute', bottom: 80, right: 16, borderRadius: 20, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
  scrollButtonTouch: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  renameOverlay: { flex: 1 },
  renameOverlayDismiss: { flex: 1 },
  renameDialog: { marginHorizontal: 12, borderRadius: 12, padding: 20, borderWidth: 0.5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  renameTitle: { fontSize: 17, fontWeight: '600', marginBottom: 16 },
  renameInput: { fontSize: 15, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 },
  renameBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  renameBtnPrimary: {},
  renameBtnText: { fontSize: 15, fontWeight: '500' },

  childSessionsOverlay: { flex: 1, marginTop: Platform.OS === 'ios' ? 44 : 0 },
  childSessionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  childSessionsTitle: { fontSize: 17, fontWeight: '600' },
  childSessionsEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  childSessionsEmptyText: { fontSize: 15 },
  childSessionItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  childSessionIcon: { fontSize: 20 },
  childSessionContent: { flex: 1, gap: 2 },
  childSessionAgent: { fontSize: 15, fontWeight: '500' },
  childSessionText: { fontSize: 13 },
  fabContainer: { position: 'absolute', bottom: 24, right: 16, alignItems: 'flex-end', zIndex: 100 },
  fab: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 },
  loadingMore: { paddingVertical: 16, alignItems: 'center' },
})
