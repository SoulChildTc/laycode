import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform, Animated, Modal, KeyboardAvoidingView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LayCodeClient } from '../api/client'
import { getTheme, ThemeMode } from '../theme'
import MessageBubble from '../components/MessageBubble'
import InputBar from '../components/InputBar'
import PermissionPrompt from '../components/PermissionPrompt'
import ModelSelectorModal from '../components/ModelSelectorModal'
import AgentSelectorModal from '../components/AgentSelectorModal'
import { useKeyboardHeight } from '../hooks/useKeyboardHeight'
import { useAgents } from '../hooks/useAgents'
import type { Message, AssistantMsg, UserMsg, ToolCall, ModelKey, Provider, Agent, PermissionRequest, PermissionReply } from '../types'
import { mapToolStatus, isAssistant } from '../types'
import { stripThinking } from '../utils/segmentParts'

const SESSION_MODEL_KEY = '@laycode/session-models'

interface Props {
  route: any
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
}

const GREETINGS = ['有什么我可以帮你的？', '开始一段新的对话吧']

export default function SessionScreen({ route, navigation, themeMode, client }: Props) {
  const { sessionId, title: routeTitle, agents: agentsJson, defaultAgent } = route.params || {}
  const agentsFromParent = useMemo<Agent[]>(() => agentsJson ? JSON.parse(agentsJson) : [], [agentsJson])
  const theme = getTheme(themeMode)
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionTitle, setSessionTitle] = useState(routeTitle || sessionId?.slice(0, 8) || '')
  const [cwd, setCwd] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [currentModel, setCurrentModel] = useState<ModelKey | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [agentSelectorVisible, setAgentSelectorVisible] = useState(false)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([])
  const flatListRef = useRef<FlatList>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<TextInput>(null)
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current
  const { keyboardOffset, isKeyboardOpen } = useKeyboardHeight()
  const { agents: availableAgents, currentAgent, setAgent: setCurrentAgent } = useAgents(agentsFromParent, sessionId, defaultAgent)

  const handlePermissionReply = useCallback(async (reply: PermissionReply, message?: string) => {
    const req = pendingPermissions[0]
    if (!req) return
    const ok = await client.replyPermission(req.id, reply, message, cwd || undefined)
    if (!ok) setError('Failed to respond to permission request')
  }, [pendingPermissions, client, cwd])

  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

  useEffect(() => {
    if (!sessionId) return
    client.getSession(sessionId).then((data: any) => {
      if (data?.info?.title) setSessionTitle(data.info.title)
      if (data?.directory) setCwd(data.directory)
      else if (data?.info?.directory) setCwd(data.info.directory)
    }).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !cwd) return
    client.listPendingPermissions(cwd).then((reqs) => {
      if (reqs.length === 0) return
      setPendingPermissions((prev) => {
        const existing = new Set(prev.map((p) => p.id))
        return [...prev, ...reqs.filter((r) => !existing.has(r.id))]
      })
    }).catch(() => {})
  }, [sessionId, cwd])

  useEffect(() => {
    if (!sessionId) return
    client.getMessages(sessionId).then((raw: any[]) => {
      const m: Message[] = (raw || []).map((item: any): Message => {
        const role = item.info?.role || 'assistant'
        const id = item.info?.id || item.id
        if (role === 'user') {
          return { id, role: 'user', text: item.parts?.[0]?.text || '' }
        }
        const reasoningPart = (item.parts || []).find((p: any) => p.type === 'reasoning')
        const textParts = (item.parts || []).filter((p: any) => p.type === 'text')
        const toolParts = (item.parts || []).filter((p: any) => p.type === 'tool')
        return {
          id,
          role: 'assistant',
          reasoning: { text: reasoningPart?.text || '', isActive: false },
          content: textParts.map((p: any) => stripThinking(p.text || '')).join(''),
          toolCalls: toolParts.map((p: any): ToolCall => ({
            id: p.id,
            name: p.tool || p.name || '',
            status: mapToolStatus(p.state?.status || 'completed'),
            input: p.state?.input,
            output: p.state?.output,
          })),
        }
      })
      setMessages(m.reverse())

      const lastAssistant = (raw || []).findLast((item: any) => item.info?.role === 'assistant')
      if (lastAssistant?.info?.providerID && lastAssistant?.info?.modelID) {
        setCurrentModel({
          providerID: lastAssistant.info.providerID,
          modelID: lastAssistant.info.modelID,
        })
      }
    }).catch((e) => setError(`加载消息失败: ${e.message}`))

    client.getProviders().then((res) => {
      setProviders(res.providers)
    }).catch(() => {})

    AsyncStorage.getItem(SESSION_MODEL_KEY).then((raw) => {
      if (!raw) return
      try {
        const saved: Record<string, ModelKey> = JSON.parse(raw)
        if (saved[sessionId]) {
          setCurrentModel(saved[sessionId])
        }
      } catch {}
    }).catch(() => {})
  }, [sessionId])

  const saveSessionModel = useCallback((key: ModelKey) => {
    AsyncStorage.getItem(SESSION_MODEL_KEY).then((raw) => {
      const all: Record<string, ModelKey> = raw ? JSON.parse(raw) : {}
      all[sessionId] = key
      AsyncStorage.setItem(SESSION_MODEL_KEY, JSON.stringify(all)).catch(() => {})
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

          if (evType === 'session.idle') { setSending(false); setMessages((prev) => prev.filter((m) => !m.id.startsWith('loading-'))); continue }
          if (evType === 'session.status' && props.status?.type === 'idle') { setSending(false); setMessages((prev) => prev.filter((m) => !m.id.startsWith('loading-'))); continue }

          if (evType === 'message.part.updated') {
            const part = props.part
            if (!part || !part.id) continue
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
                    : { ...m, role: 'assistant', reasoning: { text: partText, isActive: false }, content: m.text || '', toolCalls: [] }
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
                }
                const existing = m.toolCalls.find((t) => t.id === part.id)
                if (existing) {
                  return { ...m, toolCalls: m.toolCalls.map((t) => t.id === part.id ? tc : t) }
                }
                return { ...m, toolCalls: [...m.toolCalls, tc] }
              }))
              continue
            }

            continue
          }

            if (evType === 'message.part.delta') {
              const { messageID, partID, delta } = props
              if (!delta || !partID || !messageID) continue

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
                    return { ...m, role: 'assistant', reasoning: { text: delta, isActive: true }, content: m.text || '', toolCalls: [] }
                  }
                  if (isAssistant(m)) {
                    return { ...m, content: m.content + delta }
                  }
                  return { ...m, role: 'assistant', content: (m.text || '') + delta, reasoning: { text: '', isActive: false }, toolCalls: [] }
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
        }
      }

      xhr.onerror = () => {
        if (aborted) return
        setError('SSE 连接错误')
        retryRef.current = setTimeout(connect, 5000)
      }

      xhr.onloadend = () => {
        if (aborted) return
        retryRef.current = setTimeout(connect, 5000)
      }

      xhr.send()
    }

    connect()

    return () => {
      aborted = true
      if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [sessionId])

  const getModelDisplayName = useCallback((key: ModelKey | null): string => {
    if (!key) return ''
    for (const p of providers) {
      if (p.id === key.providerID) {
        const m = p.models[key.modelID]
        return m?.name || key.modelID
      }
    }
    return key.modelID
  }, [providers])

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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
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

        {error && (
          <View style={[styles.errorBar, { backgroundColor: theme.error }]}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        )}

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
            <Animated.View style={{ transform: [{ translateY: keyboardOffset }] }}>
              <InputBar
                input={input}
                onChangeText={setInput}
                onSend={handleSend}
                sending={sending}
                disabled={pendingPermissions.length > 0}
                theme={theme}
                inputRef={inputRef}
                isKeyboardOpen={isKeyboardOpen}
                currentModel={currentModel}
                onPressModelSelector={() => setModelSelectorVisible(true)}
                currentAgent={currentAgent}
                onPressAgentSelector={() => setAgentSelectorVisible(true)}
              />
            </Animated.View>
          </>
        ) : (
          <ContentContainer style={contentStyle}>
            <FlatList
              ref={flatListRef}
              inverted
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MessageBubble message={item} theme={theme} />}
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

            <InputBar
              input={input}
              onChangeText={setInput}
              onSend={handleSend}
              sending={sending}
              disabled={pendingPermissions.length > 0}
              theme={theme}
              inputRef={inputRef}
              isKeyboardOpen={isKeyboardOpen}
              currentModel={currentModel}
              onPressModelSelector={() => setModelSelectorVisible(true)}
              currentAgent={currentAgent}
              onPressAgentSelector={() => setAgentSelectorVisible(true)}
            />
          </ContentContainer>
        )}

        {pendingPermissions.length > 0 && (
        <PermissionPrompt
          request={pendingPermissions[0]}
          theme={theme}
          onReply={handlePermissionReply}
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
})
