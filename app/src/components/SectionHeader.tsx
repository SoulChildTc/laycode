import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Props {
  title: string
  count: number
  theme: Theme
  defaultExpanded?: boolean
  actionLabel?: string
  onAction?: () => void
  actionLabel2?: string
  onAction2?: () => void
  children: React.ReactNode
}

export default function SectionHeader({ title, count, theme, defaultExpanded = true, actionLabel, onAction, actionLabel2, onAction2, children }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded(!expanded)
  }

  return (
    <View>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.6}>
        <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={14} color={theme.textSecondary} />
        <Text style={[styles.title, { color: theme.textSecondary }]}>{title}</Text>
        <View style={[styles.badge, { backgroundColor: theme.border }]}>
          <Text style={[styles.badgeText, { color: theme.textSecondary }]}>{count}</Text>
        </View>
        <View style={styles.actions}>
          {actionLabel2 && onAction2 && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onAction2() }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[styles.actionBtn, { backgroundColor: '#e74c3c20' }]}>
              <Text style={[styles.actionText, { color: '#e74c3c' }]}>{actionLabel2}</Text>
            </TouchableOpacity>
          )}
          {actionLabel && onAction && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onAction() }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={[styles.actionBtn, { backgroundColor: theme.accent + '20' }]}>
              <Text style={[styles.actionText, { color: theme.accent }]}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
      {expanded && children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
})