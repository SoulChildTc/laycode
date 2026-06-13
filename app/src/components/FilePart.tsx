import React, { useState } from 'react'
import { View, Text, Image, TouchableOpacity, Modal, StyleSheet, Dimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { Theme } from '../theme'

interface Props {
  file: { uri?: string; url?: string; mime: string; filename?: string }
  theme: Theme
}

export default function FilePart({ file, theme }: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const uri = file.uri || file.url || ''
  const isImage = file.mime?.startsWith('image/')

  if (isImage) {
    return (
      <>
        <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.8} style={styles.imageWrap}>
          <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
        </TouchableOpacity>
        <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
          <TouchableOpacity style={styles.fullscreenOverlay} activeOpacity={1} onPress={() => setFullscreen(false)}>
            <Image source={{ uri }} style={styles.fullscreenImage} resizeMode="contain" />
          </TouchableOpacity>
        </Modal>
      </>
    )
  }

  return (
    <View style={[styles.fileWrap, { backgroundColor: theme.surfaceSecondary || theme.surface, borderColor: theme.border }]}>
      <Feather name="file" size={16} color={theme.textSecondary} />
      <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>{file.filename || 'file'}</Text>
      {file.mime && <Text style={[styles.fileMime, { color: theme.textTertiary }]}>{file.mime}</Text>}
    </View>
  )
}

const { width: screenWidth } = Dimensions.get('window')

const styles = StyleSheet.create({
  imageWrap: { marginVertical: 4, borderRadius: 12, overflow: 'hidden', width: screenWidth * 0.24, height: screenWidth * 0.24 },
  thumb: { width: '100%', height: '100%' },
  fullscreenOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  fullscreenImage: { width: screenWidth - 32, height: '80%' },
  fileWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, marginVertical: 4, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  fileName: { fontSize: 13, flex: 1 },
  fileMime: { fontSize: 11 },
})
