<script setup>
import { computed, onMounted, ref } from 'vue'

const tabs = ['Overview', 'Agents', 'Automations', 'Repos', 'Board', 'Log']
const activeTab = ref('Overview')
const loading = ref(true)
const loadError = ref('')

const overview = ref({
  missionStatus: 'Initializing',
  generatedAt: 'Unknown',
  kpis: [],
  summary: '',
  currentFocus: [],
  blockers: [],
  recentCompleted: [],
})
const agents = ref([])
const automations = ref([])
const repos = ref({ github: [], local: [] })
const board = ref({ columns: { todo: [], inProgress: [], done: [], blocked: [] }, lastUpdated: 'Unknown' })
const worklog = ref([])

const boardColumns = computed(() => [
  { key: 'todo', label: 'TODO' },
  { key: 'inProgress', label: 'IN PROGRESS' },
  { key: 'done', label: 'DONE' },
  { key: 'blocked', label: 'BLOCKED' },
])

const statusClass = (value = '') => {
  const normalized = String(value).toLowerCase()
  if (['online', 'healthy', 'enabled', 'active', 'clean', 'done', 'ok', 'success'].includes(normalized)) {
    return 'ok'
  }
  if (['warning', 'paused', 'idle', 'degraded', 'dirty', 'in-progress'].includes(normalized)) {
    return 'warn'
  }
  if (['blocked', 'error', 'offline', 'failed', 'critical'].includes(normalized)) {
    return 'bad'
  }
  return 'neutral'
}

async function loadSnapshot(path) {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }
  return response.json()
}

async function loadData() {
  loading.value = true
  loadError.value = ''

  try {
    const [overviewData, agentsData, automationsData, reposData, boardData, worklogData] = await Promise.all([
      loadSnapshot('/data/overview.json'),
      loadSnapshot('/data/agents.json'),
      loadSnapshot('/data/automations.json'),
      loadSnapshot('/data/repos.json'),
      loadSnapshot('/data/board.json'),
      loadSnapshot('/data/worklog.json'),
    ])

    overview.value = overviewData
    agents.value = agentsData.agents || []
    automations.value = automationsData.automations || []
    repos.value = {
      github: reposData.github || [],
      local: reposData.local || [],
    }
    board.value = boardData
    worklog.value = worklogData.entries || []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Could not load dashboard snapshots.'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <main class="app-shell">
    <header class="topbar panel">
      <div>
        <p class="eyebrow">Wakanda Ops Grid</p>
        <h1>Mission Control</h1>
        <p class="muted">{{ overview.generatedAt }} · Status: {{ overview.missionStatus }}</p>
      </div>
      <button class="ghost" @click="loadData">Refresh Snapshot</button>
    </header>

    <nav class="tabs panel" aria-label="Mission control modules">
      <button
        v-for="tab in tabs"
        :key="tab"
        :class="['tab-pill', { active: activeTab === tab }]"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </nav>

    <p v-if="loadError" class="panel error">{{ loadError }}</p>
    <p v-if="loading" class="panel muted">Loading operational snapshot…</p>

    <section v-if="!loading && activeTab === 'Overview'" class="module-stack">
      <div class="kpi-grid">
        <article v-for="kpi in overview.kpis" :key="kpi.label" class="panel kpi-card">
          <p class="label">{{ kpi.label }}</p>
          <p class="value">{{ kpi.value }}</p>
          <span :class="['badge', statusClass(kpi.status)]">{{ kpi.status }}</span>
        </article>
      </div>

      <article class="panel">
        <h2>Mission Summary</h2>
        <p>{{ overview.summary }}</p>
      </article>

      <article class="panel">
        <h2>Current Focus</h2>
        <ul>
          <li v-for="item in overview.currentFocus" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article class="panel">
        <h2>Blockers / Decisions</h2>
        <ul v-if="overview.blockers.length">
          <li v-for="item in overview.blockers" :key="item">{{ item }}</li>
        </ul>
        <p v-else class="muted">No blockers right now.</p>
      </article>
    </section>

    <section v-if="!loading && activeTab === 'Agents'" class="module-stack">
      <article v-for="agent in agents" :key="agent.name" class="panel list-card">
        <div class="row-between">
          <h2>{{ agent.name }}</h2>
          <span :class="['badge', statusClass(agent.status)]">{{ agent.status }}</span>
        </div>
        <p class="muted">{{ agent.role }} · {{ agent.model }}</p>
        <p>{{ agent.taskSummary }}</p>
        <p class="mono">Last active: {{ agent.lastActive }}</p>
      </article>
    </section>

    <section v-if="!loading && activeTab === 'Automations'" class="module-stack">
      <article v-for="job in automations" :key="job.name" class="panel list-card">
        <div class="row-between">
          <h2>{{ job.name }}</h2>
          <span :class="['badge', statusClass(job.state)]">{{ job.state }}</span>
        </div>
        <p class="mono">{{ job.schedule }}</p>
        <p class="muted">Last run: {{ job.lastRun }} · Next run: {{ job.nextRun }}</p>
        <p>{{ job.summary }}</p>
      </article>
    </section>

    <section v-if="!loading && activeTab === 'Repos'" class="module-stack">
      <article class="panel">
        <div class="row-between section-heading">
          <h2>GitHub</h2>
          <span class="badge neutral">{{ repos.github.length }} repos</span>
        </div>
        <div class="module-stack nested-stack">
          <article v-for="repo in repos.github" :key="repo.fullName" class="panel list-card nested-card">
            <div class="row-between">
              <h2>{{ repo.name }}</h2>
              <span :class="['badge', repo.private ? 'warn' : 'ok']">{{ repo.private ? 'private' : 'public' }}</span>
            </div>
            <p class="muted">{{ repo.fullName }}</p>
            <p class="mono"><a :href="repo.url" target="_blank" rel="noreferrer">{{ repo.url }}</a></p>
            <p class="muted">Updated: {{ repo.updatedAt }}</p>
          </article>
        </div>
      </article>

      <article class="panel">
        <div class="row-between section-heading">
          <h2>Local</h2>
          <span class="badge neutral">{{ repos.local.length }} repos</span>
        </div>
        <div class="module-stack nested-stack">
          <article v-for="repo in repos.local" :key="repo.path" class="panel list-card nested-card">
            <div class="row-between">
              <h2>{{ repo.name }}</h2>
              <span :class="['badge', statusClass(repo.health)]">{{ repo.health }}</span>
            </div>
            <p class="mono">{{ repo.path }}</p>
            <p>Branch: {{ repo.branch }} · {{ repo.clean ? 'Clean' : 'Dirty' }}</p>
            <p v-if="repo.origin" class="muted">Origin: {{ repo.origin }}</p>
            <p class="muted">{{ repo.lastCommit }}</p>
          </article>
        </div>
      </article>
    </section>

    <section v-if="!loading && activeTab === 'Board'" class="module-stack">
      <p class="muted">Snapshot updated: {{ board.lastUpdated }}</p>
      <div class="board-grid">
        <article v-for="column in boardColumns" :key="column.key" class="panel board-column">
          <h2>{{ column.label }} ({{ board.columns?.[column.key]?.length || 0 }})</h2>
          <ul v-if="board.columns?.[column.key]?.length">
            <li v-for="task in board.columns[column.key]" :key="task">{{ task }}</li>
          </ul>
          <p v-else class="muted">No items.</p>
        </article>
      </div>
    </section>

    <section v-if="!loading && activeTab === 'Log'" class="module-stack">
      <article v-for="entry in worklog" :key="entry.timestamp + entry.summary" class="panel log-row">
        <div class="row-between">
          <p class="mono">{{ entry.timestamp }}</p>
          <span :class="['badge', statusClass(entry.status)]">{{ entry.status }}</span>
        </div>
        <p class="muted">{{ entry.source }}</p>
        <p>{{ entry.summary }}</p>
      </article>
    </section>
  </main>
</template>
