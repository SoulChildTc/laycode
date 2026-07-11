import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { Theme } from '../theme'
import { parsePairingUri, PairingInfo } from '../utils/pairing'

interface Props {
  visible: boolean
  theme: Theme
  onClose: () => void
  onScanned: (info: PairingInfo) => void
}

export default function QRScanner({ visible, theme, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [handled, setHandled] = useState(false)

  // 每次打开重置扫描锁
  React.useEffect(() => {
    if (visible) setHandled(false)
  }, [visible])

  const handleScan = (result: { data: string }) => {
    if (handled) return
    const info = parsePairingUri(result.data)
    if (info) {
      setHandled(true)
      onScanned(info)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>扫描配对二维码</Text>
          <View style={{ width: 26 }} />
        </View>

        {!permission ? (
          <View style={styles.center}><ActivityIndicator color="#fff" /></View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Feather name="camera-off" size={40} color="#fff" />
            <Text style={styles.permText}>需要相机权限才能扫码</Text>
            <TouchableOpacity style={[styles.permBtn, { backgroundColor: theme.accent }]} onPress={requestPermission}>
              <Text style={styles.permBtnText}>授权相机</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>将二维码对准框内</Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, paddingTop: 50 },
  closeBtn: { padding: 4 },
  title: { color: '#fff', fontSize: 17, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  permText: { color: '#fff', fontSize: 15 },
  permBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10, marginTop: 8 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderWidth: 2, borderColor: '#fff', borderRadius: 16, backgroundColor: 'transparent' },
  hint: { color: '#fff', fontSize: 14, marginTop: 20 },
})
