import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LayCodeClient } from '../api/client'
import { getTheme, ThemeMode } from '../theme'
import { Message } from '../types'
import MessageBubble from '../components/MessageBubble'

interface Props {
  route: any
  themeMode: ThemeMode
  client: LayCodeClient
}

export default function SessionScreen({ route, themeMode, client }: Props) {
  const { projectId, sessionId } = route.params || {}
  const theme = getTheme(themeMode)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    if (sessionId) {
      client
        .getMessages(sessionId)
        .then((raw: any) => {
          const mapped: Message[] = (raw || []).map((item: any) => ({
            id: item.info?.id || Math.random().toString(),
            role: item.info?.role || 'assistant',
            content: item.parts?.find((p: any) => p.type === 'text')?.text || '',
            parts: item.parts || [],
            createdAt: item.info?.createdAt || '',
          }))
          setMessages(mapped)
        })
        .catch(console.error)
    }
  }, [projectId, sessionId])

  const handleSend = async () => {
    if (!input.trim() || sending || !projectId || !sessionId) return
    setSending(true)
    const text = input.trim()
    setInput('')

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const reply = await client.sendMessage(sessionId, text)
      const textPart = reply.parts?.find((p: any) => p.type === 'text') as { text?: string; content?: string } | undefined
      const replyMsg: Message = {
        id: reply.info?.id || Date.now().toString(),
        role: 'assistant',
        content: textPart?.text || textPart?.content || '',
        parts: reply.parts || [],
        createdAt: reply.info?.createdAt || '',
      }
      setMessages((prev) => [...prev, replyMsg])
    } catch (err) {
      console.error(err)
    }
    setSending(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
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
            style={[styles.input, { backgroundColor: theme.surfaceSecondary, color: theme.text }]}
            value={input}
            onChangeText={setInput}
            placeholder="输入消息..."
            placeholderTextColor={theme.textSecondary}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.accent }, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            disabled={sending}
          >
            <Text style={styles.sendText}>发送</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 8 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 56, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})
