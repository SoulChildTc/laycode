import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'
import type { RevertBannerMsg } from '../types'

interface Props {
  banner: RevertBannerMsg
  theme: Theme
  onUnrevert: () => void
}

export default function RevertBanner({ banner, theme, onUnrevert }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: theme.warning + '15', borderColor: theme.warning + '40' }]}>
      <View style={styles.header}>
        <Feather name="corner-up-left" size={14} color={theme.warning} />
        <Text style={[styles.title, { color: theme.warning }]}>
          已撤回 {banner.revertedCount} 条消息
        </Text>
      </View>

      {banner.diffFiles.length > 0 && (
        <View style={styles.files}>
          {banner.diffFiles.map((f, i) => (
            <View key={i} style={styles.fileRow}>
              <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>{f.filename}</Text>
              <View style={styles.fileStats}>
                {f.additions > 0 && (
              <Text style={[styles.statAdd, { color: theme.success }]}>+{f.additions}</Text>
                )}
              {f.deletions > 0 && (
                <Text style={[styles.statDel, { color: theme.error }]}>-{f.deletions}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.revertBtn, { backgroundColor: theme.warning + '25' }]}
        onPress={onUnrevert}
        activeOpacity={0.7}
      >
        <Feather name="rotate-ccw" size={12} color={theme.warning} />
        <Text style={[styles.revertBtnText, { color: theme.warning }]}>恢复</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
  },
  files: {
    marginTop: 8,
    gap: 4,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileName: {
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  fileStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statAdd: {
    fontSize: 12,
    fontWeight: '600',
  },
  statDel: {
    fontSize: 12,
    fontWeight: '600',
  },
  revertBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  revertBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
})
