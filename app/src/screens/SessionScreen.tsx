import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform, Animated, Modal, KeyboardAvoidingView, AppState, AppStateStatus } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LayCodeClient } from '../api/client'
import { getTheme, ThemeMode } from '../theme'
import MessageBubble from '../components/MessageBubble'
import InputBar from '../components/InputBar'
import SubagentFooter from '../components/SubagentFooter'
import PermissionPrompt from '../components/PermissionPrompt'
import QuestionPrompt from '../components/QuestionPrompt'
import ModelSelectorModal from '../components/ModelSelectorModal'
import AgentSelectorModal from '../components/AgentSelectorModal'
import RevertBanner from '../components/RevertBanner'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { useAgents } from '../hooks/useAgents'
import type { Message, AssistantMsg, UserMsg, ToolCall, ModelKey, Provider, Agent, PermissionRequest, PermissionReply, QuestionRequest, ServerEntry, ListItem, RevertBannerMsg, CompactionMsg } from '../types'
import { mapToolStatus, isAssistant, isRevertBanner, isCompaction } from '../types'
import { stripThinking } from '../utils/segmentParts'
import { storageKey } from '../utils/storage'
import { parseRevertDiff } from '../utils/revertDiff'

function formatSessionError(error: any): string {
  const name = error?.name || ''
  const message = error?.data?.message || error?.message || ''
  const statusCode = name === 'APIError' ? error?.data?.statusCode : undefined
  const parts = [name, message].filter(Boolean)
  if (statusCode) parts.splice(1, 0, String(statusCode))
  return parts.join(' ') || 'Unknown error'
}

function buildRevertedList(messages: Message[], revertedCount: number, diffFiles: { filename: string; additions: number; deletions: number }[]): ListItem[] {
  const banner: RevertBannerMsg = {
    id: `revert-banner`,
    role: 'revert-banner',
    revertedCount,
    diffFiles,
  }
  const list: ListItem[] = [banner, ...messages.reverse()]
  return list
}

function countRevertedMessages(messages: Message[], revertIdx: number): number {
  let count = 0
  for (let i = revertIdx; i < messages.length; i++) {
    if (messages[i].role === 'user') count++
  }
  return count
}

function findRevertedMessageText(messages: Message[], revertIdx: number): string {
  const msg = messages[revertIdx]
  if (msg.role === 'user') return msg.text || ''
  return ''
}

function parseMessages(raw: any[]): Message[] {
  return (raw || []).map((item: any): Message => {
    const role = item.info?.role || 'assistant'
    const id = item.info?.id || item.id
    if (role === 'user') {
      return { id, role: 'user', text: item.parts?.[0]?.text || '' }
    }
    const reasoningPart = (item.parts || []).find((p: any) => p.type === 'reasoning')
    const textParts = (item.parts || []).filter((p: any) => p.type === 'text')
    const toolParts = (item.parts || []).filter((p: any) => p.type === 'tool')
    const errorInfo = item.info?.error
    const errorContent = errorInfo
      ? `⚠️ ${formatSessionError(errorInfo)}`
      : ''
    return {
      id,
      role: 'assistant',
      reasoning: { text: reasoningPart?.text || '', isActive: false },
      content: errorContent || textParts.map((p: any) => stripThinking(p.text || '')).join(''),
      toolCalls: toolParts.map((p: any): ToolCall => ({
        id: p.id,
        name: p.tool || p.name || '',
        status: mapToolStatus(p.state?.status || 'completed'),
        input: p.state?.input,
        output: p.state?.output,
        metadata: { ...(p.state?.metadata || {}), ...(p.metadata || {}) },
      })),
    }
  })
}

interface Props {
  route: any
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
  config: ServerEntry
}

const GREETINGS = ['有什么我可以帮你的？', '开始一段新的对话吧']

export default function SessionScreen({ route, navigation, themeMode, client, config }: Props) {
  const { sessionId, title: routeTitle, agents: agentsJson, defaultAgent, agent: routeAgent } = route.params || {}
  const agentsFromParent = useMemo<Agent[]>(() => agentsJson ? JSON.parse(agentsJson) : [], [agentsJson])
  const theme = getTheme(themeMode)
  const [messages, setMessages] = useState<ListItem[]>([])
  const [sessionTitle, setSessionTitle] = useState(routeTitle || sessionId?.slice(0, 8) || '')
  const [cwd, setCwd] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionBanner, setSessionBanner] = useState<{ text: string; bg?: string } | null>(null)
  const setError = useCallback((msg: string | null) => {
    setSessionBanner(msg ? { text: msg } : null)
  }, [])
  const [retryCountdown, setRetryCountdown] = useState(0)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [currentModel, setCurrentModel] = useState<ModelKey | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [agentSelectorVisible, setAgentSelectorVisible] = useState(false)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<QuestionRequest[]>([])
  const [defaultModel, setDefaultModel] = useState<ModelKey | null>(null)
  const [revertMessageId, setRevertMessageId] = useState<string | null>(null)
  const [revertDiff, setRevertDiff] = useState<string | null>(null)
  const [contextTokens, setContextTokens] = useState(0)
  const [parentID, setParentID] = useState<string | null>(route.params?.parentId || null)
  const [childSessions, setChildSessions] = useState<{ id: string; title: string; agent: string }[]>([])
  const [showChildSessions, setShowChildSessions] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const appStateRef = useRef(AppState.currentState)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<TextInput>(null)
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current
  const { keyboardOffset, isKeyboardOpen } = useKeyboardHeight()
  const sessionModelKey = storageKey(config.id, 'session-models')
  const { agents: availableAgents, currentAgent, setAgent: setCurrentAgent } = useAgents(agentsFromParent, sessionId, defaultAgent, config.id)

  const handlePermissionReply = useCallback(async (reply: PermissionReply, message?: string) => {
    const req = pendingPermissions[0]
    if (!req) return

    if (reply === 'reject' && message) {
      const loadingId = `loading-${Date.now()}`
      setMessages((prev) => [
        { id: loadingId, role: 'assistant', reasoning: { text: '', isActive: false }, content: '', toolCalls: [] },
        ...prev,
      ])
    }

    setPendingPermissions((prev) => prev.filter((p) => p.id !== req.id))

    const ok = await client.replyPermission(req.id, reply, message, cwd || undefined)
    if (!ok) setError('Failed to respond to permission request')
  }, [pendingPermissions, client, cwd])

  const handleQuestionReply = useCallback(async (answers: string[][]) => {
    const req = pendingQuestions[0]
    if (!req) return
    setPendingQuestions((prev) => prev.filter((q) => q.id !== req.id))
    const ok = await client.replyQuestion(req.id, answers, cwd || undefined)
    if (!ok) setError('Failed to reply to question')
  }, [pendingQuestions, client, cwd])

  const handleQuestionReject = useCallback(async () => {
    const req = pendingQuestions[0]
    if (!req) return
    setPendingQuestions((prev) => prev.filter((q) => q.id !== req.id))
    const ok = await client.rejectQuestion(req.id, cwd || undefined)
    if (!ok) setError('Failed to reject question')
  }, [pendingQuestions, client, cwd])

  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

  const reloadSession = async () => {
    if (!sessionId) return

    try {
      const [sessionData, raw, providersRes] = await Promise.all([
        client.getSession(sessionId).catch(() => null),
        client.getMessages(sessionId).catch(() => [] as any[]),
        client.getProviders().catch(() => null),
      ])

      // Session metadata
      if (sessionData?.info?.title) setSessionTitle(sessionData.info.title)
      if (sessionData?.info?.parentID) setParentID(sessionData.info.parentID)
      const dir = sessionData?.directory || sessionData?.info?.directory
      if (dir) setCwd(dir)
      if (sessionData?.revert?.messageID) setRevertMessageId(sessionData.revert.messageID)
      if (sessionData?.revert?.diff) setRevertDiff(sessionData.revert.diff)

      // Messages
      if (raw.length > 0) {
        const m = parseMessages(raw)
        const revertMsgId = sessionData?.revert?.messageID
        if (revertMsgId) {
          const revertIdx = m.findIndex((msg) => msg.id === revertMsgId)
          if (revertIdx >= 0) {
            const before = m.slice(0, revertIdx)
            const diffFiles = parseRevertDiff(sessionData?.revert?.diff || '')
            setMessages(buildRevertedList(before, countRevertedMessages(m, revertIdx), diffFiles))
          } else {
            setMessages(m.reverse())
          }
        } else {
          setMessages(m.reverse())
        }

        const lastAssistant = (raw as any[]).findLast((item: any) => item.info?.role === 'assistant')
        if (lastAssistant?.info?.providerID && lastAssistant?.info?.modelID) {
          setCurrentModel({
            providerID: lastAssistant.info.providerID,
            modelID: lastAssistant.info.modelID,
          })
        }
        if (lastAssistant?.info?.tokens) {
          const t = lastAssistant.info.tokens
          setContextTokens(t.input + t.output + t.reasoning + (t.cache?.read || 0) + (t.cache?.write || 0))
        }

        // Infer session activity from running tool calls
        const hasRunning = (raw as any[]).some((item: any) => {
          if (item.info?.role !== 'assistant') return false
          return (item.parts || []).some((p: any) => p.type === 'tool' && (p.state?.status === 'running' || p.state?.status === 'pending'))
        })
        setSending(hasRunning)

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

      // Pending permissions & questions (need dir)
      if (dir) {
        const [reqs, qs] = await Promise.all([
          client.listPendingPermissions(dir).catch(() => []),
          client.listPendingQuestions(dir).catch(() => []),
        ])
        if (reqs.length > 0) {
          setPendingPermissions((prev) => {
            const existing = new Set(prev.map((p) => p.id))
            return [...prev, ...reqs.filter((r: any) => !existing.has(r.id))]
          })
        }
        if (qs.length > 0) {
          setPendingQuestions((prev) => {
            const existing = new Set(prev.map((q) => q.id))
            return [...prev, ...qs.filter((r: any) => !existing.has(r.id))]
          })
        }
      }
    } catch (e: any) {
      setError(`加载失败: ${e.message}`)
    }
  }

  useEffect(() => {
    if (sessionId) reloadSession()
  }, [sessionId])

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
      navigation.push('Session', { projectId: childId, sessionId: childId, agent: toolCall.input?.subagent_type, parentId: sessionId })
      return
    }
    const outputMatch = typeof toolCall.output === 'string' ? toolCall.output.match(/<task id="([^"]+)"/) : null
    if (outputMatch) {
      navigation.push('Session', { projectId: outputMatch[1], sessionId: outputMatch[1], agent: toolCall.input?.subagent_type, parentId: sessionId })
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
      navigation.replace('Session', { projectId: prev.id, sessionId: prev.id, parentId: parentID, agent: prev.agent })
    }
  }, [parentID, sessionId, childSessions, navigation])

  const handleNextChild = useCallback(() => {
    if (!parentID || !sessionId) return
    const idx = childSessions.findIndex((s) => s.id === sessionId)
    if (idx < childSessions.length - 1) {
      const next = childSessions[idx + 1]
      navigation.replace('Session', { projectId: next.id, sessionId: next.id, parentId: parentID, agent: next.agent })
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
    const reasoningPartIds = new Set<string>()

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

          if (evType === 'session.idle' && props.sessionID === sessionId) { setSending(false); setError(null); setMessages((prev) => prev.filter((m) => !m.id.startsWith('loading-'))); continue }
          if (evType === 'session.status' && props.status?.type === 'idle' && props.sessionID === sessionId) { setSending(false); setError(null); setMessages((prev) => prev.filter((m) => !m.id.startsWith('loading-'))); continue }
          if (evType === 'session.status' && props.status?.type === 'busy' && props.sessionID === sessionId) { setSending(true); continue }
          if (evType === 'session.status' && props.status?.type === 'retry' && props.sessionID === sessionId) { setSending(true); setError(`⚠️ ${props.status.message}`); continue }
          if (evType === 'session.next.compaction.started' && props.sessionID === sessionId) { setError('正在压缩对话...'); continue }
          if (evType === 'session.next.compaction.ended' && props.sessionID === sessionId) {
            setError(null)
            setMessages((prev) => {
              const filtered = prev.filter((m) => !m.id.startsWith('loading-'))
              const compactionMsg: CompactionMsg = {
                id: props.messageID || `compact-${Date.now()}`,
                role: 'compaction',
                reason: props.reason || 'auto',
                summary: props.text || '',
                recent: props.recent || '',
              }
              return [compactionMsg, ...filtered]
            })
            continue
          }
          if (evType === 'session.compacted' && props.sessionID === sessionId) { setError(null); continue }
          if (evType === 'session.error') {
            setSending(false)
            const isAbort = props.error?.name === 'MessageAbortedError'
            const errMsg = formatSessionError(props.error)
            if (!isAbort) setError(errMsg)
            setMessages((prev) => {
              const filtered = prev.filter((m) => !m.id.startsWith('loading-'))
              const errorId = `error-${Date.now()}`
              return [{ id: errorId, role: 'assistant', reasoning: { text: '', isActive: false }, content: `⚠️ ${errMsg}`, toolCalls: [] }, ...filtered]
            })
            continue
          }

          if (evType === 'message.part.updated') {
            const part = props.part
            if (!part || !part.id) continue
            if (part.sessionID !== sessionId) continue
            const msgID: string = part.messageID
            const partType: string = part.type
            const partText: string = part.text || ''

            if (partType === 'reasoning' && partText === '') {
              reasoningPartIds.add(part.id)
              setMessages((prev) => {
                const exists = prev.find((m) => m.id === msgID)
                if (exists) {
                  if (isAssistant(exists)) {
                    return prev.map((m) => m.id === msgID ? { ...m, reasoning: { text: '', isActive: true } } : m)
                  }
                  return prev.map((m) => m.id === msgID ? { ...m, role: 'assistant', reasoning: { text: '', isActive: true }, content: m.role === 'user' ? m.text : '', toolCalls: [] } : m)
                }
                const filtered = prev.filter((m) => !m.id.startsWith('loading-'))
                return [{ id: msgID, role: 'assistant', reasoning: { text: '', isActive: true }, content: '', toolCalls: [] }, ...filtered]
              })
              continue
            }

            if (partType === 'reasoning' && partText !== '') {
              setMessages((prev) => prev.map((m) =>
                m.id === msgID
                  ? m.role === 'assistant'
                    ? { ...m, reasoning: { text: partText, isActive: false } }
                    : { ...m, role: 'assistant', reasoning: { text: partText, isActive: false }, content: m.role === 'user' ? m.text : '', toolCalls: [] }
                  : m
              ))
              continue
            }

            if (partType === 'text') {
              setMessages((prev) => {
                const exists = prev.find((m) => m.id === msgID)
                if (exists) {
                  if (isAssistant(exists)) {
                    return prev.map((m) => m.id === msgID && isAssistant(m)
                      ? { ...m, reasoning: { ...m.reasoning, isActive: false } }
                      : m
                    )
                  }
                  return prev.map((m) => m.id === msgID ? { ...m, text: partText } : m)
                }
                const pendingIdx = prev.findIndex((m) => m.id.startsWith('u-') && m.role === 'user')
                if (pendingIdx >= 0) {
                  const copy = [...prev]
                  copy[pendingIdx] = { id: msgID, role: 'user', text: partText }
                  return copy
                }
                return [{ id: msgID, role: 'user', text: partText }, ...prev]
              })
              continue
            }

            if (partType === 'tool') {
              setMessages((prev) => prev.map((m) => {
                if (m.id !== msgID || !isAssistant(m)) return m
                const tc: ToolCall = {
                  id: part.id,
                  name: part.tool || part.name || '',
                  status: mapToolStatus(part.state?.status || 'running'),
                  input: part.state?.input,
                  output: part.state?.output,
                  metadata: { ...(part.state?.metadata || {}), ...(part.metadata || {}) },
                }
                const existing = m.toolCalls.find((t) => t.id === part.id)
                if (existing) {
                  return { ...m, toolCalls: m.toolCalls.map((t) => t.id === part.id ? { ...tc, metadata: { ...existing.metadata, ...tc.metadata } } : t) }
                }
                return { ...m, toolCalls: [...m.toolCalls, tc] }
              }))
              continue
            }

            if (partType === 'step-finish') {
              const t = part.tokens
              if (t) setContextTokens(t.input + t.output + t.reasoning + (t.cache?.read || 0) + (t.cache?.write || 0))
              continue
            }

            continue
          }

            if (evType === 'message.part.delta') {
              const { messageID, partID, delta, sessionID: evSessionID } = props
              if (!delta || !partID || !messageID) continue
              if (evSessionID !== sessionId) continue

              const isReasoningDelta = reasoningPartIds.has(partID)

              setMessages((prev) => {
                const anyExists = prev.find((m) => m.id === messageID)
                if (!anyExists) {
                  const filtered = prev.filter((m) => !m.id.startsWith('loading-'))
                  if (isReasoningDelta) {
                    return [{ id: messageID, role: 'assistant', reasoning: { text: delta, isActive: true }, content: '', toolCalls: [] }, ...filtered]
                  }
                  return [{ id: messageID, role: 'assistant', reasoning: { text: '', isActive: false }, content: delta, toolCalls: [] }, ...filtered]
                }
                return prev.map((m) => {
                  if (m.id !== messageID) return m
                  if (isReasoningDelta) {
                    if (isAssistant(m)) {
                      return { ...m, reasoning: { ...m.reasoning, text: m.reasoning.text + delta } }
                    }
                    return { ...m, role: 'assistant', reasoning: { text: delta, isActive: true }, content: m.role === 'user' ? m.text : '', toolCalls: [] }
                  }
                  if (isAssistant(m)) {
                    return { ...m, content: m.content + delta }
                  }
                  return { ...m, role: 'assistant', content: (m.role === 'user' ? m.text : '') + delta, reasoning: { text: '', isActive: false }, toolCalls: [] }
                })
              })
              continue
            }

            if (evType === 'permission.asked') {
              const req = props as PermissionRequest
              setPendingPermissions((prev) => {
                const exists = prev.find((p) => p.id === req.id)
                if (exists) return prev
                return [...prev, req]
              })
              continue
            }

            if (evType === 'permission.replied') {
              const { permissionID, requestID } = props
              const id = requestID || permissionID
              if (id) {
                setPendingPermissions((prev) => prev.filter((p) => p.id !== id))
              }
              continue
            }

            if (evType === 'question.asked') {
              const req = props as QuestionRequest
              setPendingQuestions((prev) => {
                const exists = prev.find((q) => q.id === req.id)
                if (exists) return prev
                return [...prev, req]
              })
              continue
            }

            if (evType === 'question.replied' || evType === 'question.rejected') {
              const { requestID, questionID } = props
              const id = requestID || questionID
              if (id) {
                setPendingQuestions((prev) => prev.filter((q) => q.id !== id))
              }
              continue
            }
        }
      }

      let retryScheduled = false

      const startCountdown = (secs: number) => {
        setRetryCountdown(secs)
        setError(`连接断开，${secs}s 后重试…`)
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = setInterval(() => {
          setRetryCountdown((prev) => {
            const next = prev - 1
            if (next <= 0) {
              if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
              setError('正在重连…')
              return 0
            }
            setError(`连接断开，${next}s 后重试…`)
            return next
          })
        }, 1000)
      }

      xhr.onerror = () => {
        if (aborted || retryScheduled) return
        retryScheduled = true
        const count = retryCountRef.current++
        const delay = Math.min(1000 * Math.pow(2, count), 30000)
        const secs = Math.ceil(delay / 1000)
        if (count >= 1) startCountdown(secs)
        retryRef.current = setTimeout(() => { retryScheduled = false; connect() }, delay)
      }

      xhr.onloadend = () => {
        if (aborted || retryScheduled) return
        retryScheduled = true
        const count = retryCountRef.current++
        const delay = Math.min(1000 * Math.pow(2, count), 30000)
        const secs = Math.ceil(delay / 1000)
        if (count >= 1) startCountdown(secs)
        retryRef.current = setTimeout(() => { retryScheduled = false; connect() }, delay)
      }

      xhr.send()
    }

    connect()

    const onAppState = (next: AppStateStatus) => {
      if (aborted) return
      if (next === 'active') {
        const wasBackground = appStateRef.current.match(/inactive|background/)
        if (wasBackground) {
          retryCountRef.current = 0
          if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
          if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
          setError('已重连')
          setTimeout(() => setError(null), 1500)
          reloadSession()
          connect()
        }
      }
      appStateRef.current = next
    }
    const sub = AppState.addEventListener('change', onAppState)

    return () => {
      aborted = true
      sub.remove()
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
    const isNearBottom = offset < 80
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
    const sessionData = await client.revertMessage(sessionId, revertMessageId, cwd)
    if (sessionData?.revert) {
      setSending(false)
      setError(null)
      setRevertMessageId(sessionData.revert.messageID)
      setRevertDiff(sessionData.revert.diff || null)

      const raw = await client.getMessages(sessionId)
      const m: Message[] = parseMessages(raw)

      const revertIdx = m.findIndex((msg) => msg.id === revertMessageId)
      if (revertIdx >= 0) {
        const before = m.slice(0, revertIdx)
        const diffFiles = parseRevertDiff(sessionData.revert.diff || '')
        const revertedText = findRevertedMessageText(m, revertIdx)
        setMessages(buildRevertedList(before, countRevertedMessages(m, revertIdx), diffFiles))
        if (revertedText) setInput(revertedText)
      } else {
        setMessages(m.reverse())
      }
    }
  }, [client, sessionId, cwd])

  const handleUnrevert = useCallback(async () => {
    const ok = await client.unrevertMessage(sessionId, cwd)
    if (ok) {
      setRevertMessageId(null)
      setRevertDiff(null)
      setError(null)

      const raw = await client.getMessages(sessionId)
      const m: Message[] = parseMessages(raw)
      setMessages(m.reverse())
    }
  }, [client, sessionId, cwd])

  const handleAbort = useCallback(async () => {
    setSending(false)
    await client.abortSession(sessionId, cwd)
  }, [client, sessionId, cwd])

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !sessionId) return
    setSending(true)
    setError(null)
    const text = input.trim()
    setInput('')

    const userMsgId = `u-${Date.now()}`
    const loadingMsgId = `loading-${Date.now()}`
    setMessages((prev) => [
      { id: loadingMsgId, role: 'assistant', reasoning: { text: '', isActive: false }, content: '', toolCalls: [] },
      { id: userMsgId, role: 'user', text },
      ...prev,
    ])

    try {
      const body: any = { parts: [{ type: 'text' as any, text }] }
      if (currentModel) {
        body.model = { providerID: currentModel.providerID, modelID: currentModel.modelID }
      }
      if (currentAgent) {
        console.log('Using agent:', currentAgent.name)
        body.agent = currentAgent.name
      }
      await client.client.session.promptAsync({
        path: { id: sessionId },
        body,
      })
    } catch (e: any) {
      setSending(false)
      setError(`发送失败: ${e.message}`)
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('loading-')))
    }
  }, [input, sending, sessionId, client, currentModel, currentAgent])

  const isAtBottom = useRef(true)

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
              <TouchableOpacity onPress={() => setSessionBanner(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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

        {messages.length === 0 ? (
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
                />
              </Animated.View>
            )}
          </>
        ) : (
          <ContentContainer style={contentStyle}>
            <FlatList
              ref={flatListRef}
              inverted
              data={messages}
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
                return <MessageBubble message={item} theme={theme} onToolPress={handleToolPress} onRevert={item.role === 'user' ? () => handleRevert(item.id) : undefined} workspaceDir={cwd} />
              }}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (sending && !showScrollButton) scrollToBottom(true)
              }}
              onScrollBeginDrag={() => { isAtBottom.current = false }}
              onMomentumScrollEnd={(e) => {
                isAtBottom.current = e.nativeEvent.contentOffset.y < 40
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
              />
            )}
          </ContentContainer>
        )}

        {pendingPermissions.length > 0 && (
        <PermissionPrompt
          request={pendingPermissions[0]}
          theme={theme}
          onReply={handlePermissionReply}
        />
      )}

        {pendingQuestions.length > 0 && (
        <QuestionPrompt
          request={pendingQuestions[0]}
          theme={theme}
          onReply={handleQuestionReply}
          onReject={handleQuestionReject}
        />
      )}

      {showScrollButton && messages.length > 0 && (
          <Animated.View style={[styles.scrollButton, { opacity: scrollButtonOpacity, backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity onPress={() => scrollToBottom()} style={styles.scrollButtonTouch} activeOpacity={0.7}>
              <Feather name="chevron-down" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
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
                      navigation.push('Session', { projectId: item.id, sessionId: item.id, agent: item.agent, parentId: sessionId })
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
})
