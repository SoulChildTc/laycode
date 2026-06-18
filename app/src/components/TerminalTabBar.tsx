import React, { useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

export interface TabItem {
  ptyID: string
  title: string
  isActive: boolean
}

interface Props {
  tabs: TabItem[]
  theme: Theme
  onBack: () => void
  onSelectTab: (ptyID: string) => void
  onCloseTab: (ptyID: string) => void
  onNewTab: () => void
}

export default function TerminalTabBar({ tabs, theme, onBack, onSelectTab, onCloseTab, onNewTab }: Props) {
  var scrollRef = useRef<ScrollView>(null)

  useEffect(function() {
    var activeIndex = tabs.findIndex(function(t) { return t.isActive })
    if (activeIndex >= 0) {
      scrollRef.current?.scrollTo({ x: activeIndex * 120, animated: true })
    }
  }, [tabs])

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Feather name="chevron-left" size={22} color={theme.text} />
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map(function(tab) {
          return (
            <TouchableOpacity
              key={tab.ptyID}
              style={[
                styles.tab,
                tab.isActive && { borderBottomColor: theme.accent, borderBottomWidth: 2 },
              ]}
              onPress={function() { onSelectTab(tab.ptyID) }}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.tabText, { color: tab.isActive ? theme.text : theme.textTertiary }]}
                numberOfLines={1}
              >
                {tab.title}
              </Text>
              <TouchableOpacity
                style={styles.tabClose}
                onPress={function() { onCloseTab(tab.ptyID) }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={12} color={theme.textTertiary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.surface }]} onPress={onNewTab}>
        <Feather name="plus" size={18} color={theme.accent} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingRight: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 2,
    maxWidth: 140,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 90,
  },
  tabClose: {
    padding: 4,
    marginLeft: 4,
  },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 0.5,
    borderLeftColor: 'rgba(128,128,128,0.2)',
  },
})
