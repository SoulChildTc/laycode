import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTheme, ThemeMode } from '../theme'
import { LayCodeClient, setConnStateHandler, ConnState } from '../api/client'
import type { ServerEntry, PermissionRequest, QuestionRequest, PermissionReply } from '../types'
import type { GlobalSession } from '@opencode-ai/sdk/v2'
import { storageKey } from '../utils/storage'
import PermissionPrompt from '../components/PermissionPrompt'
import QuestionPrompt from '../components/QuestionPrompt'
import { useToast } from '../contexts/ToastContext'

interface Workspace { path: string; name: string; alias?: string; addedAt: number }

interface Props {
  navigation: any
  client: LayCodeClient
  themeMode: ThemeMode
  config: ServerEntry
}

// 首页最多展示的「最近」会话数（需处理/正在跑不受此限）。
const RECENT_LIMIT = 10

type Kind = 'attention' | 'running' | 'recent'

interface Item {
  sessionId: string
  directory: string
  projectName: string
  title: string
  kind: Kind
  updated: number
  additions: number
  deletions: number
  // attention 专属：绑定的原始 permission / question
  permission?: PermissionRequest
  question?: QuestionRequest
  // 最近/正在跑：最后一条消息正文（异步补）；lastFromUser 表示回退到了用户消息
  lastText?: string
  lastFromUser?: boolean
}

// —— 权限类型 → 标题/详情（对齐 PermissionPrompt 的 getTitle/getBody 逻辑）——
function permTitle(p: PermissionRequest): string {
  const m = p.metadata || {}
  switch (p.permission) {
    case 'edit': return '要改文件'
    case 'read': return '要读文件'
    case 'bash': return '要跑一条命令'
    case 'webfetch': return '要访问网页'
    case 'websearch': return '要联网搜索'
    case 'external_directory': return '要访问项目外的目录'
    case 'list': return '要列目录'
    default: return `要用 ${p.permission}`
  }
}
// 「总是允许」实际放行的范围（always 里的通配模式，官方语义：点 always 后写进白名单的模式）。
// 仅当它和本次详情（具体文件/命令）不一致时才有提示价值——否则显示范围就是废话。
function permScope(p: PermissionRequest, detailText: string): string {
  const scope = (p.always && p.always.length > 0) ? p.always.join(', ') : ''
  if (!scope || scope === detailText) return ''
  return scope
}
function permDetail(p: PermissionRequest): { text: string; canOpen: boolean } {
  const m: any = p.metadata || {}
  const fallback = (p.patterns && p.patterns.length > 0) ? p.patterns.join(', ') : ''
  switch (p.permission) {
    case 'bash': return { text: m.command || fallback, canOpen: false }
    case 'read': return { text: m.path || fallback, canOpen: false }
    case 'webfetch': return { text: m.url || fallback, canOpen: false }
    case 'websearch': return { text: m.query || fallback, canOpen: false }
    case 'list': return { text: m.directory || m.path || fallback, canOpen: false }
    // external_directory 的真实 metadata 是 { filepath, parentDir }：显示本次要访问的具体文件。
    case 'external_directory': return { text: m.filepath || m.parentDir || fallback, canOpen: false }
    // edit 的详情是 diff，塞不进一行 → 显示文件名，点开看完整
    case 'edit': return { text: m.path || fallback, canOpen: true }
    default: return { text: fallback, canOpen: false }
  }
}

export default function FeedScreen({ navigation, client, themeMode, config }: Props) {
  const theme = getTheme(themeMode)
  const toast = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connState, setConnState] = useState<ConnState>('online')
  const [activePerm, setActivePerm] = useState<PermissionRequest | null>(null)
  const [activeQuestion, setActiveQuestion] = useState<QuestionRequest | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectMsg, setRejectMsg] = useState('')
  const wsKey = storageKey(config.id, 'workspaces')

  useEffect(() => {
    setConnStateHandler((state) => setConnState(state))
    return () => setConnStateHandler(null)
  }, [])

  const load = useCallback(async () => {
    try {
      // 项目名映射：directory → 别名/名字（来自本地存的工作区）
      const raw = await AsyncStorage.getItem(wsKey)
      const wsList: Workspace[] = raw ? JSON.parse(raw) : []
      const nameByDir: Record<string, string> = {}
      for (const w of wsList) nameByDir[w.path] = w.alias || w.name

      // ① 跨项目最近会话：一次拿全（experimental.session.list，服务端已按 updated 降序）。
      // 多取一些（不止 RECENT_LIMIT），因为「需处理/正在跑」要从中挑，挑剩的才截断成「最近」。
      const sessions = await client.listRecentSessions(40)
      const mains = sessions.filter((s: any) => !s.parentID)
      const byId = new Map<string, GlobalSession>()
      for (const s of mains) byId.set(s.id, s)

      // ② pending 权限/问题 + busy 状态：都按目录查。目录集合取自最近会话（去重）——
      // 有 pending / 正在跑的会话必然是近期活跃的，一定在这批里，故目录集合足以覆盖。
      const dirs = Array.from(new Set(mains.map((s: any) => s.directory).filter(Boolean)))
      const [permLists, questionLists, runningSets] = await Promise.all([
        Promise.all(dirs.map(d => client.listPendingPermissions(d).catch(() => [] as PermissionRequest[]))),
        Promise.all(dirs.map(d => client.listPendingQuestions(d).catch(() => [] as QuestionRequest[]))),
        Promise.all(dirs.map(d => client.getRunningSessionIds(d).catch(() => new Set<string>()))),
      ])
      const perms = permLists.flat()
      const questions = questionLists.flat()
      const running = new Set<string>()
      for (const set of runningSets) for (const id of set) running.add(id)

      const projName = (s: any) => nameByDir[s.directory] || (s.directory || '').split('/').filter(Boolean).pop() || '项目'
      const updatedOf = (s: any) => {
        const t = s.time?.updated || s.time?.created || 0
        return t < 1e12 ? t * 1000 : t
      }
      const baseItem = (s: any, kind: Kind): Item => ({
        sessionId: s.id, directory: s.directory, projectName: projName(s),
        title: s.title || s.id.slice(0, 8), kind, updated: updatedOf(s),
        additions: s.summary?.additions || 0, deletions: s.summary?.deletions || 0,
      })

      // ① 需处理：permission + question（各自独立，全量，不受 RECENT_LIMIT）
      const attentionIds = new Set<string>()
      const attention: Item[] = []
      for (const p of perms as PermissionRequest[]) {
        const s = byId.get(p.sessionID); if (!s) continue
        attentionIds.add(p.sessionID)
        attention.push({ ...baseItem(s, 'attention'), permission: p })
      }
      for (const q of questions as QuestionRequest[]) {
        if (attentionIds.has(q.sessionID)) continue
        const s = byId.get(q.sessionID); if (!s) continue
        attentionIds.add(q.sessionID)
        attention.push({ ...baseItem(s, 'attention'), question: q })
      }

      // ② 正在跑：busy 且不在需处理里
      const runningItems: Item[] = []
      for (const s of mains) {
        if (running.has(s.id) && !attentionIds.has(s.id)) runningItems.push(baseItem(s, 'running'))
      }
      const runningIds = new Set(runningItems.map(i => i.sessionId))

      // ③ 最近：其余，按更新时间倒序，取前 RECENT_LIMIT
      const recent: Item[] = mains
        .filter(s => !attentionIds.has(s.id) && !runningIds.has(s.id))
        .map(s => baseItem(s, 'recent'))
        .sort((a, b) => b.updated - a.updated)
        .slice(0, RECENT_LIMIT)

      attention.sort((a, b) => b.updated - a.updated)
      runningItems.sort((a, b) => b.updated - a.updated)

      const all = [...attention, ...runningItems, ...recent]
      setItems(all)
      setLoading(false)

      // 正在跑 + 最近：异步补最后一条消息正文（优先 AI，无则回退用户消息；失败忽略）
      for (const it of [...runningItems, ...recent]) {
        client.getLastMessageText(it.sessionId).then(({ text, fromUser }) => {
          if (!text) return
          setItems(prev => prev.map(x => x.sessionId === it.sessionId && x.kind === it.kind ? { ...x, lastText: text, lastFromUser: fromUser } : x))
        }).catch(() => {})
      }
    } catch {
      setLoading(false)
    }
  }, [client, wsKey])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false)
  }, [load])

  const removeAttention = (sessionId: string) =>
    setItems(prev => prev.filter(x => !(x.kind === 'attention' && x.sessionId === sessionId)))

  const replyPerm = async (p: PermissionRequest, directory: string, reply: PermissionReply, message?: string) => {
    removeAttention(p.sessionID)
    setRejectingId(null); setRejectMsg('')
    try { await client.replyPermission(p.id, reply, message, directory || undefined) }
    catch (e: any) { toast.error(e?.message || '响应失败') }
    load()
  }

  const openConv = (it: Item) =>
    navigation.navigate('Session', { projectId: it.sessionId, sessionId: it.sessionId, title: it.title })

  // 让正在跑的会话停下：abort 后从「正在跑」组里移除（乐观更新），随后 reload 拿真实分组（通常落到「最近」）。
  const stopRunning = async (it: Item) => {
    setItems(prev => prev.filter(x => !(x.kind === 'running' && x.sessionId === it.sessionId)))
    try { await client.abortSession(it.sessionId, it.directory || undefined) }
    catch (e: any) { toast.error(e?.message || '停止失败') }
    load()
  }

  const attentionCount = items.filter(i => i.kind === 'attention').length
  const runningCount = items.filter(i => i.kind === 'running').length

  type Row = { section: string; count: number } | Item
  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    const att = items.filter(i => i.kind === 'attention')
    const run = items.filter(i => i.kind === 'running')
    const rec = items.filter(i => i.kind === 'recent')
    if (att.length) { out.push({ section: '需要你处理', count: att.length }); out.push(...att) }
    if (run.length) { out.push({ section: '正在跑', count: run.length }); out.push(...run) }
    if (rec.length) { out.push({ section: '最近', count: rec.length }); out.push(...rec) }
    return out
  }, [items])

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => 'section' in item ? `s:${item.section}` : `${item.kind}:${item.sessionId}:${i}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListHeaderComponent={
            <View style={styles.head}>
              <Text style={[styles.date, { color: theme.textTertiary }]}>{todayLabel()}</Text>
              <Text style={[styles.title, { color: theme.text }]}>今天</Text>
              <Text style={[styles.summary, { color: theme.textSecondary }]}>
                {attentionCount > 0 && <Text style={{ color: theme.warning, fontWeight: '700' }}>{attentionCount} 个</Text>}
                {attentionCount > 0 ? ' 要你处理' : '暂无待处理'}
                {runningCount > 0 && <Text> · <Text style={{ color: theme.accent, fontWeight: '700' }}>{runningCount} 个</Text>在跑</Text>}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if ('section' in item) {
              const c = item.section === '需要你处理' ? theme.warning : item.section === '正在跑' ? theme.accent : theme.success
              return (
                <View style={styles.group}>
                  <View style={[styles.gdot, { backgroundColor: c }]} />
                  <Text style={[styles.groupText, { color: theme.text }]}>{item.section}</Text>
                  <Text style={[styles.gc, { color: c, backgroundColor: withAlpha(c, 0.14) }]}>{item.count}</Text>
                </View>
              )
            }
            return renderCard(item)
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>今天没有需要处理的事</Text>
              <Text style={[styles.emptyHint, { color: theme.textTertiary }]}>去「项目」里开始新对话</Text>
            </View>
          }
          contentContainerStyle={[{ paddingBottom: 40 }, items.length === 0 && { flexGrow: 1, justifyContent: 'center' }]}
        />
      )}

      {activePerm && (
        <PermissionPrompt
          request={activePerm}
          theme={theme}
          onReply={(reply, message) => {
            const p = activePerm; setActivePerm(null)
            if (!p) return
            const dir = items.find(x => x.sessionId === p.sessionID)?.directory || ''
            replyPerm(p, dir, reply, message)
          }}
          onDismiss={() => setActivePerm(null)}
        />
      )}
      {activeQuestion && (
        <QuestionPrompt
          request={activeQuestion}
          theme={theme}
          onReply={async (answers) => {
            const q = activeQuestion; setActiveQuestion(null)
            if (!q) return
            const dir = items.find(x => x.sessionId === q.sessionID)?.directory || ''
            removeAttention(q.sessionID)
            try { await client.replyQuestion(q.id, answers, dir || undefined) } catch (e: any) { toast.error(e?.message || '回复失败') }
            load()
          }}
          onReject={async () => {
            const q = activeQuestion; setActiveQuestion(null)
            if (!q) return
            const dir = items.find(x => x.sessionId === q.sessionID)?.directory || ''
            removeAttention(q.sessionID)
            try { await client.rejectQuestion(q.id, dir || undefined) } catch {}
            load()
          }}
          onDismiss={() => setActiveQuestion(null)}
        />
      )}
    </SafeAreaView>
  )

  function renderCard(it: Item) {
    if (it.kind === 'attention' && it.permission) return renderPermCard(it, it.permission)
    if (it.kind === 'attention' && it.question) return renderQuestionCard(it, it.question)
    return renderRunOrRecent(it)
  }

  function ProjRow({ it, showTitle }: { it: Item; showTitle?: boolean }) {
    return (
      <View style={styles.row1}>
        <View style={[styles.pdot, { backgroundColor: iconColor(it.projectName) }]}>
          <Text style={styles.pdotText}>{it.projectName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={[styles.proj, !showTitle && { flex: 1 }, { color: theme.textTertiary }]} numberOfLines={1}>{it.projectName}</Text>
        {showTitle && (
          <>
            <Text style={[styles.projSep, { color: theme.textTertiary }]}>·</Text>
            <Text style={[styles.projTitle, { color: theme.textSecondary }]} numberOfLines={1}>{it.title}</Text>
          </>
        )}
        <Text style={[styles.time, { color: theme.textTertiary }]}>{relTime(it.updated)}</Text>
      </View>
    )
  }

  function Diff({ it }: { it: Item }) {
    if (it.additions === 0 && it.deletions === 0) return null
    return (
      <Text style={styles.diff}>
        <Text style={{ color: theme.success }}>+{it.additions}</Text>{'  '}
        <Text style={{ color: theme.error }}>−{it.deletions}</Text>
      </Text>
    )
  }

  function renderPermCard(it: Item, p: PermissionRequest) {
    const d = permDetail(p)
    const scope = permScope(p, d.text)
    const rejecting = rejectingId === p.id
    return (
      <View style={[styles.card, { backgroundColor: mix(theme.warning, theme.surface, 0.07), borderColor: withAlpha(theme.warning, 0.5) }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => openConv(it)}>
          <ProjRow it={it} showTitle />
          <View style={styles.lineRow}><Text style={[styles.line, { color: theme.text }]}>{permTitle(p)}</Text><Diff it={it} /></View>
        </TouchableOpacity>
        {!!d.text && (
          <TouchableOpacity
            disabled={!d.canOpen}
            onPress={() => d.canOpen && setActivePerm(p)}
            style={[styles.detail, { backgroundColor: theme.background, borderColor: theme.border }]}
          >
            <Text style={[styles.detailText, { color: theme.textSecondary }]} numberOfLines={1}>{d.text}</Text>
            {d.canOpen && <Text style={[styles.detailMore, { color: theme.accent }]}>看改动 ›</Text>}
          </TouchableOpacity>
        )}
        {!!scope && (
          <Text style={[styles.scopeHint, { color: theme.textTertiary }]} numberOfLines={1}>
            总是允许将放行 <Text style={{ color: theme.warning, fontWeight: '600' }}>{scope}</Text>
          </Text>
        )}
        {rejecting ? (
          <View>
            <TextInput
              style={[styles.rejectInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              value={rejectMsg} onChangeText={setRejectMsg}
              placeholder="（可选）告诉它换个做法…" placeholderTextColor={theme.textTertiary}
              multiline
            />
            <View style={styles.ops}>
              <Op label="取消" theme={theme} onPress={() => { setRejectingId(null); setRejectMsg('') }} />
              <Op label="确认拒绝" theme={theme} tone="danger" grow onPress={() => replyPerm(p, it.directory, 'reject', rejectMsg.trim() || undefined)} />
            </View>
          </View>
        ) : (
          <View style={styles.ops}>
            <Op label="拒绝" theme={theme} onPress={() => { setRejectingId(p.id); setRejectMsg('') }} />
            <Op label="允许一次" theme={theme} tone="amber" grow onPress={() => replyPerm(p, it.directory, 'once')} />
            <Op label="总是允许" theme={theme} tone="amber" grow onPress={() => replyPerm(p, it.directory, 'always')} />
          </View>
        )}
      </View>
    )
  }

  function renderQuestionCard(it: Item, q: QuestionRequest) {
    const first = q.questions?.[0]
    // 显示真实问题：header 作主标题，question 作副行（内容不同才显示，避免重复）。
    const title = first?.header || first?.question || '有个问题要你回答'
    const detail = first?.question && first.question !== title ? first.question : ''
    return (
      <View style={[styles.card, { backgroundColor: mix(theme.warning, theme.surface, 0.07), borderColor: withAlpha(theme.warning, 0.5) }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => openConv(it)}>
          <ProjRow it={it} showTitle />
          <Text style={[styles.line, { color: theme.text }]} numberOfLines={2}>{title}</Text>
          {!!detail && <Text style={[styles.replyText, { color: theme.textSecondary, marginTop: 4 }]} numberOfLines={2}>{detail}</Text>}
        </TouchableOpacity>
        <View style={styles.ops}>
          <Op label="回答 ›" theme={theme} tone="amber" grow onPress={() => setActiveQuestion(q)} />
        </View>
      </View>
    )
  }

  function renderRunOrRecent(it: Item) {
    const running = it.kind === 'running'
    return (
      <TouchableOpacity
        style={[styles.card, running
          ? { backgroundColor: mix(theme.accent, theme.surface, 0.07), borderColor: withAlpha(theme.accent, 0.5) }
          : { backgroundColor: theme.surface, borderColor: theme.border }]}
        activeOpacity={0.8}
        onPress={() => openConv(it)}
      >
        <ProjRow it={it} />
        <View style={styles.lineRow}><Text style={[styles.line, { color: theme.text }]} numberOfLines={1}>{it.title}</Text><Diff it={it} /></View>
        {!!it.lastText && (
          <View style={styles.reply}>
            {running && <View style={[styles.liveDot, { backgroundColor: theme.accent }]} />}
            <Text style={[styles.replyText, { color: theme.textSecondary }]} numberOfLines={2}>
              {it.lastFromUser && <Text style={{ color: theme.textTertiary }}>你：</Text>}{it.lastText}
            </Text>
          </View>
        )}
        {running ? (
          <View style={styles.ops}>
            <Op label="进去看" theme={theme} tone="cyan" grow onPress={() => openConv(it)} />
            <Op label="让它停" theme={theme} onPress={() => stopRunning(it)} />
          </View>
        ) : (
          <View style={styles.ops}>
            <Op label="进去看" theme={theme} tone="outline" grow onPress={() => openConv(it)} />
          </View>
        )}
      </TouchableOpacity>
    )
  }
}

function Op({ label, theme, tone, grow, onPress }: { label: string; theme: any; tone?: 'amber' | 'cyan' | 'danger' | 'outline'; grow?: boolean; onPress: () => void }) {
  const hit = { top: 4, bottom: 4, left: 0, right: 0 }
  if (tone === 'outline') {
    return (
      <TouchableOpacity hitSlop={hit} style={[styles.op, grow && { flex: 1 }, { backgroundColor: 'transparent', borderColor: withAlpha(theme.accent, 0.4) }]} onPress={onPress} activeOpacity={0.7}>
        <Text style={[styles.opText, { color: theme.accent }]}>{label}</Text>
      </TouchableOpacity>
    )
  }
  const color = tone === 'amber' ? theme.warning : tone === 'cyan' ? theme.accent : tone === 'danger' ? theme.error : theme.textSecondary
  const bg = tone ? withAlpha(color, 0.15) : theme.surfaceSecondary
  const border = tone ? withAlpha(color, 0.45) : theme.border
  return (
    <TouchableOpacity hitSlop={hit} style={[styles.op, grow && { flex: 1 }, { backgroundColor: bg, borderColor: border }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.opText, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function todayLabel(): string {
  const d = new Date()
  const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${wk}`
}
function relTime(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  return new Date(ms).toLocaleDateString()
}
function withAlpha(hex: string, a: number): string {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}
// 把前景色按 ratio 混入背景色，产出不透明色（RN 无 color-mix，用它给卡片做淡色底）。
function mix(fg: string, bg: string, ratio: number): string {
  const f = (fg || '').replace('#', ''), b = (bg || '').replace('#', '')
  if (f.length !== 6 || b.length !== 6) return bg
  const fr = parseInt(f.slice(0, 2), 16), fg2 = parseInt(f.slice(2, 4), 16), fb = parseInt(f.slice(4, 6), 16)
  const br = parseInt(b.slice(0, 2), 16), bg2 = parseInt(b.slice(2, 4), 16), bb = parseInt(b.slice(4, 6), 16)
  const m = (x: number, y: number) => Math.round(x * ratio + y * (1 - ratio))
  const hx = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hx(m(fr, br))}${hx(m(fg2, bg2))}${hx(m(fb, bb))}`
}
const ICON_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e']
function iconColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return ICON_COLORS[h % ICON_COLORS.length]
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // 头部：与卡片共用 20 的左右边距，标题左缘对齐
  head: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
  date: { fontSize: 12, letterSpacing: 0.5 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 3 },
  summary: { fontSize: 12.5, marginTop: 7, lineHeight: 18 },
  // 分组标题：上方留 24 呼吸感，与卡片同边距
  group: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 10, paddingHorizontal: 20 },
  gdot: { width: 6, height: 6, borderRadius: 3 },
  groupText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  gc: { marginLeft: 'auto', fontSize: 11, fontWeight: '600', minWidth: 20, textAlign: 'center', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  // 卡片：圆角 14、内边距 13，左右边距 20（与头部对齐）
  card: { borderWidth: 1, borderRadius: 14, padding: 13, marginHorizontal: 20, marginBottom: 9 },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  pdot: { width: 17, height: 17, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  pdotText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  proj: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  projSep: { fontSize: 12 },
  projTitle: { fontSize: 12, fontWeight: '600', flex: 1 },
  time: { fontSize: 11, fontVariant: ['tabular-nums'] },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  line: { fontSize: 14.5, fontWeight: '600', flex: 1, lineHeight: 20 },
  diff: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // 详情行：圆角 9、内边距 11/8
  detail: { marginTop: 9, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 12.5, flex: 1, fontVariant: ['tabular-nums'] },
  detailMore: { fontSize: 12, fontWeight: '600' },
  scopeHint: { fontSize: 11.5, marginTop: 7, lineHeight: 16 },
  reply: { flexDirection: 'row', gap: 7, marginTop: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  replyText: { fontSize: 12.5, lineHeight: 19, flex: 1 },
  // 操作按钮：高约 38pt（tap 区仍达标，靠 hitSlop 兜底），圆角 9
  ops: { flexDirection: 'row', gap: 8, marginTop: 11 },
  op: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  opText: { fontSize: 12.5, fontWeight: '700' },
  rejectInput: { borderWidth: 1, borderRadius: 9, padding: 11, fontSize: 13, marginTop: 10, minHeight: 44, lineHeight: 19 },
  empty: { alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, marginBottom: 4 },
  emptyHint: { fontSize: 13, textAlign: 'center' },
})
