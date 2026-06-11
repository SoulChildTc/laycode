import { useState, useRef, useEffect } from 'react'
import { Animated, Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface UseKeyboardHeightResult {
  keyboardOffset: Animated.Value
  isKeyboardOpen: boolean
}

export function useKeyboardHeight(): UseKeyboardHeightResult {
  const translateY = useRef(new Animated.Value(0)).current
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const onFrameChange = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
        if (e.endCoordinates.height > 0) setIsKeyboardOpen(true)
        Animated.timing(translateY, {
          toValue: -e.endCoordinates.height,
          duration: e.duration ?? 250,
          useNativeDriver: true,
        }).start()
      })

      const onHide = Keyboard.addListener('keyboardWillHide', (e) => {
        setIsKeyboardOpen(false)
        Animated.timing(translateY, {
          toValue: 0,
          duration: e.duration ?? 250,
          useNativeDriver: true,
        }).start()
      })

      return () => {
        onFrameChange.remove()
        onHide.remove()
      }
    }

    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setIsKeyboardOpen(true)
      translateY.setValue(-e.endCoordinates.height - insets.bottom)
    })

    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardOpen(false)
      translateY.setValue(0)
    })

    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [insets.bottom])

  return { keyboardOffset: translateY, isKeyboardOpen }
}
