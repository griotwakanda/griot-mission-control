#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const dataDir = path.join(projectRoot, 'public', 'data')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    cwd: options.cwd ?? workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runSafe(cmd, args, options = {}) {
  try {
    return run(cmd, args, options)
  } catch {
    return null
  }
}

function toPdtStamp(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
    .format(date)
    .replace(',', '')
    .replace(/-/g, '-')
}

function toDateOnly(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseBoardMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/)
  const columns = { todo: [], inProgress: [], done: [], blocked: [] }
  let current = null
  let lastUpdated = 'Unknown'
  const dailyLog = []
  let inDailyLog = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.toLowerCase().startsWith('last updated:')) {
      lastUpdated = line.replace(/last updated:/i, '').trim() || 'Unknown'
      continue
    }

    if (line === '## Daily log') {
      inDailyLog = true
      current = null
      continue
    }

    if (line === '## TODO') {
      current = 'todo'; inDailyLog = false; continue
    }
    if (line === '## IN PROGRESS') {
      current = 'inProgress'; inDailyLog = false; continue
    }
    if (line === '## DONE') {
      current = 'done'; inDailyLog = false; continue
    }
    if (line === '## BLOCKED') {
      current = 'blocked'; inDailyLog = false; continue
    }

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim()
      if (inDailyLog) dailyLog.push(item)
      else if (current) columns[current].push(item)
    }
  }

  return { lastUpdated, columns, dailyLog }
}

function shouldHideRepo(repo) {
  const haystack = JSON.stringify(repo).toLowerCase()
  return haystack.includes('grocery')
}

function getGithubRepos() {
  const raw = runSafe('gh', [
    'repo', 'list', 'griotwakanda', '--limit', '200',
    '--json', 'name,nameWithOwner,isPrivate,url,updatedAt'
  ])
  if (!raw) return []
  const repos = JSON.parse(raw)
  return repos.map((r) => ({
    name: r.name,
    owner: r.nameWithOwner.split('/')[0],
    fullName: r.nameWithOwner,
    private: r.isPrivate,
    url: r.url,
    updatedAt: r.updatedAt,
  })).filter((repo) => !shouldHideRepo(repo))
}

function getLocalRepoPaths() {
  const matches = []
  function walk(dir, depth = 0) {
    if (depth > 4) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.brv')) continue
      const full = path.join(dir, entry.name)
      if (entry.name === '.git') {
        matches.push(dir)
        continue
      }
      walk(full, depth + 1)
    }
  }
  walk(workspaceRoot)
  return [...new Set(matches)].sort()
}

function getLocalRepos() {
  return getLocalRepoPaths().map((repoPath) => {
    const branch = runSafe('git', ['-C', repoPath, 'branch', '--show-current']) || 'detached'
    const status = runSafe('git', ['-C', repoPath, 'status', '--porcelain']) ?? ''
    const clean = status.trim() === ''
    const lastCommit = runSafe('git', ['-C', repoPath, 'log', '-1', '--pretty=%s']) || 'No commits yet'
    const origin = runSafe('git', ['-C', repoPath, 'remote', 'get-url', 'origin'])
    return {
      name: path.basename(repoPath),
      path: repoPath,
      branch,
      clean,
      health: clean ? 'clean' : 'dirty',
      lastCommit,
      origin: origin || null,
    }
  }).filter((repo) => !shouldHideRepo(repo))
}

function formatCronSchedule(schedule) {
  if (!schedule) return 'custom'
  if (schedule.kind === 'cron') return `${schedule.expr} (${schedule.tz || 'UTC'})`
  if (schedule.kind === 'every') return `every ${schedule.everyMs}ms`
  if (schedule.kind === 'at') return schedule.at || 'one-shot'
  return schedule.kind || 'custom'
}

function formatTimestamp(msOrIso) {
  if (!msOrIso) return 'Unknown'
  const date = typeof msOrIso === 'number' ? new Date(msOrIso) : new Date(msOrIso)
  if (Number.isNaN(date.getTime())) return String(msOrIso)
  return toPdtStamp(date)
}

function getAgents() {
  const raw = runSafe('openclaw', ['status', '--json'])
  if (!raw) {
    return [
      {
        name: 'Griot',
        role: 'Main strategic operator',
        model: 'gpt-5.4',
        status: 'online',
        lastActive: toPdtStamp(),
        taskSummary: 'Operational state unavailable; using fallback snapshot.',
      },
    ]
  }

  const data = JSON.parse(raw)
  const agentMeta = new Map((data.agents?.agents || []).map((agent) => [agent.id, agent]))
  const recentSessions = data.sessions?.recent || []

  return (data.agents?.agents || []).map((agent) => {
    const recent = recentSessions.find((session) => session.agentId === agent.id || session.model?.includes(agent.id))
    const status = agent.sessionsCount > 0 ? 'online' : 'idle'
    const model = recent?.model || data.sessions?.defaults?.model || 'unknown'
    const lastActive = agent.lastUpdatedAt ? formatTimestamp(agent.lastUpdatedAt) : 'Never'
    const sessionCount = agent.sessionsCount ?? 0
    return {
      name: agent.id === 'main' ? 'Griot' : agent.id[0].toUpperCase() + agent.id.slice(1),
      role: agent.id === 'main' ? 'Main strategic operator' : 'Specialized agent',
      model,
      status,
      lastActive,
      taskSummary: sessionCount > 0
        ? `${sessionCount} session${sessionCount === 1 ? '' : 's'} tracked. Most recent context usage: ${recent?.percentUsed ?? '?'}%.`
        : 'No tracked sessions yet.',
    }
  })
}

function getAutomations() {
  const raw = runSafe('openclaw', ['cron', 'list', '--json'])
  if (!raw) {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'automations.json'), 'utf8')).automations
  }

  const data = JSON.parse(raw)
  const jobs = Array.isArray(data) ? data : data.jobs || []
  return jobs.map((job) => ({
    name: job.name || job.id || 'Unnamed job',
    schedule: formatCronSchedule(job.schedule),
    state: job.enabled === false ? 'paused' : (job.state?.lastStatus === 'ok' ? 'active' : (job.state?.lastStatus || 'active')),
    lastRun: formatTimestamp(job.state?.lastRunAtMs),
    nextRun: formatTimestamp(job.state?.nextRunAtMs),
    summary: job.description || job.payload?.text || job.payload?.message || job.payload?.kind || 'Automation job',
  }))
}

function getMissionControlCommits(limit = 6) {
  const raw = runSafe('git', ['-C', projectRoot, 'log', `-n`, String(limit), '--pretty=format:%ad\t%s', '--date=iso'])
  if (!raw) return []
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [timestamp, summary] = line.split('\t')
    return {
      timestamp: formatTimestamp(timestamp),
      source: 'mission-control git',
      summary,
      status: 'done',
    }
  })
}

function getWorklog(boardDailyLog) {
  const derivedBoard = boardDailyLog.slice(0, 6).map((item, index) => ({
    timestamp: `${toDateOnly()} · log-${index + 1}`,
    source: 'BOARD.md',
    summary: item,
    status: 'done',
  }))

  const commitEntries = getMissionControlCommits(6)

  const seen = new Set()
  return [...commitEntries, ...derivedBoard].filter((entry) => {
    const key = `${entry.timestamp}|${entry.summary}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 12)
}

function buildOverview({ agents, automations, localRepos, board }) {
  const dirtyRepos = localRepos.filter((r) => !r.clean).length
  const openTasks = board.columns.todo.length + board.columns.inProgress.length + board.columns.blocked.length
  const blockers = board.columns.blocked.length
  const completed = board.columns.done.length
  const enabledAutomations = automations.filter((a) => a.state !== 'paused').length

  return {
    generatedAt: toPdtStamp(),
    missionStatus: blockers > 0 ? 'Focused Execution' : 'Green Zone',
    kpis: [
      { label: 'Active Agents', value: agents.length, status: 'active' },
      { label: 'Enabled Automations', value: enabledAutomations, status: enabledAutomations ? 'healthy' : 'warning' },
      { label: 'Open Tasks', value: openTasks, status: openTasks ? 'warning' : 'done' },
      { label: 'Completed Items', value: completed, status: 'done' },
      { label: 'Dirty Repos', value: dirtyRepos, status: dirtyRepos ? 'warning' : 'clean' },
      { label: 'Blockers', value: blockers, status: blockers ? 'blocked' : 'ok' },
    ],
    summary: 'Mission Control is now driven by local snapshots generated from the real workspace state instead of hand-seeded placeholders.',
    currentFocus: [
      'Keep Mission Control data trustworthy',
      ...board.columns.inProgress.slice(0, 2),
      ...board.columns.todo.slice(0, 1),
    ].slice(0, 4),
    blockers: board.columns.blocked,
    recentCompleted: board.columns.done.slice(0, 3),
  }
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(dataDir, fileName), `${JSON.stringify(data, null, 2)}\n`)
}

ensureDir(dataDir)

const boardMarkdown = fs.readFileSync(path.join(workspaceRoot, 'BOARD.md'), 'utf8')
const board = parseBoardMarkdown(boardMarkdown)
const agents = getAgents()
const automations = getAutomations()
const githubRepos = getGithubRepos()
const localRepos = getLocalRepos()
const worklogEntries = getWorklog(board.dailyLog)
const overview = buildOverview({ agents, automations, localRepos, board })

writeJson('board.json', { lastUpdated: board.lastUpdated, columns: board.columns })
writeJson('agents.json', { agents })
writeJson('automations.json', { automations })
writeJson('repos.json', { github: githubRepos, local: localRepos })
writeJson('worklog.json', { entries: worklogEntries })
writeJson('overview.json', overview)

console.log(`Mission Control snapshots refreshed at ${overview.generatedAt}`)
