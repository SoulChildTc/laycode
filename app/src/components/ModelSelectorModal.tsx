import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Animated,
  Dimensions, TextInput, FlatList, Platform, ScrollView,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode, Theme } from '../theme'
import type { Provider, ModelInfo, ModelKey } from '../types'
import { LayCodeClient } from '../api/client'

const FAVORITES_KEY = '@laycode/favorite-models'
const RECENTS_KEY = '@laycode/recent-models'
const MAX_RECENTS = 20

interface Props {
  visible: boolean
  onClose: () => void
  onSelect: (key: ModelKey) => void
  currentModel: ModelKey | null
  themeMode: ThemeMode
  client: LayCodeClient
}

type Tab = 'favorites' | 'recent' | 'all'

interface FlatItem {
  type: 'provider_header' | 'model'
  providerID?: string
  providerName?: string
  model?: ModelInfo
}

export default function ModelSelectorModal({ visible, onClose, onSelect, currentModel, themeMode, client }: Props) {
  const theme = getTheme(themeMode)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [favorites, setFavorites] = useState<ModelKey[]>([])
  const [recents, setRecents] = useState<ModelKey[]>([])
  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 1, damping: 20, stiffness: 200, useNativeDriver: true }),
      ]).start()
      loadData()
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  const loadData = async () => {
    client.getProviders().then((res) => setProviders(res.providers)).catch(() => {})
    try {
      const favRaw = await AsyncStorage.getItem(FAVORITES_KEY)
      if (favRaw) setFavorites(JSON.parse(favRaw))
      const recRaw = await AsyncStorage.getItem(RECENTS_KEY)
      if (recRaw) setRecents(JSON.parse(recRaw))
    } catch {}
  }

  const isActive = (model: ModelInfo) =>
    currentModel?.providerID === model.providerID && currentModel?.modelID === model.id

  const isFavorite = useCallback((providerID: string, modelID: string) =>
    favorites.some((f) => f.providerID === providerID && f.modelID === modelID),
    [favorites]
  )

  const getModelName = useCallback((providerID: string, modelID: string): string => {
    for (const p of providers) {
      if (p.id === providerID) {
        const m = p.models[modelID]
        return m?.name || modelID
      }
    }
    return modelID
  }, [providers])

  const resolveModel = useCallback((providerID: string, modelID: string): ModelInfo | undefined => {
    const p = providers.find((x) => x.id === providerID)
    return p?.models[modelID]
  }, [providers])

  const toggleFavorite = useCallback(async (providerID: string, modelID: string) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.providerID === providerID && f.modelID === modelID)
      const next = exists
        ? prev.filter((f) => !(f.providerID === providerID && f.modelID === modelID))
        : [...prev, { providerID, modelID }]
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const addRecent = useCallback(async (providerID: string, modelID: string) => {
    setRecents((prev) => {
      const filtered = prev.filter((f) => !(f.providerID === providerID && f.modelID === modelID))
      const next = [{ providerID, modelID }, ...filtered].slice(0, MAX_RECENTS)
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const handleSelect = useCallback((providerID: string, modelID: string) => {
    addRecent(providerID, modelID)
    onSelect({ providerID, modelID })
    onClose()
    setSearch('')
  }, [addRecent, onSelect, onClose])

  const sortedProviders = useMemo(() => {
    const connected = providers.filter((p) => p.source !== 'env' || Object.keys(p.models).length > 0)
    return [...connected].sort((a, b) => a.name.localeCompare(b.name))
  }, [providers])

  const searchResults = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    const results: { provider: Provider; model: ModelInfo }[] = []
    for (const p of sortedProviders) {
      for (const m of Object.values(p.models)) {
        if (m.status === 'deprecated') continue
        if (m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)) {
          results.push({ provider: p, model: m })
        }
      }
    }
    return results
  }, [sortedProviders, search])

  const favoriteModels = useMemo(() => {
    return favorites
      .map((f) => ({ key: f, model: resolveModel(f.providerID, f.modelID) }))
      .filter((x) => x.model)
  }, [favorites, resolveModel])

  const recentModels = useMemo(() => {
    return recents
      .map((r) => ({ key: r, model: resolveModel(r.providerID, r.modelID) }))
      .filter((x) => x.model)
  }, [recents, resolveModel])

  const allItems = useMemo(() => {
    const items: FlatItem[] = []
    for (const p of sortedProviders) {
      const models = Object.values(p.models).filter((m) => m.status !== 'deprecated')
      if (models.length === 0) continue
      items.push({ type: 'provider_header', providerID: p.id, providerName: p.name })
      for (const m of models) {
        items.push({ type: 'model', model: m })
      }
    }
    return items
  }, [sortedProviders])

  const handleLongPress = useCallback((providerID: string, modelID: string) => {
    toggleFavorite(providerID, modelID)
  }, [toggleFavorite])

  const renderModelItem = useCallback((model: ModelInfo, showProvider = false) => {
    const active = isActive(model)
    const fav = isFavorite(model.providerID, model.id)
    return (
      <TouchableOpacity
        key={`${model.providerID}/${model.id}`}
        style={[styles.modelItem, active && { backgroundColor: theme.accent + '20' }]}
        onPress={() => handleSelect(model.providerID, model.id)}
        onLongPress={() => handleLongPress(model.providerID, model.id)}
        activeOpacity={0.6}
      >
        <View style={styles.modelItemLeft}>
          <Text style={[styles.modelName, { color: theme.text }, active && { color: theme.accent }]} numberOfLines={1}>
            {model.name}
          </Text>
          {showProvider && (
            <Text style={[styles.modelProvider, { color: theme.textTertiary }]} numberOfLines={1}>
              {model.providerID}
            </Text>
          )}
        </View>
        <View style={styles.modelItemRight}>
          {fav && <Feather name="star" size={14} color={theme.warning} style={{ marginRight: 8 }} />}
          {active && <Feather name="check" size={16} color={theme.accent} />}
        </View>
      </TouchableOpacity>
    )
  }, [isActive, isFavorite, handleSelect, handleLongPress, theme])

  const renderEmpty = (msg: string) => (
    <View style={styles.emptyContainer}>
      <Feather name="inbox" size={32} color={theme.textTertiary} />
      <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{msg}</Text>
    </View>
  )

  if (!visible) return null

  const screenHeight = Dimensions.get('window').height
  const modalHeight = screenHeight * 0.75

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>
        <Animated.View
          style={[
            styles.modal,
            { height: modalHeight, backgroundColor: theme.background, borderColor: theme.border, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [modalHeight, 0] }) }] },
          ]}
        >
          <View style={[styles.handleBar, { backgroundColor: theme.textTertiary }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>选择模型</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Feather name="search" size={14} color={theme.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder="搜索模型..."
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Feather name="x" size={14} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {search.trim() ? (
            <FlatList
              data={searchResults || []}
              keyExtractor={(item) => `${item.provider.id}/${item.model.id}`}
              renderItem={({ item }) => renderModelItem(item.model, true)}
              style={styles.list}
              ListEmptyComponent={renderEmpty('没有找到匹配的模型')}
            />
          ) : (
            <>
              <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
                {([
                  { key: 'favorites' as Tab, label: '⭐ 收藏', count: favoriteModels.length },
                  { key: 'recent' as Tab, label: '🕐 最近', count: recentModels.length },
                  { key: 'all' as Tab, label: '📋 全部' },
                ]).map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tab, tab === t.key && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
                    onPress={() => setTab(t.key)}
                  >
                    <Text style={[styles.tabText, { color: tab === t.key ? theme.accent : theme.textSecondary }]}>
                      {t.label}{t.count !== undefined ? ` ${t.count}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {tab === 'favorites' && (
                <FlatList
                  data={favoriteModels}
                  keyExtractor={(item) => `${item.key.providerID}/${item.key.modelID}`}
                  renderItem={({ item }) => renderModelItem(item.model!, true)}
                  style={styles.list}
                  ListEmptyComponent={renderEmpty('还没有收藏的模型')}
                />
              )}
              {tab === 'recent' && (
                <FlatList
                  data={recentModels}
                  keyExtractor={(item) => `${item.key.providerID}/${item.key.modelID}`}
                  renderItem={({ item }) => renderModelItem(item.model!, true)}
                  style={styles.list}
                  ListEmptyComponent={renderEmpty('还没有使用过的模型')}
                />
              )}
              {tab === 'all' && (
                <FlatList
                  data={allItems}
                  keyExtractor={(item, idx) => item.type === 'provider_header' ? `h-${item.providerID}` : `m-${item.model!.providerID}/${item.model!.id}`}
                  renderItem={({ item }) => {
                    if (item.type === 'provider_header') {
                      return (
                        <View style={styles.providerHeader}>
                          <Text style={[styles.providerName, { color: theme.textSecondary }]}>
                            {item.providerName}
                          </Text>
                        </View>
                      )
                    }
                    return renderModelItem(item.model!)
                  }}
                  style={styles.list}
                  ListEmptyComponent={renderEmpty('没有可用的模型')}
                />
              )}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
    paddingVertical: 0,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  providerHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  providerName: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  modelItemLeft: {
    flex: 1,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '500',
  },
  modelProvider: {
    fontSize: 11,
    marginTop: 1,
  },
  modelItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 8,
  },
})
