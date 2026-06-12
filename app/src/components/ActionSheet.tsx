import React, { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Modal, Animated, StyleSheet } from 'react-native'
import type { Theme } from '../theme'

interface ActionSheetOption {
  text: string
  style?: 'destructive' | 'cancel'
  onPress?: () => void
}

interface Props {
  visible: boolean
  options: ActionSheetOption[]
  theme: Theme
  onClose: () => void
}

export default function ActionSheet({ visible, options, theme, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 1, damping: 20, stiffness: 200, useNativeDriver: true }),
      ]).start()
    } else {
      slideAnim.setValue(0)
      fadeAnim.setValue(0)
    }
  }, [visible])

  const handlePress = (option: ActionSheetOption) => {
    onClose()
    if (option.onPress) {
      setTimeout(() => option.onPress!(), 200)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: fadeAnim }]} />
        </TouchableOpacity>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface },
            { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }] },
          ]}
        >
          {options.map((option, i) => {
            if (option.style === 'cancel') {
              return (
                <View key={i} style={[styles.cancelWrapper, { backgroundColor: theme.background }]}>
                  <TouchableOpacity style={styles.cancelTouch} onPress={onClose} activeOpacity={0.7}>
                    <Text style={[styles.cancelText, { color: theme.text }]}>{option.text}</Text>
                  </TouchableOpacity>
                </View>
              )
            }
            return (
              <TouchableOpacity
                key={i}
                style={[styles.option, i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
                onPress={() => handlePress(option)}
                activeOpacity={0.6}
              >
                <Text style={[styles.optionText, { color: option.style === 'destructive' ? theme.error : theme.text }]}>
                  {option.text}
                </Text>
              </TouchableOpacity>
            )
          })}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 8,
    paddingBottom: 34,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  option: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  cancelWrapper: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cancelTouch: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
