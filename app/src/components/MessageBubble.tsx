import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, Animated } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import ThinkingAccordion from './ThinkingAccordion'
import ContentRenderer from './ContentRenderer'
import ToolCallCapsule from './ToolCallCapsule'
import ActionSheet from './ActionSheet'
import type { Theme } from '../theme'
import type { Message } from '../types'

function LoadingDots({ theme }: { theme: Theme }) {
  const opacity = useRef([0.3, 0.3, 0.3].map(() => new Animated.Value(0.3))).current

  useEffect(() => {
    const anims = opacity.map((o) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(o, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      )
    )
    const t1 = setTimeout(() => anims[0].start(), 0)
    const t2 = setTimeout(() => anims[1].start(), 200)
    const t3 = setTimeout(() => anims[2].start(), 400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 4 }}>
      {opacity.map((o, i) => (
        <Animated.Text key={i} style={[styles.dot, { opacity: o, color: theme.text }]}>.</Animated.Text>
      ))}
    </View>
  )
}

interface Props {
  message: Message
  theme: Theme
  onToolPress?: (toolCall: any) => void
  onRevert?: () => void
  workspaceDir?: string
}

export default function MessageBubble({ message, theme, onToolPress, onRevert, workspaceDir }: Props) {
  const [copied, setCopied] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)

  const copyText = () => {
    const text = message.role === 'user' ? message.text : message.content
    Clipboard.setStringAsync(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  const handleLongPress = () => {
    setMenuVisible(true)
  }

  const menuOptions: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [
    { text: '复制', onPress: copyText },
  ]
  if (message.role === 'user' && onRevert) {
    menuOptions.push({ text: '撤回并恢复文件改动', style: 'destructive', onPress: onRevert })
  }
  menuOptions.push({ text: '取消', style: 'cancel' })

  const renderMenu = () => (
    <ActionSheet
      visible={menuVisible}
      options={menuOptions}
      theme={theme}
      onClose={() => setMenuVisible(false)}
    />
  )

  if (message.role === 'user') {
    return (
      <>
        <TouchableOpacity onLongPress={handleLongPress} activeOpacity={1} style={styles.userContainer}>
          <View style={[styles.userBubble, { backgroundColor: theme.userBubble }]}>
            <Text style={[styles.userText, { color: theme.userBubbleText }]}>{message.text}</Text>
          </View>
          {copied && <Text style={[styles.copiedTip, { color: theme.textTertiary }]}>已复制 ✓</Text>}
        </TouchableOpacity>
        {renderMenu()}
      </>
    )
  }

  const { reasoning, content, toolCalls } = message
  const isLoading = !content && !reasoning.text && !reasoning.isActive && toolCalls.length === 0

  return (
    <View style={styles.assistantContainer}>
      <TouchableOpacity onLongPress={handleLongPress} activeOpacity={1} style={styles.assistantTouch}>
        {isLoading ? (
          <View style={[styles.loadingBubble, { backgroundColor: theme.aiBubble, borderColor: theme.aiBubbleBorder }]}>
            <LoadingDots theme={theme} />
          </View>
        ) : (
          <View style={[styles.assistantBubble, { backgroundColor: theme.aiBubble, borderColor: theme.aiBubbleBorder }]}>
            <>
              {(reasoning.isActive || !!reasoning.text) && (
                <ThinkingAccordion text={reasoning.text} theme={theme} isThinking={reasoning.isActive} />
              )}
              {toolCalls.map((tc) => (
                <ToolCallCapsule
                  key={tc.id}
                  name={tc.name}
                  status={tc.status}
                  input={tc.input}
                  output={tc.output}
                  theme={theme}
                  onPress={onToolPress ? () => onToolPress(tc) : undefined}
                  workspaceDir={workspaceDir}
                />
              ))}
            {!!content && <ContentRenderer content={content} theme={theme} />}
            {copied && <Text style={[styles.copiedTip, { color: theme.textTertiary }]}>已复制 ✓</Text>}
          </>
          </View>
        )}
      </TouchableOpacity>
      {renderMenu()}
    </View>
  )
}

const styles = StyleSheet.create({
  userContainer: { marginVertical: 6, flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: { maxWidth: '80%', borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 10 },
  userText: { fontSize: 15, lineHeight: 22 },
  assistantContainer: { marginVertical: 6, flexDirection: 'row', justifyContent: 'flex-start' },
  assistantTouch: { flex: 1 },
  assistantBubble: { flex: 1, borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  loadingBubble: { alignSelf: 'flex-start', borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  dot: { fontSize: 20, lineHeight: 22 },
  copiedTip: { fontSize: 11, fontWeight: '500', marginTop: 2 },
})
