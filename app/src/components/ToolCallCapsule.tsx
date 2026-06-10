import React, { useEffect, useRef, useState } from 'react'
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

type ToolStatus = 'running' | 'completed' | 'error'

const STATUS_CONFIG: Record<ToolStatus, { icon: string; label: string }> = {
  running: { icon: '🔍', label: '正在' },
  completed: { icon: '✅', label: '已完成' },
  error: { icon: '❌', label: '失败' },
}

interface Props {
  name: string
  status: ToolStatus
  input?: any
  output?: any
  resultCount?: number
  compact?: boolean
  theme: Theme
}

function getColors(status: ToolStatus, theme: Theme) {
  switch (status) {
    case 'running':
      return { bg: theme.toolRunningBg, border: theme.toolRunningBorder, text: theme.toolRunningText }
    case 'completed':
      return { bg: theme.toolSuccessBg, border: theme.toolSuccessBorder, text: theme.toolSuccessText }
    case 'error':
      return { bg: theme.toolErrorBg, border: theme.toolErrorBorder, text: theme.toolErrorText }
  }
}

function formatValue(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

export default function ToolCallCapsule({ name, status, input, output, resultCount, compact, theme }: Props) {
  const [expanded, setExpanded] = useState(false)
  const spinAnim = useRef(new Animated.Value(0)).current
  const expandAnim = useRef(new Animated.Value(0)).current
  const colors = getColors(status, theme)
  const config = STATUS_CONFIG[status]

  const showExpand = !compact && (input || output)
  const hasDetail = showExpand && (input || output)

  useEffect(() => {
    if (status !== 'running') {
      spinAnim.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [status, spinAnim])

  useEffect(() => {
    Animated.spring(expandAnim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
      damping: 18,
      stiffness: 150,
    }).start()
  }, [expanded, expandAnim])

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const arrowRotation = expandAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })
  const detailMaxHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] })

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={() => hasDetail && setExpanded(!expanded)}
        activeOpacity={hasDetail ? 0.7 : 1}
        style={[styles.capsule, { backgroundColor: colors.bg, borderColor: colors.border }]}
      >
        <Text style={styles.icon}>{config.icon}</Text>
        <Text style={[styles.name, { color: colors.text }]}>{config.label}{name}</Text>

        {status === 'running' && (
          <Animated.View style={[styles.spinner, { borderColor: colors.text, borderTopColor: 'transparent', transform: [{ rotate: spin }] }]} />
        )}
        {status === 'completed' && resultCount != null && !expanded && (
          <Text style={[styles.meta, { color: codeAlpha(colors.text, 0.6) }]}>{resultCount} 条结果</Text>
        )}
        {status === 'error' && (
          <Text style={[styles.meta, { color: codeAlpha(colors.text, 0.6) }]}>重试</Text>
        )}

        {showExpand && (
          <Animated.Text style={[styles.arrow, { color: colors.text, transform: [{ rotate: arrowRotation }] }]}>
            ▼
          </Animated.Text>
        )}
      </TouchableOpacity>

      {expanded && hasDetail && (
        <View style={[styles.detailContainer, { backgroundColor: theme.codeBg, borderColor: theme.border }]}>
          {input && (
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>输入</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.detailCode, { color: theme.textSecondary }]}>
                  {formatValue(input)}
                </Text>
              </ScrollView>
            </View>
          )}
          {output && (
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, { color: theme.textTertiary }]}>输出</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.detailCode, { color: theme.textSecondary }]}>
                  {formatValue(output)}
                </Text>
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

function codeAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const styles = StyleSheet.create({
  wrapper: { marginVertical: 3 },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  icon: { fontSize: 13 },
  name: { fontSize: 13, flex: 1 },
  spinner: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  meta: { fontSize: 11 },
  arrow: { fontSize: 10, marginLeft: 2 },
  detailContainer: {
    marginTop: 2,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  detailSection: { gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: '600' },
  detailCode: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
})