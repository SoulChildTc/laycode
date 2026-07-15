import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { getToolConfig, getLanguageFromPath } from './toolConfig'
import { getDiffText } from './DiffView'
import CodeBlockWrapper from './CodeBlockWrapper'
import type { Theme } from '../theme'

type ToolStatus = 'running' | 'completed' | 'error'

interface Props {
  name: string
  status: ToolStatus
  input?: any
  output?: any
  resultCount?: number
  compact?: boolean
  theme: Theme
  onPress?: () => void
  workspaceDir?: string
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

function codeAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function formatOutput(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

function shortenPath(path: string, cwd?: string): string {
  if (!cwd || !path.startsWith(cwd)) return path
  const rest = path.slice(cwd.length)
  return rest.startsWith('/') ? `.${rest}` : `.${rest}`
}

function ToolSpinner({ color }: { color: string }) {
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [spinAnim])

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })

  return (
    <Animated.View
      style={[styles.spinner, {
        borderColor: color,
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
        transform: [{ rotate: spin }],
      }]}
    />
  )
}

function DetailContent({ name, config, input, output, theme, isError }: {
  name: string
  config: ReturnType<typeof getToolConfig>
  input: any
  output: any
  theme: Theme
  isError?: boolean
}) {
  const maxLines = config.maxLines || 15

  // error 状态：统一显示错误原因文本，不走工具专属详情（很多工具 detail:'none' 不渲染 output）。
  if (isError) {
    const text = typeof output === 'string' ? output : formatOutput(output)
    if (!text) return null
    return (
      <View style={styles.detailSectionCompact}>
        <Text style={[styles.errorDetailText, { color: theme.toolErrorText }]}>{text}</Text>
      </View>
    )
  }

  if (config.detail === 'diff') {
    if (name === 'edit') {
      const oldStr = input?.oldString || input?.old || ''
      const newStr = input?.newString || input?.new || ''
      if (!oldStr && !newStr) return null
      const diffText = getDiffText(oldStr, newStr)
      const truncated = diffText.split('\n').length > maxLines
      const preview = truncated ? diffText.split('\n').slice(0, maxLines).join('\n') : undefined
      return (
        <View style={styles.detailSectionCompact}>
          <CodeBlockWrapper
            language="diff"
            content={preview || diffText}
            fullContent={truncated ? diffText : undefined}
            theme={theme}
            noBorder
          />
        </View>
      )
    }
    if (name === 'apply_patch') {
      const patchText = input?.patchText || ''
      if (!patchText) return null
      const truncated = patchText.split('\n').length > maxLines
      const preview = truncated ? patchText.split('\n').slice(0, maxLines).join('\n') : undefined
      return (
        <View style={styles.detailSectionCompact}>
          <CodeBlockWrapper
            language="diff"
            content={preview || patchText}
            fullContent={truncated ? patchText : undefined}
            theme={theme}
            noBorder
          />
        </View>
      )
    }
    return null
  }

  let rawContent = ''
  let codeLang: string | undefined

  if (config.detail === 'full-content') {
    rawContent = input?.content || ''
    codeLang = getLanguageFromPath(input?.filePath || input?.path)
  } else if (config.detail === 'results') {
    rawContent = output ? formatOutput(output) : ''
    if (name === 'list' || name === 'glob') codeLang = 'text'
  } else if (config.detail === 'input-output') {
    const parts: string[] = []
    if (input?.command) parts.push(`$ ${input.command}`)
    if (output) {
      const outStr = formatOutput(output)
      if (outStr) parts.push(outStr)
    }
    rawContent = parts.join('\n')
    codeLang = 'text'
  }

  if (!rawContent) return null

  const truncated = rawContent.split('\n').length > maxLines
  const preview = truncated ? rawContent.split('\n').slice(0, maxLines).join('\n') : undefined
  const lang = codeLang || 'text'

  return (
    <View style={styles.detailSectionCompact}>
      <CodeBlockWrapper
        language={lang}
        content={preview || rawContent}
        fullContent={truncated ? rawContent : undefined}
        theme={theme}
        noBorder
      />
    </View>
  )
}

export default function ToolCallCapsule({ name, status, input, output, resultCount, compact, theme, onPress, workspaceDir }: Props) {
  const [expanded, setExpanded] = useState(false)
  const colors = getColors(status, theme)
  const config = getToolConfig(name)
  const isTask = name === 'task'
  const taskDescription = isTask ? input?.description || input?.prompt || '' : ''

  const canExpand = !isTask && !compact && (() => {
    // error 状态：只要有 output（错误原因）就允许展开，让用户能点开查看失败原因。
    if (status === 'error') return !!output
    if (config.detail === 'none') return false
    if (config.detail === 'input-output') return !!(input || output)
    if (config.detail === 'results') return !!output
    if (config.detail === 'full-content') return !!input?.content
    if (config.detail === 'diff') return !!(input?.oldString || input?.newString || input?.patchText)
    return true
  })()

  const arrowAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(arrowAnim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 150,
    }).start()
  }, [expanded, arrowAnim])

  const arrowRotation = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })

  const toggle = () => {
    if (canExpand) setExpanded(!expanded)
  }

  if (isTask) {
    return (
      <View style={styles.wrapper}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={onPress ? 0.6 : 1}
          style={[styles.taskCapsule, { backgroundColor: theme.toolSuccessBg, borderColor: theme.toolSuccessBorder }]}
        >
          {status === 'running' ? (
            <ToolSpinner color={colors.text} />
          ) : (
            <Text style={styles.taskIcon}>🤖</Text>
          )}
          <View style={styles.taskContent}>
            <Text style={[styles.taskLabel, { color: theme.toolSuccessText }]}>
              调用子 Agent · @{input?.subagent_type || 'subagent'}
            </Text>
            {taskDescription ? (
              <Text style={[styles.taskDescription, { color: theme.textTertiary }]} numberOfLines={2}>
                {taskDescription}
              </Text>
            ) : null}
          </View>
          {onPress ? <Feather name="chevron-right" size={14} color={theme.textTertiary} /> : null}
        </TouchableOpacity>
      </View>
    )
  }

  const title = config.getTitle(input)
  const displayTitle = shortenPath(title, workspaceDir)
  const subtitle = config.getSubtitle?.(input)

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={canExpand ? 0.7 : 1}
        style={[styles.capsule, { backgroundColor: colors.bg, borderColor: colors.border }]}
      >
        <Text style={styles.icon}>{config.icon}</Text>
        <View style={styles.titleArea}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          {displayTitle ? (
            <Text style={[styles.subtitle, { color: codeAlpha(colors.text, 0.6) }]} numberOfLines={2}>
              {displayTitle}{subtitle ? `  · ${subtitle}` : ''}
            </Text>
          ) : null}
        </View>

        {status === 'running' && <ToolSpinner color={colors.text} />}
        {status === 'completed' && resultCount != null && !expanded && (
          <Text style={[styles.meta, { color: codeAlpha(colors.text, 0.6) }]}>{resultCount} 条结果</Text>
        )}
        {status === 'error' && !expanded && (
          <Text style={[styles.meta, { color: colors.text }]}>失败</Text>
        )}

        {canExpand && (
          <Animated.Text style={[styles.arrow, { color: colors.text, transform: [{ rotate: arrowRotation }] }]}>
            ▼
          </Animated.Text>
        )}
      </TouchableOpacity>

      {expanded && canExpand && (
        <View style={[
          styles.detailContainer,
          config.detail === 'full-content' && { borderWidth: 0 },
          { backgroundColor: theme.codeBg, borderColor: theme.border }
        ]}>
          <DetailContent name={name} config={config} input={input} output={output} theme={theme} isError={status === 'error'} />
        </View>
      )}
    </View>
  )
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
  titleArea: { flex: 1, gap: 1 },
  name: { fontSize: 13 },
  subtitle: { fontSize: 11 },
  spinner: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  meta: { fontSize: 11 },
  arrow: { fontSize: 10, marginLeft: 2 },
  detailContainer: {
    marginTop: 2,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailSectionCompact: {
    padding: 0,
  },
  errorDetailText: {
    fontSize: 13,
    lineHeight: 19,
    padding: 10,
  },
  taskCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  taskIcon: { fontSize: 16 },
  taskContent: { flex: 1, gap: 2 },
  taskLabel: { fontSize: 13, fontWeight: '600' },
  taskDescription: { fontSize: 12, lineHeight: 16 },
})
