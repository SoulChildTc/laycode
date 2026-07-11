import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { getTheme, ThemeMode, Theme } from '../theme'

export type ToastKind = 'error' | 'success' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void
  error: (message: string) => void
  success: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

// module 级单例：供非组件上下文（如 client.ts 的全局 401 回调）触发提示。
// Provider 挂载时注册，卸载时清空。
let externalShow: ((message: string, kind?: ToastKind) => void) | null = null
export function toast(message: string, kind: ToastKind = 'info') {
  externalShow?.(message, kind)
}

const KIND_ICON: Record<ToastKind, keyof typeof Feather.glyphMap> = {
  error: 'alert-circle',
  success: 'check-circle',
  info: 'info',
}

function kindColor(theme: Theme, kind: ToastKind): string {
  if (kind === 'error') return theme.error
  if (kind === 'success') return theme.success
  return theme.accent
}

export function ToastProvider({ themeMode, children }: { themeMode: ThemeMode; children: React.ReactNode }) {
  const theme = getTheme(themeMode)
  const insets = useSafeAreaInsets()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  // 同文案短时间内去重，避免一次批量请求触发同一个 401 时刷屏。
  const lastRef = useRef<{ message: string; at: number }>({ message: '', at: 0 })

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    if (!message) return
    const now = Date.now()
    if (lastRef.current.message === message && now - lastRef.current.at < 2000) return
    lastRef.current = { message, at: now }
    const id = ++idRef.current
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }])
    setTimeout(() => dismiss(id), kind === 'error' ? 4500 : 3000)
  }, [dismiss])

  const value: ToastContextValue = {
    show,
    error: useCallback((m: string) => show(m, 'error'), [show]),
    success: useCallback((m: string) => show(m, 'success'), [show]),
  }

  // 注册/注销 module 单例。
  React.useEffect(() => {
    externalShow = show
    return () => { if (externalShow === show) externalShow = null }
  }, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} theme={theme} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  )
}

function ToastCard({ item, theme, onDismiss }: { item: ToastItem; theme: Theme; onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start()
  }, [anim])
  const color = kindColor(theme, item.kind)
  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
        <Feather name={KIND_ICON[item.kind]} size={16} color={color} />
      </View>
      <Text style={[styles.message, { color: theme.text }]} numberOfLines={3}>{item.message}</Text>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={16} color={theme.textTertiary} />
      </TouchableOpacity>
    </Animated.View>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 1000 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1, fontSize: 14, lineHeight: 19 },
})
