import React, { useEffect, useRef, useState } from 'react'
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, Modal, SafeAreaView } from 'react-native'
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

function truncateLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { text, truncated: false }
  return { text: lines.slice(0, maxLines).join('\n') + `\n… ${lines.length - maxLines} 行已折叠`, truncated: true }
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

function FullscreenModal({ visible, content, language, title, theme, onClose, children }: {
  visible: boolean
  content?: string
  language?: string
  title: string
  theme: Theme
  onClose: () => void
  children?: React.ReactNode
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Feather name="x" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
          {children || <CodeBlockWrapper language={language || 'text'} content={content || ''} theme={theme} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

function DetailContent({ name, config, input, output, theme }: {
  name: string
  config: ReturnType<typeof getToolConfig>
  input: any
  output: any
  theme: Theme
}) {
  const [fullContent, setFullContent] = useState<string | null>(null)
  const maxLines = config.maxLines || 15

  // Diff view
  if (config.detail === 'diff') {
    if (name === 'edit') {
      const oldStr = input?.oldString || input?.old || ''
      const newStr = input?.newString || input?.new || ''
      if (!oldStr && !newStr) return null
      const diffText = getDiffText(oldStr, newStr)
      const { text, truncated } = truncateLines(diffText, maxLines)
      return (
        <View style={styles.detailSectionCompact}>
          <CodeBlockWrapper language="diff" content={text} theme={theme} noBorder />
          {truncated && (
            <TouchableOpacity onPress={() => setFullContent(diffText)} style={styles.expandBtn}>
              <Text style={[styles.expandText, { color: theme.toolSuccessText }]}>展开全文</Text>
            </TouchableOpacity>
          )}
          <FullscreenModal visible={!!fullContent} content={fullContent || ''} language="diff" title={name} theme={theme} onClose={() => setFullContent(null)} />
        </View>
      )
    }
    if (name === 'apply_patch') {
      const patchText = input?.patchText || ''
      if (!patchText) return null
      const { text, truncated } = truncateLines(patchText, maxLines)
      return (
        <View style={styles.detailSection}>
          <Text style={[styles.monoText, { color: theme.textSecondary }]}>{text}</Text>
          {truncated && (
            <TouchableOpacity onPress={() => setFullContent(patchText)} style={styles.expandBtn}>
              <Text style={[styles.expandText, { color: theme.toolSuccessText }]}>展开全文</Text>
            </TouchableOpacity>
          )}
          <FullscreenModal visible={!!fullContent} content={fullContent || ''} title={name} theme={theme} onClose={() => setFullContent(null)} />
        </View>
      )
    }
    return null
  }

  // Gather content text based on detail type
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
  }

  if (!rawContent) return null

  const { text, truncated } = truncateLines(rawContent, maxLines)

  // Use CodeBlockWrapper for file content (write), plain text for others
  if (config.detail === 'full-content' && codeLang) {
    return (
      <View style={styles.detailSectionCompact}>
        <CodeBlockWrapper language={codeLang} content={text} theme={theme} />
        {truncated && (
          <TouchableOpacity onPress={() => setFullContent(rawContent)} style={styles.expandBtn}>
            <Text style={[styles.expandText, { color: theme.toolSuccessText }]}>展开全文</Text>
          </TouchableOpacity>
        )}
        <FullscreenModal visible={!!fullContent} content={fullContent || ''} language={codeLang} title={name} theme={theme} onClose={() => setFullContent(null)} />
      </View>
    )
  }

  return (
    <View style={styles.detailSection}>
      <Text style={[styles.monoText, { color: theme.textSecondary }]}>{text}</Text>
      {truncated && (
        <TouchableOpacity onPress={() => setFullContent(rawContent)} style={styles.expandBtn}>
          <Text style={[styles.expandText, { color: theme.toolSuccessText }]}>展开全文</Text>
        </TouchableOpacity>
      )}
      <FullscreenModal visible={!!fullContent} content={fullContent || ''} title={name} theme={theme} onClose={() => setFullContent(null)} />
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
        {status === 'error' && (
          <Text style={[styles.meta, { color: codeAlpha(colors.text, 0.6) }]}>重试</Text>
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
          <DetailContent name={name} config={config} input={input} output={output} theme={theme} />
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
  detailSection: {
    padding: 10,
  },
  detailSectionCompact: {
    padding: 0,
  },
  monoText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  expandBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 6,
  },
  expandText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  modalClose: {
    padding: 4,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 40,
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
