import React, { useRef, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface ToolEntry {
  id: string
  icon: keyof typeof Feather.glyphMap
  label: string
}

const TOOLS: ToolEntry[] = [
  { id: 'git', icon: 'git-commit', label: 'Git' },
]

interface Props {
  visible: boolean
  theme: Theme
  onToolPress: (tool: string) => void
}

export default function FabMenu({ visible, theme, onToolPress }: Props) {
  const itemAnims = useRef(TOOLS.map(() => new Animated.Value(0))).current
  const bgOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.timing(bgOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
      itemAnims.forEach((anim, i) => {
        anim.setValue(0)
        Animated.spring(anim, {
          toValue: 1,
          damping: 10,
          stiffness: 200,
          delay: i * 60,
          useNativeDriver: true,
        }).start()
      })
    } else {
      Animated.timing(bgOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start()
      itemAnims.forEach((anim) => anim.setValue(0))
    }
  }, [visible])

  if (!visible) return null

  return (
    <View style={styles.container}>
      {TOOLS.map((tool, i) => (
        <Animated.View
          key={tool.id}
          style={{
            opacity: itemAnims[i],
            transform: [
              { scale: itemAnims[i] },
              { translateY: itemAnims[i].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            ],
          }}
        >
          <TouchableOpacity
            style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => onToolPress(tool.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.accent + '20' }]}>
              <Feather name={tool.icon} size={18} color={theme.accent} />
            </View>
            <Text style={[styles.label, { color: theme.text }]}>{tool.label}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 60,
    right: 0,
    alignItems: 'flex-end',
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
})