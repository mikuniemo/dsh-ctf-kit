/**
 * @local/dsh-ctf-board — CTF 题板 · Client 半
 *
 * 两个座位，一份状态：
 *   conversation.view                    → 视图栏「对话 / 轨迹 / 上下文 / 编队 / CTF」里的 CTF 独立视图
 *   conversation.session.header.actions  → ctf 模式下标题旁的状态条（解出 / flag / 未解 / 踩坑）
 *
 * 数据来自同包 Host 半注册的 GET /dsh-ctf-board/summary（读 <DSH_HOME>\ctf 题卡目录 +
 * 当前会话的 agent preset）。轮询 15 秒；两个组件共用模块级 store 与一条定时器。
 *
 * 约束（与 @local/dsh-redteam-statusbar 同款）：
 *   - 不 require 任何 Harness Client 包，不复刻宿主控件，只用自己的 div / button / span。
 *   - 样式全部走 --dsw-alias-* / --dsw-static-* 主题令牌，深色浅色都跟宿主走。
 *   - 不写 DOM、不碰 document.body；定时器与 window 监听都在 effect 里注册并在 cleanup 移除。
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-ctf-board',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const SUMMARY_ROUTE = '/dsh-ctf-board/summary'
    const DEFAULT_REFRESH_MS = 15000

    const STATUS_LABEL = {
      solved: '已解',
      unsolved: '未解',
      partial: '部分',
      unknown: '状态未知',
    }

    // ---------------------------------------------------------------- 共享 store
    const store = { data: null, error: null, inflight: '', loading: true }
    const subscribers = new Set()
    const pollQuery = { session: '', project: '' }
    let pollTimer = null
    let mountCount = 0
    const LS_KEY = 'dsh-ctf-board.project'

    function readSavedProject() {
      try {
        return localStorage.getItem(LS_KEY) || ''
      } catch {
        return ''
      }
    }

    function saveProject(id) {
      try {
        if (id) localStorage.setItem(LS_KEY, id)
      } catch {
        /* 隐私模式下写不了就只记在内存 */
      }
    }

    function emit() {
      for (const fn of Array.from(subscribers)) {
        try {
          fn()
        } catch {
          /* 单个订阅者出错不影响其它组件 */
        }
      }
    }

    function patch(next) {
      Object.assign(store, next)
      emit()
    }

    function refresh() {
      const key = `${pollQuery.session}|${pollQuery.project}`
      if (store.inflight === key) return
      store.inflight = key
      const qs = new URLSearchParams()
      if (pollQuery.session) qs.set('session', pollQuery.session)
      if (pollQuery.project) qs.set('project', pollQuery.project)
      const url = qs.toString() ? `${SUMMARY_ROUTE}?${qs.toString()}` : SUMMARY_ROUTE
      fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data) => {
          if (!data || data.ok !== true) throw new Error('返回体缺少 ok')
          store.inflight = ''
          patch({ data, error: null, loading: false })
        })
        .catch((error) => {
          store.inflight = ''
          patch({ error: String((error && error.message) || error), loading: false })
        })
    }

    function subscribe(fn) {
      subscribers.add(fn)
      return function () {
        subscribers.delete(fn)
      }
    }

    /** 同一轮询器同时服务视图与状态条：查询条件（会话 / 项目）变了就立刻重拉。 */
    function usePolling(sessionId, projectId) {
      React.useEffect(
        function () {
          pollQuery.session = sessionId
          pollQuery.project = projectId
          mountCount += 1
          refresh()
          if (!pollTimer) {
            const ms = (store.data && store.data.refreshMs) || DEFAULT_REFRESH_MS
            pollTimer = setInterval(refresh, Math.max(4000, Number(ms) || DEFAULT_REFRESH_MS))
          }
          return function () {
            mountCount -= 1
            if (mountCount <= 0 && pollTimer) {
              clearInterval(pollTimer)
              pollTimer = null
              mountCount = 0
            }
          }
        },
        [sessionId, projectId],
      )
    }

    function useStore() {
      const pair = React.useState(0)
      const bump = pair[1]
      React.useEffect(
        () =>
          subscribe(function () {
            bump((n) => n + 1)
          }),
        [],
      )
      return store
    }

    function sessionIdOf(props) {
      if (!props) return ''
      return String(props.sessionId || (props.session && props.session.id) || '')
    }

    // ---------------------------------------------------------------- 小工具
    function fmtStamp(iso) {
      if (!iso) return '—'
      return String(iso).replace('T', ' ').slice(0, 16)
    }

    function copy(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(String(text))
          return
        }
      } catch {
        /* 剪贴板不可用就算了，路径本身可选中 */
      }
    }

    function Badge(props) {
      return h('span', { className: 'ctfb-badge' + (props.tone ? ` ctfb-badge--${props.tone}` : '') }, props.children)
    }

    function KeyValue(props) {
      return h(
        'div',
        { className: 'ctfb-kv' },
        h('span', { className: 'ctfb-kv-k' }, props.label),
        h('span', { className: 'ctfb-kv-v', title: props.title || undefined }, props.value),
      )
    }

    function Copyable(props) {
      return h(
        'span',
        { className: 'ctfb-copy' },
        h('code', { className: 'ctfb-code', title: props.value }, props.value),
        h(
          'button',
          {
            type: 'button',
            className: 'ctfb-mini',
            title: '复制',
            onClick: () => copy(props.value),
          },
          '复制',
        ),
      )
    }

    function List(props) {
      const items = props.items || []
      if (!items.length) return h('div', { className: 'ctfb-muted' }, props.empty || '—')
      return h(
        'ul',
        { className: 'ctfb-list' },
        items.map((item, i) => h('li', { key: `${props.kind || 'li'}-${i}` }, item)),
      )
    }

    function Details(props) {
      return h(
        'details',
        { className: 'ctfb-details', open: props.open || undefined },
        h('summary', null, props.summary),
        props.children,
      )
    }

    // ---------------------------------------------------------------- 卡片
    function Card(props) {
      const card = props.card
      const statusTone = card.status === 'solved' ? 'ok' : card.status === 'unsolved' ? 'warn' : undefined
      const submission = card.submission
      const runs = card.runs || []

      return h(
        'article',
        { className: 'ctfb-card' },
        h(
          'header',
          { className: 'ctfb-card-head' },
          h('span', { className: 'ctfb-card-title', title: card.path }, card.title),
          h(Badge, { tone: statusTone }, STATUS_LABEL[card.status] || card.status),
          card.platform ? h(Badge, null, card.platform) : null,
          card.lastDate ? h('span', { className: 'ctfb-card-date' }, card.lastDate) : null,
        ),
        h(
          'div',
          { className: 'ctfb-card-meta' },
          h(KeyValue, { label: '靶机', value: card.target || '—' }),
          h(KeyValue, { label: '附件', value: card.attachment || '—' }),
          h(
            KeyValue,
            {
              label: '平台提交',
              value: submission
                ? `${submission.result}${submission.attempts === null ? '' : ` · ${submission.attempts} 次`}`
                : '—',
            },
          ),
        ),
        card.flag
          ? h(
              'div',
              { className: 'ctfb-flag' },
              h('span', { className: 'ctfb-flag-label' }, 'FLAG'),
              h(Copyable, { value: card.flag }),
            )
          : h('div', { className: 'ctfb-muted' }, '还没有 flag'),
        card.flagEvidence ? h('div', { className: 'ctfb-evidence' }, `来源：${card.flagEvidence}`) : null,
        h(
          'div',
          { className: 'ctfb-links' },
          card.wpPath
            ? h(Copyable, { value: card.wpPath })
            : h('span', { className: 'ctfb-muted' }, '还没有 wp（solve.md）'),
        ),
        card.errors.length
          ? h(Details, { summary: `错误 ${card.errors.length}` }, h(List, { items: card.errors, kind: 'err' }))
          : null,
        card.pitfalls.length
          ? h(Details, { summary: `踩坑 ${card.pitfalls.length}` }, h(List, { items: card.pitfalls, kind: 'pit' }))
          : null,
        runs.length
          ? h(
              Details,
              { summary: `历次会话 ${runs.length}` },
              h(
                'ul',
                { className: 'ctfb-runs' },
                runs.map((run) =>
                  h(
                    'li',
                    { key: run.file },
                    h(
                      'div',
                      { className: 'ctfb-run-head' },
                      h('span', { className: 'ctfb-run-date' }, `${run.date} · ${run.session}`),
                      h(Badge, { tone: run.status === 'solved' ? 'ok' : undefined }, STATUS_LABEL[run.status] || run.status),
                    ),
                    run.summary ? h('div', { className: 'ctfb-run-summary' }, run.summary) : null,
                  ),
                ),
              ),
            )
          : null,
      )
    }

    function groupByDate(cards) {
      const groups = new Map()
      for (const card of cards) {
        const key = card.lastDate || '未知日期'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(card)
      }
      return Array.from(groups.entries()).sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    }

    // ---------------------------------------------------------------- 视图（第五个 tab）
    function BoardView(props) {
      const state = useStore()
      const sessionId = sessionIdOf(props)
      const chosenPair = React.useState(readSavedProject)
      const chosen = chosenPair[0]
      const setChosen = chosenPair[1]
      usePolling(sessionId, chosen)

      const data = state.data
      const cards = (data && data.cards) || []
      const today = (data && data.today) || null
      const groups = groupByDate(cards)
      const projects = (data && data.projects) || []
      const activeId = (data && data.project && data.project.id) || ''
      const activeProject = projects.find((p) => p.id === activeId) || null

      const pick = function (event) {
        const value = event && event.target ? String(event.target.value) : ''
        setChosen(value)
        saveProject(value)
      }

      const head = h(
        'header',
        { className: 'ctfb-head' },
        h('h3', { className: 'ctfb-title' }, 'CTF 题板'),
        h(
          'select',
          {
            className: 'ctfb-select',
            value: chosen || activeId || '',
            onChange: pick,
            title: '选择项目 / 比赛',
          },
          [
            h('option', { value: '*', key: '*' }, `全部项目（${projects.reduce((n, p) => n + p.cardCount, 0)} 题）`),
            ...projects.map((p) =>
              h(
                'option',
                { value: p.id, key: p.id },
                `${p.name}（${p.solved}/${p.cardCount}）`,
              ),
            ),
          ],
        ),
        activeProject && activeProject.platform
          ? h('span', { className: 'ctfb-proj-meta' }, activeProject.platform)
          : null,
        today
          ? h(
              'div',
              { className: 'ctfb-today' },
              h('span', null, `今天 ${today.date}：`),
              h('b', null, `解出 ${today.solved}`),
              h('span', { className: 'ctfb-sep' }, '·'),
              h('span', null, `flag ${today.flags}`),
              h('span', { className: 'ctfb-sep' }, '·'),
              h('span', null, `未解 ${today.unsolved}`),
              h('span', { className: 'ctfb-sep' }, '·'),
              h('span', null, `踩坑 ${today.pitfalls}`),
            )
          : null,
        h('button', { type: 'button', className: 'ctfb-mini', onClick: () => refresh() }, '刷新'),
      )

      if (!data && state.loading) {
        return h('div', { className: 'ctfb-root' }, h('style', null, CSS), head, h('div', { className: 'ctfb-empty' }, '正在读取题卡…'))
      }
      if (!data && state.error) {
        return h(
          'div',
          { className: 'ctfb-root' },
          h('style', null, CSS),
          head,
          h('div', { className: 'ctfb-empty' }, `取数失败：${state.error}`),
        )
      }
      if (data && data.exists === false) {
        return h(
          'div',
          { className: 'ctfb-root' },
          h('style', null, CSS),
          head,
          h('div', { className: 'ctfb-empty' }, `题卡目录还不存在：${data.rootDir}`),
        )
      }
      if (!cards.length) {
        return h(
          'div',
          { className: 'ctfb-root' },
          h('style', null, CSS),
          head,
          h(
            'div',
            { className: 'ctfb-empty' },
            activeId === '*'
              ? `全部项目下还没有题卡：${data ? data.rootDir : ''}`
              : `项目「${activeProject ? activeProject.name : activeId}」下还没有题卡。解题时按 ctf persona 的约定写 meta.json / runs\\ / solve.md，这里就会长出来。`,
          ),
        )
      }

      return h(
        'div',
        { className: 'ctfb-root' },
        h('style', null, CSS),
        head,
        groups.map(([date, list]) =>
          h(
            'section',
            { className: 'ctfb-group', key: date },
            h('div', { className: 'ctfb-group-head' }, `${date} · ${list.length} 题`),
            h('div', { className: 'ctfb-cards' }, list.map((card) => h(Card, { key: card.dir, card }))),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- 状态条（只有 ctf 模式显示）
    function Chips(props) {
      const state = useStore()
      const sessionId = sessionIdOf(props)
      usePolling(sessionId, readSavedProject())

      const data = state.data
      const mode = data && data.mode
      // 只有确认是 ctf 模式才显示：标准/安全模式继续走红队状态栏，不抢位置
      if (!mode || mode.ctf !== true) return null
      const today = data.today || null
      if (!today) return null

      const items = [
        { label: '解出', value: `${today.solved}/${today.cards}`, tone: today.solved > 0 ? 'ok' : undefined },
        { label: 'flag', value: today.flags },
        { label: '未解', value: today.unsolved, tone: today.unsolved > 0 ? 'warn' : undefined },
        { label: '踩坑', value: today.pitfalls },
      ]

      return h(
        'div',
        { className: 'ctfb-chips' },
        h('style', null, CSS),
        h('span', { className: 'ctfb-chip-dot' }),
        items.map((item, i) =>
          h(
            'span',
            { className: 'ctfb-chip' + (item.tone ? ` ctfb-chip--${item.tone}` : ''), key: item.label },
            i > 0 ? h('span', { className: 'ctfb-sep' }, '·') : null,
            h('span', { className: 'ctfb-chip-k' }, item.label),
            h('span', { className: 'ctfb-chip-v' }, String(item.value)),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- 样式（主题令牌）
    const CSS = [
      '.ctfb-root{display:block;height:100%;min-height:0;overflow:auto;padding:16px 20px 40px;',
      'color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.55;font-family:inherit}',
      '.ctfb-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}',
      '.ctfb-title{margin:0;font-size:14px;font-weight:600}',
      '.ctfb-today{flex:1;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.ctfb-today b{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.ctfb-select{font:inherit;font-size:11px;height:24px;padding:0 6px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-primary);max-width:260px}',
      '.ctfb-proj-meta{font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.ctfb-sep{color:var(--dsw-alias-label-dimmed);margin:0 4px}',
      '.ctfb-group{margin-bottom:16px}',
      '.ctfb-group-head{font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}',
      '.ctfb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}',
      '.ctfb-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:10px 12px;',
      'background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.ctfb-card-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.ctfb-card-title{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ctfb-card-date{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-dimmed);font-variant-numeric:tabular-nums}',
      '.ctfb-badge{font-size:10px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);',
      'color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.ctfb-badge--ok{background:transparent;border:1px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.ctfb-badge--warn{background:transparent;border:1px solid var(--dsw-static-amber-600);color:var(--dsw-static-amber-600)}',
      '.ctfb-card-meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:11px}',
      '.ctfb-kv{display:flex;gap:4px;min-width:0}',
      '.ctfb-kv-k{color:var(--dsw-alias-label-tertiary);flex:none}',
      '.ctfb-kv-v{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ctfb-flag{display:flex;align-items:center;gap:6px;min-width:0}',
      '.ctfb-flag-label{font-size:9px;letter-spacing:.08em;color:var(--dsw-alias-label-dimmed)}',
      '.ctfb-copy{display:inline-flex;align-items:center;gap:4px;min-width:0}',
      '.ctfb-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;',
      'color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ctfb-mini{font:inherit;font-size:10px;padding:1px 7px;border-radius:999px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-secondary)}',
      '.ctfb-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ctfb-evidence{font-size:10px;color:var(--dsw-alias-label-tertiary);overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.ctfb-links{display:flex;gap:6px;align-items:center;min-width:0}',
      '.ctfb-details{border-top:1px dashed var(--dsw-alias-border-l1);padding-top:4px}',
      '.ctfb-details>summary{cursor:pointer;font-size:10px;color:var(--dsw-alias-label-tertiary)}',
      '.ctfb-list{margin:4px 0 0;padding-left:16px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ctfb-list li{margin:2px 0;word-break:break-word}',
      '.ctfb-runs{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}',
      '.ctfb-runs li{background:var(--dsw-alias-bg-layer-3);border-radius:8px;padding:5px 7px}',
      '.ctfb-run-head{display:flex;align-items:center;gap:6px}',
      '.ctfb-run-date{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.ctfb-run-summary{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}',
      '.ctfb-muted{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.ctfb-empty{padding:18px;border-radius:12px;border:1px dashed var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.ctfb-chips{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);',
      'color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1;white-space:nowrap}',
      '.ctfb-chip{display:inline-flex;align-items:baseline;gap:3px}',
      '.ctfb-chip-k{color:var(--dsw-alias-label-tertiary)}',
      '.ctfb-chip-v{font-weight:600;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
      '.ctfb-chip--ok .ctfb-chip-v{color:var(--dsw-alias-brand-primary)}',
      '.ctfb-chip--warn .ctfb-chip-v{color:var(--dsw-static-amber-600)}',
      '.ctfb-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}',
    ].join('')

    // ---------------------------------------------------------------- 注册
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.view', function () {
          return ctx.slots.register(
            { name: 'conversation.view', id: 'ctf', order: 40, label: () => 'CTF' },
            BoardView,
          )
        })
        ctx.slots.inject('conversation.session.header.actions', function () {
          return ctx.slots.register(
            { name: 'conversation.session.header.actions', id: 'ctf-board-chips', order: 18 },
            Chips,
          )
        })
      },
    }
  },
})
