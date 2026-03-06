<script setup>
import { onMounted, computed, ref } from 'vue'
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db, firebaseReady, firebaseMissingKeys } from './firebase'

const board = ref({ todo: [], inProgress: [], done: [], lastUpdated: 'Unknown' })
const boardError = ref('')

const sessionEntries = ref([])
const logError = ref('')
const addError = ref('')
const isSaving = ref(false)

const timeLabel = ref('')
const description = ref('')

const totalTasks = computed(
  () => board.value.todo.length + board.value.inProgress.length + board.value.done.length,
)

function parseBoard(md) {
  const lines = md.split('\n')
  let current = null
  const output = { todo: [], inProgress: [], done: [], lastUpdated: 'Unknown' }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.toLowerCase().startsWith('last updated:')) {
      output.lastUpdated = line.replace(/last updated:/i, '').trim() || 'Unknown'
      continue
    }

    if (line === '## TODO') current = 'todo'
    else if (line === '## IN PROGRESS') current = 'inProgress'
    else if (line === '## DONE') current = 'done'
    else if (line.startsWith('- ') && current) output[current].push(line.slice(2).trim())
  }

  return output
}

async function loadBoard() {
  boardError.value = ''

  try {
    const response = await fetch('/BOARD.md', { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load BOARD.md')
    const markdown = await response.text()
    board.value = parseBoard(markdown)
  } catch (error) {
    boardError.value = error instanceof Error ? error.message : 'Unexpected board load error'
  }
}

function formatTimeLabel(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function subscribeSessionLog() {
  if (!firebaseReady || !db) {
    logError.value = `Firebase config is incomplete. Missing: ${firebaseMissingKeys.join(', ')}`
    return
  }

  const logQuery = query(collection(db, 'sessionLog'), orderBy('createdAt', 'desc'))

  onSnapshot(
    logQuery,
    (snapshot) => {
      sessionEntries.value = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          timeLabel: data.timeLabel || '??:??',
          description: data.description || '',
        }
      })
      logError.value = ''
    },
    (error) => {
      logError.value = error.message || 'Could not load Firestore session log'
    },
  )
}

async function addSessionEntry() {
  addError.value = ''

  if (!firebaseReady || !db) {
    addError.value = 'Firebase is not configured yet.'
    return
  }

  if (!description.value.trim()) {
    addError.value = 'Description is required.'
    return
  }

  const entryTime = timeLabel.value.trim() || formatTimeLabel()

  isSaving.value = true
  try {
    await addDoc(collection(db, 'sessionLog'), {
      createdAt: serverTimestamp(),
      timeLabel: entryTime,
      description: description.value.trim(),
    })

    timeLabel.value = ''
    description.value = ''
  } catch (error) {
    addError.value = error instanceof Error ? error.message : 'Failed to save entry'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  loadBoard()
  subscribeSessionLog()
})
</script>

<template>
  <main class="wrap">
    <header class="header card">
      <div>
        <h1>Griot — Mission Control</h1>
        <p class="muted">Last updated: {{ board.lastUpdated }}</p>
      </div>
      <button class="ghost" @click="loadBoard">Refresh board</button>
    </header>

    <section class="kpis">
      <article class="card">
        <p class="label">Total Tasks</p>
        <p class="value">{{ totalTasks }}</p>
      </article>
      <article class="card">
        <p class="label">In Progress</p>
        <p class="value">{{ board.inProgress.length }}</p>
      </article>
      <article class="card">
        <p class="label">Done</p>
        <p class="value">{{ board.done.length }}</p>
      </article>
    </section>

    <p v-if="boardError" class="error card">{{ boardError }}</p>

    <section class="board-grid">
      <article class="card column">
        <h2>TODO ({{ board.todo.length }})</h2>
        <ul v-if="board.todo.length">
          <li v-for="task in board.todo" :key="task">{{ task }}</li>
        </ul>
        <p v-else class="muted">No tasks.</p>
      </article>

      <article class="card column">
        <h2>IN PROGRESS ({{ board.inProgress.length }})</h2>
        <ul v-if="board.inProgress.length">
          <li v-for="task in board.inProgress" :key="task">{{ task }}</li>
        </ul>
        <p v-else class="muted">No active tasks.</p>
      </article>

      <article class="card column">
        <h2>DONE ({{ board.done.length }})</h2>
        <ul v-if="board.done.length">
          <li v-for="task in board.done" :key="task">{{ task }}</li>
        </ul>
        <p v-else class="muted">No completed tasks listed.</p>
      </article>
    </section>

    <section class="card session-section">
      <div class="section-title">
        <h2>Session log</h2>
        <p class="muted">Firestore collection: <code>sessionLog</code></p>
      </div>

      <form class="session-form" @submit.prevent="addSessionEntry">
        <label>
          Time label
          <input v-model="timeLabel" type="text" placeholder="09:15" maxlength="20" />
        </label>

        <label class="wide">
          Description
          <input
            v-model="description"
            type="text"
            placeholder="Short note about what was completed"
            maxlength="220"
            required
          />
        </label>

        <button :disabled="isSaving" type="submit">{{ isSaving ? 'Saving...' : 'Add entry' }}</button>
      </form>

      <p v-if="addError" class="error">{{ addError }}</p>
      <p v-if="logError" class="error">{{ logError }}</p>

      <ul v-if="sessionEntries.length" class="session-list">
        <li v-for="entry in sessionEntries" :key="entry.id" class="session-row">
          <span class="time">{{ entry.timeLabel }}</span>
          <span>{{ entry.description }}</span>
        </li>
      </ul>
      <p v-else class="muted">No session entries yet.</p>
    </section>

    <section class="card history-spotlight">
      <h2>Hoje na história</h2>
      <p>
        Em 24 de fevereiro de 1582, o Papa Gregório XIII apresentou o novo calendário que corrigiu
        a perda acumulada do ano solar.
      </p>
      <img
        src="/hoje/papa-gregory-calendario.png"
        alt="Pintura do Papa Gregório XIII com referência ao calendário gregoriano"
      />
    </section>
  </main>
</template>
