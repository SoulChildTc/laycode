import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { LayCodeClient } from '../api/client'
import { getTheme, ThemeMode } from '../theme'
import MessageBubble from '../components/MessageBubble'
import type { Message, AssistantMsg, UserMsg, ToolCall } from '../types'
import { mapToolStatus, isAssistant } from '../types'
import { stripThinking } from '../utils/segmentParts'

interface Props {
  route: any
  navigation: any
  themeMode: ThemeMode
  client: LayCodeClient
}

const GREETINGS = ['有什么我可以帮你的？', '开始一段新的对话吧']

export default function SessionScreen({ route, navigation, themeMode, client }: Props) {
  const { sessionId, title: routeTitle } = route.params || {}
  const theme = getTheme(themeMode)
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionTitle, setSessionTitle] = useState(routeTitle || sessionId?.slice(0, 8) || '')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<TextInput>(null)
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current

  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]

  useEffect(() => {
    if (!sessionId) return
    client.getSession(sessionId).then((data: any) => {
      if (data?.info?.title) setSessionTitle(data.info.title)
    }).catch(() => {})
  }, [sessionId])

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
      setMessages(m)
    }).catch((e) => setError(`加载消息失败: ${e.message}`))
  }, [sessionId])

  // ==================== SSE STATE MACHINE ====================
  useEffect(() => {
    if (!sessionId) return

    let aborted = false
    let lastProcessed = 0
    let buf = ''
    // Track which partID is a reasoning part
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

          if (evType === 'session.idle') { setSending(false); continue }
          if (evType === 'session.status' && props.status?.type === 'idle') { setSending(false); continue }

          // ========== message.part.updated ==========
          if (evType === 'message.part.updated') {
            const part = props.part
            if (!part || !part.id) continue
            const msgID: string = part.messageID
            const partType: string = part.type
            const partText: string = part.text || ''

            // --- Phase 1: reasoning starts (empty text) ---
            if (partType === 'reasoning' && partText === '') {
              reasoningPartIds.add(part.id)
              setMessages((prev) => {
                const exists = prev.find((m) => m.id === msgID)
                if (exists && isAssistant(exists)) {
                  return prev.map((m) => m.id === msgID ? { ...m, reasoning: { text: '', isActive: true } } : m)
                }
                return [...prev, { id: msgID, role: 'assistant', reasoning: { text: '', isActive: true }, content: '', toolCalls: [] }]
              })
              continue
            }

            // --- Phase 3a: reasoning ends (non-empty text) ---
            if (partType === 'reasoning' && partText !== '') {
              setMessages((prev) => prev.map((m) =>
                m.id === msgID && isAssistant(m)
                  ? { ...m, reasoning: { text: partText, isActive: false } }
                  : m
              ))
              continue
            }

            // --- text part starts → reasoning is over ---
            if (partType === 'text') {
              setMessages((prev) => {
                const exists = prev.find((m) => m.id === msgID)
                if (exists && isAssistant(exists)) {
                  return prev.map((m) => m.id === msgID && isAssistant(m)
                    ? { ...m, reasoning: { ...m.reasoning, isActive: false } }
                    : m
                  )
                }
                // User message echo from server
                const pendingIdx = prev.findIndex((m) => m.id.startsWith('u-') && m.role === 'user')
                if (pendingIdx >= 0) {
                  const copy = [...prev]
                  copy[pendingIdx] = { id: msgID, role: 'user', text: partText }
                  return copy
                }
                return [...prev, { id: msgID, role: 'user', text: partText }]
              })
              continue
            }

            // --- tool part ---
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

          // ========== message.part.delta ==========
          if (evType === 'message.part.delta') {
            const { messageID, partID, delta } = props
            if (!delta || !partID || !messageID) continue

            const isReasoningDelta = reasoningPartIds.has(partID)

            setMessages((prev) => {
              const exists = prev.find((m) => m.id === messageID && isAssistant(m))
              if (!exists) {
                if (isReasoningDelta) {
                  return [...prev, { id: messageID, role: 'assistant', reasoning: { text: delta, isActive: true }, content: '', toolCalls: [] }]
                }
                return [...prev, { id: messageID, role: 'assistant', reasoning: { text: '', isActive: false }, content: delta, toolCalls: [] }]
              }
              return prev.map((m) => {
                if (m.id !== messageID || !isAssistant(m)) return m
                if (isReasoningDelta) {
                  return { ...m, reasoning: { ...m.reasoning, text: m.reasoning.text + delta } }
                }
                return { ...m, content: m.content + delta }
              })
            })
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

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated })
  }, [])

  const handleScroll = useCallback((e: any) => {
    const offset = e.nativeEvent.contentOffset.y
    const contentHeight = e.nativeEvent.contentSize.height
    const viewHeight = e.nativeEvent.layoutMeasurement.height
    const isNearBottom = contentHeight - offset - viewHeight < 80
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
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', text }])

    try {
      await client.client.session.promptAsync({
        path: { id: sessionId },
        body: { parts: [{ type: 'text' as any, text }] },
      })
    } catch (e: any) {
      setSending(false)
      setError(`发送失败: ${e.message}`)
    }
  }, [input, sending, sessionId, client])

  const isAtBottom = useRef(true)

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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-left" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{headerTitle}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: sending ? theme.warning : theme.success }]} />
              <Text style={[styles.statusText, { color: theme.textTertiary }]}>{sending ? '响应中' : '已连接'}</Text>
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

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} theme={theme} />}
          style={styles.list}
          contentContainerStyle={messages.length === 0 ? styles.listEmptyContent : styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => { if (!showScrollButton) scrollToBottom(true) }}
          onScrollBeginDrag={() => { isAtBottom.current = false }}
          onMomentumScrollEnd={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
            isAtBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 40
          }}
          ListEmptyComponent={renderEmpty}
          keyboardShouldPersistTaps="handled"
        />

        {showScrollButton && messages.length > 0 && (
          <Animated.View style={[styles.scrollButton, { opacity: scrollButtonOpacity, backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity onPress={() => scrollToBottom()} style={styles.scrollButtonTouch} activeOpacity={0.7}>
              <Feather name="chevron-down" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.inputBar, { backgroundColor: theme.background }]}>
            <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.text }]}
                value={input}
                onChangeText={setInput}
                placeholder="给 AI 发送消息..."
                placeholderTextColor={theme.textTertiary}
                multiline
                maxLength={4000}
              />
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: input.trim() && !sending ? theme.accent : theme.surfaceSecondary }, sending && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || sending}
                activeOpacity={0.8}
              >
                {sending
                  ? <Text style={{ color: theme.textTertiary, fontSize: 18, lineHeight: 20 }}>⋯</Text>
                  : <Feather name="arrow-up" size={18} color={input.trim() ? '#fff' : theme.textTertiary} />
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 0.5 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  statusText: { fontSize: 11 },
  headerRight: { width: 36 },
  errorBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7 },
  errorText: { flex: 1, color: '#fff', fontSize: 13 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 16 },
  listEmptyContent: { flexGrow: 1 },
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
  inputBar: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: Platform.OS === 'ios' ? 22 : 12 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 16, borderWidth: 1, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, lineHeight: 22, maxHeight: 100, paddingVertical: 4 },
  sendButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sendButtonDisabled: { opacity: 0.5 },
})