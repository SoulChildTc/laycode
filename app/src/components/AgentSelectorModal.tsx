import React from 'react'
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { Agent } from '../types'

interface Props {
  visible: boolean
  onClose: () => void
  agents: Agent[]
  currentAgent: Agent | undefined
  onSelect: (agent: Agent) => void
  theme: Theme
}

export default function AgentSelectorModal({ visible, onClose, agents, currentAgent, onSelect, theme }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>选择模式</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {agents.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>暂无可用模式</Text>
          ) : (
            <FlatList
              data={agents}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => {
                const isSelected = currentAgent?.name === item.name
                const dotColor = item.color || '#999'
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && { backgroundColor: theme.surfaceSecondary }]}
                    onPress={() => { onSelect(item); onClose() }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.dot, { backgroundColor: dotColor }]} />
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionName, { color: theme.text, fontWeight: isSelected ? '600' : '400' }]}>
                        {item.name.charAt(0).toUpperCase() + item.name.slice(1)}
                      </Text>
                      {item.description ? (
                        <Text style={[styles.optionDesc, { color: theme.textTertiary }]} numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected && <Feather name="check" size={16} color={theme.accent} />}
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  dialog: { width: '80%', maxHeight: '60%', borderRadius: 14, borderWidth: 0.5, overflow: 'hidden', paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: '600' },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  optionContent: { flex: 1 },
  optionName: { fontSize: 15 },
  optionDesc: { fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
})