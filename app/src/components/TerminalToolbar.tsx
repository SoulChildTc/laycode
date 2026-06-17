import React, { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { Theme } from '../theme'

interface Props {
  theme: Theme
  onKeystroke: (data: string) => void
  visible: boolean
}

const CTRL_MAP: Record<string, string> = {
  C: '\x03', D: '\x04', Z: '\x1a', L: '\x0c', U: '\x15',
  A: '\x01', E: '\x05', W: '\x17', R: '\x12',
}

const LETTERS = ['C', 'D', 'Z', 'L', 'U', 'A', 'E', 'W', 'R']

export default function TerminalToolbar({ theme, onKeystroke, visible }: Props) {
  const [ctrlOn, setCtrlOn] = useState(false)
  const [altOn, setAltOn] = useState(false)

  const handleCtrl = useCallback(() => {
    setAltOn(false)
    setCtrlOn((p) => !p)
  }, [])

  const handleAlt = useCallback(() => {
    setCtrlOn(false)
    setAltOn((p) => !p)
  }, [])

  const handleKey = useCallback((key: string) => {
    onKeystroke(key)
    setCtrlOn(false)
    setAltOn(false)
  }, [onKeystroke])

  const handleCtrlLetter = useCallback((letter: string) => {
    onKeystroke(CTRL_MAP[letter])
    setCtrlOn(false)
  }, [onKeystroke])

  const handleAltKey = useCallback((key: string) => {
    if (key === '←') onKeystroke('\x1b[D')
    else if (key === '→') onKeystroke('\x1b[C')
    else onKeystroke('\x1b' + key.toLowerCase())
    setAltOn(false)
  }, [onKeystroke])

  if (!visible) return null

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, ctrlOn && { backgroundColor: theme.accent + '30' }]} onPress={handleCtrl}>
          <Text style={[styles.btnText, ctrlOn && { color: theme.accent }]}>Ctrl</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, altOn && { backgroundColor: theme.accent + '30' }]} onPress={handleAlt}>
          <Text style={[styles.btnText, altOn && { color: theme.accent }]}>Alt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => handleKey('\x1b')}>
          <Text style={styles.btnText}>Esc</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => handleKey('\t')}>
          <Text style={styles.btnText}>Tab</Text>
        </TouchableOpacity>
      </View>
      {ctrlOn && (
        <View style={styles.subRow}>
          {LETTERS.map((l) => (
            <TouchableOpacity key={l} style={[styles.smallBtn, { borderColor: theme.accent + '40' }]} onPress={() => handleCtrlLetter(l)}>
              <Text style={[styles.smallBtnText, { color: theme.accent }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {altOn && (
        <View style={styles.subRow}>
          {['B', 'F', 'D', '←', '→'].map((k) => (
            <TouchableOpacity key={k} style={[styles.smallBtn, { borderColor: theme.accent + '40' }]} onPress={() => handleAltKey(k)}>
              <Text style={[styles.smallBtnText, { color: theme.accent }]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[A')}>
          <Text style={styles.btnText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[B')}>
          <Text style={styles.btnText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[D')}>
          <Text style={styles.btnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.arrowBtn} onPress={() => handleKey('\x1b[C')}>
          <Text style={styles.btnText}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b0b0cc',
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 36,
    alignItems: 'center',
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  arrowBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
})
