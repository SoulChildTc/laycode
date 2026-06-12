import React, { useState, useRef, useEffect } from 'react'
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { Theme } from '../theme'

interface Props {
  text: string
  theme: Theme
  isThinking: boolean
}

export default function ThinkingAccordion({ text, theme, isThinking }: Props) {
  const [expanded, setExpanded] = useState(false)
  const expandAnim = useRef(new Animated.Value(0)).current

  const toggle = () => setExpanded(!expanded)

  useEffect(() => {
    Animated.spring(expandAnim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      damping: 18,
      stiffness: 150,
    }).start()
  }, [expanded, expandAnim])

  const arrowRotation = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  })

  if (!text && !isThinking) return null

  const summary = text ? text.split('\n').slice(0, 2).join(' · ').slice(0, 80) : ''

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={[styles.container, { borderLeftColor: theme.thinkingBorder }]}
      >
        <View style={styles.header}>
          <Text style={styles.icon}>💭</Text>
          <Text style={[styles.title, { color: theme.thinkingTitle }]}>
            {isThinking ? '深度思考中...' : '已深度思考'}
          </Text>
          <Animated.Text style={[styles.arrow, { color: theme.thinkingArrow, transform: [{ rotate: arrowRotation }] }]}>
            ▼
          </Animated.Text>
        </View>

        {!expanded && !!summary && (
          <Text style={[styles.summary, { color: theme.thinkingText }]} numberOfLines={1}>
            {summary}
          </Text>
        )}

        {expanded && (
          <View style={styles.body}>
            {text ? (
              <Text style={[styles.content, { color: theme.thinkingText }]}>{text}</Text>
            ) : (
              <Text style={[styles.content, { color: theme.thinkingText, opacity: 0.5 }]}>正在思考...</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginVertical: 4 },
  container: {
    borderLeftWidth: 3,
    borderLeftColor: '#6c7dff',
    paddingLeft: 14,
    paddingVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: { fontSize: 13, marginRight: 6 },
  title: { fontSize: 12, fontWeight: '600', flex: 1 },
  arrow: { fontSize: 10 },
  summary: { fontSize: 12, lineHeight: 18, marginTop: 2, opacity: 0.7 },
  body: { marginTop: 6 },
  content: {
    fontSize: 13,
    lineHeight: 21,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
})