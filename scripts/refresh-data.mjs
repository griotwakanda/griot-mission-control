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
  }))
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
  })
}

function getAgents() {
  const now = toPdtStamp()
  return [
    {
      name: 'Griot',
      role: 'Main strategic operator',
      model: 'gpt-5.4',
      status: 'online',
      lastActive: now,
      taskSummary: 'Coordinating workspace execution, memory, and operational planning.',
    },
    {
      name: 'Vibeanium',
      role: 'Coding-specialized sub-agent',
      model: 'gpt-5.3-codex',
      status: 'active',
      lastActive: now,
      taskSummary: 'Available for implementation, debugging, refactoring, and code review on demand.',
    },
  ]
}

function getAutomations() {
  const raw = runSafe('openclaw', ['cron', 'list', '--json'])
  if (!raw) {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'automations.json'), 'utf8')).automations
  }

  const data = JSON.parse(raw)
  const jobs = Array.isArray(data) ? data : data.jobs || []
  return jobs.map((job) => ({
    name: job.name || job.jobId || 'Unnamed job',
    schedule: job.schedule?.expr || job.schedule?.kind || 'custom',
    state: job.enabled === false ? 'paused' : 'active',
    lastRun: job.lastRunAt || 'Unknown',
    nextRun: job.nextRunAt || 'Unknown',
    summary: job.payload?.text || job.payload?.message || job.payload?.kind || 'Automation job',
  }))
}

function getWorklog(boardDailyLog) {
  const existingPath = path.join(dataDir, 'worklog.json')
  const existing = fs.existsSync(existingPath)
    ? JSON.parse(fs.readFileSync(existingPath, 'utf8')).entries || []
    : []

  const derived = boardDailyLog.slice(0, 6).map((item, index) => ({
    timestamp: `${toDateOnly()} · log-${index + 1}`,
    source: 'BOARD.md',
    summary: item,
    status: 'done',
  }))

  const seen = new Set()
  return [...derived, ...existing].filter((entry) => {
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
