import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LayCodeClient } from '../api/client'
import { getTheme, ThemeMode } from '../theme'
import MessageBubble from '../components/MessageBubble'

type Part = { id: string; type: string; text?: string; [k: string]: any }
type Msg = { id: string; role: string; parts: Part[] }

interface Props {
  route: any
  themeMode: ThemeMode
  client: LayCodeClient
}

export default function SessionScreen({ route, themeMode, client }: Props) {
  const { sessionId } = route.params || {}
  const theme = getTheme(themeMode)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const flatListRef = useRef<FlatList>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing messages on mount
  useEffect(() => {
    if (!sessionId) return
    client.getMessages(sessionId).then((raw: any[]) => {
      const m: Msg[] = (raw || []).map((item: any) => ({
        id: item.info?.id || item.id,
        role: item.info?.role || 'assistant',
        parts: item.parts || [],
      }))
      setMessages(m)
    }).catch((e) => setError(`加载消息失败: ${e.message}`))
  }, [sessionId])

  // Persistent SSE via XMLHttpRequest (native streaming on RN)
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
          const type: string = payload?.type || ''
          const props = payload?.properties || {}

          if (type === 'session.idle') { setSending(false); continue }
          if (type === 'session.status' && props.status?.type === 'idle') { setSending(false); continue }

          if (type === 'message.part.delta') {
            const { messageID, partID, delta, field } = props
            if (!delta || !partID) continue
            setMessages((prev) => {
              const copy = prev.slice()
              let msg = copy.find((m) => m.id === messageID)
              if (!msg) { msg = { id: messageID, role: 'assistant', parts: [] }; copy.push(msg) }
              const targetField = field || 'text'
              msg.parts = msg.parts.map((p) =>
                p.id === partID ? { ...p, [targetField]: (p[targetField] || '') + delta } : p
              )
              if (!msg.parts.find((p) => p.id === partID)) {
                msg.parts.push({ id: partID, type: 'text', [targetField]: delta })
              }
              return copy
            })
            continue
          }

          if (type === 'message.part.updated') {
            const part: Part | undefined = props.part
            if (!part || !part.id) continue
            setMessages((prev) => {
              const copy = prev.slice()
              let msg = copy.find((m) => m.id === part.messageID)
              if (!msg) { msg = { id: part.messageID!, role: 'assistant', parts: [] }; copy.push(msg) }
              const idx = msg.parts.findIndex((p) => p.id === part.id)
              if (idx >= 0) msg.parts[idx] = part
              else msg.parts.push(part)
              return copy
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
        // Connection closed (expected for SSE on error/timeout)
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

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !sessionId) return
    setSending(true)
    setError(null)
    const text = input.trim()
    setInput('')

    const userMsgId = `u-${Date.now()}`
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', parts: [{ id: '', type: 'text', text }] }])

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {error && (
        <View style={[styles.errorBar, { backgroundColor: '#ff4444' }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}><Text style={styles.errorDismiss}>✕</Text></TouchableOpacity>
        </View>
      )}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} theme={theme} />}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surfaceSecondary || theme.surface, color: theme.text }]}
            value={input} onChangeText={setInput}
            placeholder="输入消息..." placeholderTextColor={theme.textSecondary} multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.accent }, sending && styles.sendButtonDisabled]}
            onPress={handleSend} disabled={sending}
          >
            <Text style={styles.sendText}>{sending ? '...' : '发送'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  errorText: { flex: 1, color: '#fff', fontSize: 13 },
  errorDismiss: { color: '#fff', fontSize: 16, paddingLeft: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 8 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, gap: 8 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 56, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})