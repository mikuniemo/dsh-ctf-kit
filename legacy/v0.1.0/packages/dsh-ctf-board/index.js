/**
 * @local/dsh-ctf-board — CTF 题板 · Host 半
 *
 * 要解决的问题（用户需求，2026-10-29）：
 *   10-28 一天做了 33 道题，flag 散在会话正文里、wp 只落了两篇、错误和坑只进了记忆库标题，
 *   于是"哪道题什么 flag / 有没有 wp / 上次卡在哪"没人答得上来，同一道题还在多个会话里从零重来。
 *   第二次追加需求：**按项目/比赛分组**，上次那批 flag 不能和这次混在一起显示。
 *
 * 数据模型（目录即事实源，不新造账本）：
 *
 *   <DSH_HOME>\ctf\
 *     _current.json                        当前项目指针 {"project":"LUT2026-1024CTF比赛"}
 *     _template\                           格式样例（`_` 开头跳过）
 *     <项目>\
 *       _project.json                      项目级：{name, platform, url, startedAt, status, dirs[], note}
 *       <题名>\
 *         meta.json                        题目级事实
 *         runs\<日期>-<时间>-<会话id前8>.json   一次会话一条
 *         solve.md                         最终题解
 *
 * 项目切换：Client 传 ?project=<id>；不传时按「会话工作目录匹配 _project.dirs → _current.json → 最近有更新」解析。
 * 会话工作目录不读日志：`sessions\<mangled-cwd>\session-<id前8>…` 的父目录名就是 cwd 的转义形式，直接比对即可。
 *
 * agent 按 ctf persona 的约定**直接写这些文件**（不加新工具），本插件只读、只投影给界面。
 * 缺字段一律降级显示，不因为一个坏文件让整块面板失效。
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, appendFileSync } from 'node:fs'
import path from 'node:path'

export const VERSION = '0.2.0'

const DSH_HOME = process.env.DSH_HOME || 'D:\\DSH_HOME'

const DEFAULTS = {
  rootDir: path.join(DSH_HOME, 'ctf'),
  sessionsRoot: path.join(DSH_HOME, 'sessions'),
  routePrefix: '/dsh-ctf-board',
  refreshMs: 15000,
  logDir: path.join(DSH_HOME, 'logs', 'ctf-board'),
}

const STATUSES = new Set(['solved', 'unsolved', 'partial', 'unknown'])

// ------------------------------------------------------------------ 小工具

function str(value, max) {
  if (value === undefined || value === null) return ''
  const text = String(value)
  return max && text.length > max ? `${text.slice(0, max)}…` : text
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function dateKey(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toList(value, maxItems = 40, maxLen = 400) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (item === undefined || item === null) continue
    const text = typeof item === 'string' ? item : JSON.stringify(item)
    const trimmed = text.trim()
    if (!trimmed) continue
    out.push(str(trimmed, maxLen))
    if (out.length >= maxItems) break
  }
  return out
}

function uniq(list) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function normalizeStatus(value) {
  const s = str(value, 24).toLowerCase()
  return STATUSES.has(s) ? s : 'unknown'
}

function normalizeSubmission(value) {
  if (!value || typeof value !== 'object') return null
  const attempts = num(value.attempts)
  const result = str(value.result, 24).toLowerCase()
  return {
    attempts: attempts === null ? null : Math.max(0, Math.trunc(attempts)),
    result: ['accepted', 'incorrect', 'unknown'].includes(result) ? result : 'unknown',
  }
}

function safeStamp(file) {
  try {
    const st = statSync(file)
    return `${Math.trunc(st.mtimeMs)}:${st.size}`
  } catch {
    return '-'
  }
}

function isVisibleDir(entry) {
  return entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.')
}

// ------------------------------------------------------------------ 工作目录 → 项目

/**
 * 会话目录名的转义规则（实测）：
 *   C:\Users\me\Documents\ctf-demo  →  --C-Users-me-Documents-ctf-demo--
 * 即：盘符后的 ":\" 折成一个 '-'，其余分隔符各变 '-'，整体前后各加 "--"。
 */
function mangleCwd(cwd) {
  const s = str(cwd, 400)
  if (!s) return ''
  const norm = s.replace(/^([A-Za-z]):[\\/]/, '$1-').replace(/[\\/]/g, '-')
  return `--${norm}--`
}

function makeWorkspaceResolver(sessionsRoot) {
  let cache = null
  return function workspaceOf(sessionId) {
    const id = str(sessionId, 80)
    if (!id) return null
    if (!cache) {
      cache = new Map()
      try {
        for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          const base = path.join(sessionsRoot, entry.name)
          let inner
          try {
            inner = readdirSync(base)
          } catch {
            continue
          }
          for (const name of inner) {
            const m = /^session-([0-9a-f]{8})/i.exec(name)
            if (m) cache.set(m[1].toLowerCase(), entry.name)
          }
        }
      } catch {
        /* 没有 sessions 目录就退化成按 _current.json 解析 */
      }
    }
    return cache.get(id.slice(0, 8).toLowerCase()) || null
  }
}

// ------------------------------------------------------------------ 题卡扫描

function readRuns(dir) {
  const runsDir = path.join(dir, 'runs')
  if (!existsSync(runsDir)) return []
  let names
  try {
    names = readdirSync(runsDir).filter((n) => n.toLowerCase().endsWith('.json'))
  } catch {
    return []
  }
  names.sort()
  const runs = []
  for (const name of names.slice(-40)) {
    const raw = readJson(path.join(runsDir, name))
    if (!raw || typeof raw !== 'object') continue
    runs.push({
      file: name,
      session: str(raw.session, 40) || name.replace(/\.json$/i, '').split('-').slice(-1)[0],
      date: str(raw.date, 20) || name.slice(0, 10),
      status: normalizeStatus(raw.status),
      flag: str(raw.flag, 200) || null,
      summary: str(raw.summary || raw.conclusion, 600),
      errors: toList(raw.errors),
      pitfalls: toList(raw.pitfalls),
      updated: str(raw.updated, 40) || null,
    })
  }
  return runs.reverse()
}

function readCard(dir, name, project) {
  const meta = readJson(path.join(dir, 'meta.json')) || {}
  const runs = readRuns(dir)
  const wpPath = path.join(dir, 'solve.md')
  const lastRun = runs[0] || null

  const status =
    meta.status && normalizeStatus(meta.status) !== 'unknown'
      ? normalizeStatus(meta.status)
      : lastRun && lastRun.status !== 'unknown'
        ? lastRun.status
        : 'unknown'
  const flag = str(meta.flag, 200) || (lastRun && lastRun.flag) || null

  const errors = uniq([...toList(meta.errors), ...runs.flatMap((r) => r.errors)])
  const pitfalls = uniq([...toList(meta.pitfalls), ...runs.flatMap((r) => r.pitfalls)])

  const dates = [str(meta.date, 20) || null, ...runs.map((r) => r.date)].filter(Boolean).sort()
  let lastDate = dates.length ? dates[dates.length - 1] : null
  if (!lastDate) {
    try {
      lastDate = dateKey(statSync(dir).mtime)
    } catch {
      lastDate = null
    }
  }

  return {
    dir: name,
    path: dir,
    project,
    title: str(meta.title, 120) || name,
    platform: str(meta.platform, 60) || null,
    category: str(meta.category, 40) || null,
    points: num(meta.points),
    target: str(meta.target, 120) || null,
    attachment: str(meta.attachment, 160) || null,
    status,
    flag,
    flagEvidence: str(meta.flag_evidence, 400) || null,
    wp: existsSync(wpPath) ? 'solve.md' : str(meta.wp, 200) || null,
    wpPath: existsSync(wpPath) ? wpPath : null,
    submission: normalizeSubmission(meta.submission),
    errors,
    pitfalls,
    runs,
    date: str(meta.date, 20) || lastDate,
    lastDate,
    updated: str(meta.updated, 40) || null,
    notes: str(meta.notes, 800) || null,
  }
}

/** 项目级：目录名即 id；`_project.json` 可缺 */
function readProject(dir, name) {
  const info = readJson(path.join(dir, '_project.json')) || {}
  const cards = []
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    /* 读不了就当空项目 */
  }
  for (const entry of entries) {
    if (!isVisibleDir(entry)) continue
    try {
      cards.push(readCard(path.join(dir, entry.name), entry.name, name))
    } catch {
      /* 单卡坏了不影响整板 */
    }
  }
  cards.sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)) || a.title.localeCompare(b.title))
  const lastDate = cards.reduce((acc, c) => (String(c.lastDate || '') > acc ? String(c.lastDate) : acc), '')
  const solved = cards.filter((c) => c.status === 'solved').length
  return {
    id: name,
    name: str(info.name, 80) || name,
    platform: str(info.platform, 60) || null,
    url: str(info.url, 200) || null,
    status: str(info.status, 20) || null,
    dirs: Array.isArray(info.dirs) ? info.dirs.map((d) => str(d, 300)).filter(Boolean) : [],
    note: str(info.note, 400) || null,
    cardCount: cards.length,
    solved,
    lastDate: lastDate || null,
    cards,
  }
}

function scanProjects(rootDir) {
  if (!existsSync(rootDir)) return { ok: true, exists: false, projects: [], error: null }
  let entries
  try {
    entries = readdirSync(rootDir, { withFileTypes: true })
  } catch (error) {
    return { ok: false, exists: true, projects: [], error: str(error && error.message, 300) }
  }
  const projects = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '_template') continue
    if (entry.name.startsWith('_')) continue
    try {
      projects.push(readProject(path.join(rootDir, entry.name), entry.name))
    } catch {
      /* 单个项目坏了不影响其它项目 */
    }
  }
  projects.sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')) || a.id.localeCompare(b.id))
  return { ok: true, exists: true, projects, error: null }
}

function projectKey(rootDir) {
  let entries
  try {
    entries = readdirSync(rootDir, { withFileTypes: true })
  } catch {
    return 'missing'
  }
  const parts = []
  for (const proj of entries) {
    if (!proj.isDirectory() || proj.name.startsWith('_') || proj.name.startsWith('.')) continue
    const pdir = path.join(rootDir, proj.name)
    const inner = [`${proj.name}|${safeStamp(path.join(pdir, '_project.json'))}`]
    let subs = []
    try {
      subs = readdirSync(pdir, { withFileTypes: true })
    } catch {
      subs = []
    }
    for (const sub of subs) {
      if (!isVisibleDir(sub)) continue
      const cdir = path.join(pdir, sub.name)
      inner.push(`${sub.name}|${safeStamp(path.join(cdir, 'meta.json'))}|${safeStamp(path.join(cdir, 'runs'))}|${safeStamp(path.join(cdir, 'solve.md'))}`)
    }
    inner.sort()
    parts.push(inner.join('||'))
  }
  parts.sort()
  return parts.join(';;')
}

function summarizeToday(cards, today) {
  const stats = { date: today, cards: 0, solved: 0, flags: 0, unsolved: 0, partial: 0, errors: 0, pitfalls: 0, runs: 0 }
  for (const card of cards) {
    const touchedToday = card.lastDate === today || (card.runs || []).some((r) => r.date === today)
    if (!touchedToday) continue
    stats.cards += 1
    if (card.status === 'solved') stats.solved += 1
    else if (card.status === 'partial') stats.partial += 1
    else if (card.status === 'unsolved') stats.unsolved += 1
    if (card.flag) stats.flags += 1
    stats.errors += (card.errors || []).length
    stats.pitfalls += (card.pitfalls || []).length
    stats.runs += (card.runs || []).filter((r) => r.date === today).length
  }
  return stats
}

// ------------------------------------------------------------------ 模式判定

const MODE_CACHE = new Map()

function makeModeResolver(ctx) {
  return function resolveMode(sessionId) {
    const id = str(sessionId, 80)
    if (!id) return { session: null, preset: null, ctf: false, known: false }
    if (MODE_CACHE.has(id)) return MODE_CACHE.get(id)
    let result = { session: id, preset: null, ctf: false, known: false }
    try {
      const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
      const presets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
      const agent = agents && typeof agents.get === 'function' ? agents.get(id) : undefined
      if (agent && presets && typeof presets.composedPreset === 'function') {
        const preset = presets.composedPreset(agent.ctx)
        result = { session: id, preset: preset ? String(preset) : 'standard', ctf: String(preset) === 'ctf', known: true }
      }
    } catch {
      /* 服务不可用就保持 unknown，界面自行降级 */
    }
    if (result.known) MODE_CACHE.set(id, result)
    return result
  }
}

// ------------------------------------------------------------------ 插件主体

export function apply(ctx, config = {}) {
  const rowConfig = config && typeof config === 'object' ? config : {}
  const rootDir = String(rowConfig.rootDir || DEFAULTS.rootDir)
  const sessionsRoot = String(rowConfig.sessionsRoot || DEFAULTS.sessionsRoot)
  const routePrefix = String(rowConfig.routePrefix || DEFAULTS.routePrefix).replace(/\/+$/, '')
  const refreshMs = Number(rowConfig.refreshMs) || DEFAULTS.refreshMs
  const logDir = String(rowConfig.logDir || DEFAULTS.logDir)

  let boardCache = { key: '', data: null }
  const workspaceOf = makeWorkspaceResolver(sessionsRoot)
  const resolveMode = makeModeResolver(ctx)

  function board() {
    let key
    try {
      key = existsSync(rootDir) ? projectKey(rootDir) : 'missing'
    } catch {
      key = 'error'
    }
    if (boardCache.key === key && boardCache.data) return boardCache.data
    const scanned = scanProjects(rootDir)
    const data = { ok: scanned.ok, exists: scanned.exists, error: scanned.error, rootDir, projects: scanned.projects }
    boardCache = { key, data }
    return data
  }

  function resolveProject(projects, sessionId, requested) {
    if (requested) {
      if (requested === '*') return { id: '*', via: 'explicit' }
      const hit = projects.find((p) => p.id === requested || p.name === requested)
      if (hit) return { id: hit.id, via: 'explicit' }
    }
    const ws = workspaceOf(sessionId)
    if (ws) {
      const byCwd = projects.find((p) => (p.dirs || []).some((d) => mangleCwd(d) === ws))
      if (byCwd) return { id: byCwd.id, via: 'cwd', workspace: ws }
    }
    const current = readJson(path.join(rootDir, '_current.json'))
    if (current && current.project && projects.some((p) => p.id === current.project)) {
      return { id: current.project, via: 'current' }
    }
    return projects.length ? { id: projects[0].id, via: 'recent' } : { id: null, via: 'none' }
  }

  function snapshot(sessionId, requestedProject) {
    const data = board()
    const projects = data.projects || []
    const picked = resolveProject(projects, sessionId, requestedProject)
    const cards = picked.id === '*' ? projects.flatMap((p) => p.cards) : (projects.find((p) => p.id === picked.id)?.cards ?? [])
    const today = summarizeToday(cards, dateKey(new Date()))
    return {
      ok: true,
      ts: new Date().toISOString(),
      refreshMs,
      mode: resolveMode(sessionId),
      rootDir: data.rootDir,
      exists: data.exists,
      error: data.error,
      project: picked,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        platform: p.platform,
        status: p.status,
        cardCount: p.cardCount,
        solved: p.solved,
        lastDate: p.lastDate,
      })),
      today,
      cards,
      cardCount: cards.length,
    }
  }

  let logReady = false
  function report(event, detail) {
    try {
      if (!logReady) {
        mkdirSync(logDir, { recursive: true })
        logReady = true
      }
      appendFileSync(
        path.join(logDir, 'client.log'),
        `${JSON.stringify({ ts: new Date().toISOString(), event: str(event, 40), detail: str(detail, 2000) })}\n`,
        'utf8',
      )
    } catch {
      /* 诊断通道失败不影响功能 */
    }
  }

  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.webServer
    if (!webServer || typeof webServer.register !== 'function') return

    const sendJson = (res, code, payload) => {
      try {
        res.writeHead(code, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(JSON.stringify(payload))
      } catch {
        /* 连接已断开 */
      }
    }

    scoped.effect(() =>
      webServer.register({
        kind: 'prefix',
        path: routePrefix,
        handler: async (req, res) => {
          let url
          try {
            url = new URL(req.url || '/', 'http://localhost')
          } catch {
            return sendJson(res, 400, { ok: false, error: 'bad url' })
          }
          if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
          const pathname = url.pathname
          const sessionId = url.searchParams.get('session') || url.searchParams.get('sessionId') || ''
          const project = url.searchParams.get('project') || ''
          try {
            if (pathname === `${routePrefix}/summary` || pathname === `${routePrefix}/`) {
              return sendJson(res, 200, snapshot(sessionId, project))
            }
            if (pathname === `${routePrefix}/mode`) {
              return sendJson(res, 200, { ok: true, ...resolveMode(sessionId) })
            }
            if (pathname === `${routePrefix}/report`) {
              report(url.searchParams.get('event') || 'unknown', url.searchParams.get('detail') || '')
              return sendJson(res, 200, { ok: true })
            }
            return sendJson(res, 404, { ok: false, error: `未知路径：${pathname}` })
          } catch (error) {
            return sendJson(res, 500, {
              ok: false,
              error: str(error && error.message ? error.message : error, 400),
            })
          }
        },
      }),
    )
  })
}

export default { apply, VERSION }
