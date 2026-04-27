/**
 * Python Remote Executor — Frontend App
 * Vanilla JS, no build step required.
 */

const API = {
  base: window.location.origin,

  async get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail);
    return r.json();
  },

  async post(path, body = {}) {
    const r = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail);
    return r.json();
  },

  async delete(path) {
    const r = await fetch(this.base + path, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail);
    return r.json();
  },

  wsUrl(path) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${path}`;
  },
};

// ─── State ────────────────────────────────────────────────────────
const State = {
  jobs: [],
  selectedJob: null,
  activeTag: 'all',
  activeRunId: null,
  autoScroll: true,
  historyPage: 1,
  historyHasMore: false,
  ws: null,
  activeProcesses: {},  // { run_id: { job_id, job_name, pid, started_at } }
};

// ─── Toast ────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Helpers ──────────────────────────────────────────────────────
function statusBadge(status) {
  return `<span class="badge badge-${status.toLowerCase()}">${statusDot(status)} ${status}</span>`;
}
function statusDot(status) {
  const dots = { RUNNING: '●', COMPLETED: '✓', FAILED: '✗', KILLED: '⬛', PENDING: '○' };
  return dots[status] ?? '?';
}
function elapsed(startedAt, finishedAt) {
  const s = new Date(startedAt);
  const e = finishedAt ? new Date(finishedAt) : new Date();
  const diff = Math.floor((e - s) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const sc = String(diff % 60).padStart(2, '0');
  return `${h}:${m}:${sc}`;
}
function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR');
}
function escapeHtml(t) {
  return String(t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Job List ─────────────────────────────────────────────────────
async function loadJobs() {
  try {
    const data = await API.get('/api/jobs');
    State.jobs = data.jobs;
    renderTagFilters();
    renderJobList();
    document.getElementById('job-count').textContent = `${data.total}개`;
  } catch (e) {
    toast('Job 목록 로드 실패: ' + e.message, 'error');
  }
}

function renderTagFilters() {
  const allTags = new Set(['all']);
  State.jobs.forEach(j => (j.tags || []).forEach(t => allTags.add(t)));

  const el = document.getElementById('tag-filters');
  if (!el) return;
  el.innerHTML = [...allTags].map(tag =>
    `<span class="tag ${State.activeTag === tag ? 'active' : ''}"
           onclick="App.filterTag('${tag}')">${tag}</span>`
  ).join('');
}

function renderJobList() {
  const el = document.getElementById('job-list');
  if (!el) return;
  const filtered = State.activeTag === 'all'
    ? State.jobs
    : State.jobs.filter(j => (j.tags || []).includes(State.activeTag));

  if (!filtered.length) {
    el.innerHTML = '<p class="text-gray-600 text-xs px-2 py-4 text-center">Job이 없습니다</p>';
    return;
  }

  el.innerHTML = filtered.map(job => `
    <div class="job-item ${State.selectedJob?.id === job.id ? 'active' : ''}"
         onclick="App.selectJob('${job.id}')">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-200 truncate">${escapeHtml(job.name)}</span>
        ${getJobRunningCount(job.id) > 0
          ? `<span class="badge badge-running">${getJobRunningCount(job.id)} 실행중</span>` : ''}
      </div>
      ${job.description
        ? `<p class="text-xs text-gray-500 mt-0.5 truncate">${escapeHtml(job.description)}</p>` : ''}
      ${(job.tags || []).length
        ? `<div class="mt-1 flex flex-wrap gap-1">${(job.tags||[]).map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

function getJobRunningCount(jobId) {
  return Object.values(State.activeProcesses).filter(p => p.job_id === jobId).length;
}

// ─── Job View ─────────────────────────────────────────────────────
function selectJob(jobId) {
  const job = State.jobs.find(j => j.id === jobId);
  if (!job) return;
  State.selectedJob = job;

  document.getElementById('welcome-view').classList.add('hidden');
  document.getElementById('job-view').classList.remove('hidden');

  document.getElementById('jv-name').textContent = job.name;
  document.getElementById('jv-desc').textContent = job.description || '';
  document.getElementById('jv-tags').innerHTML = (job.tags || [])
    .map(t => `<span class="tag">${t}</span>`).join('');

  renderJobList();
  renderActiveProcesses();
  loadHistory(true);

  const running = Object.entries(State.activeProcesses)
    .filter(([, p]) => p.job_id === jobId);
  if (running.length > 0) {
    attachLog(running[0][0]);
  }
}

function renderActiveProcesses() {
  const el = document.getElementById('active-processes');
  if (!el) return;
  const procs = Object.entries(State.activeProcesses)
    .filter(([, p]) => !State.selectedJob || p.job_id === State.selectedJob.id);

  if (!procs.length) {
    el.innerHTML = '<span class="text-xs text-gray-600">실행 중인 프로세스 없음</span>';
    return;
  }

  el.innerHTML = procs.map(([runId, p]) => `
    <div class="proc-chip ${State.activeRunId === runId ? 'ring-1 ring-blue-500' : ''}"
         onclick="App.attachLog('${runId}')">
      <span class="log-dot"></span>
      <span class="text-blue-300">${runId.slice(0, 8)}</span>
      <span class="text-gray-400">PID ${p.pid}</span>
      <span class="text-gray-500">${elapsed(p.started_at)}</span>
      <span class="kill-btn" onclick="event.stopPropagation(); App.killProcess('${runId}')">✕</span>
    </div>
  `).join('');
}

// ─── Log Viewer ───────────────────────────────────────────────────
function appendLog(text, cls = '') {
  const el = document.getElementById('log-viewer');
  if (!el) return;
  const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const line = document.createElement('div');
  line.className = `log-line ${cls}`;
  line.innerHTML = `<span class="log-ts">${now}</span>${escapeHtml(String(text))}`;
  el.appendChild(line);
  if (State.autoScroll) el.scrollTop = el.scrollHeight;
}

function clearLog() {
  const el = document.getElementById('log-viewer');
  if (el) el.innerHTML = '';
  State.activeRunId = null;
  const rid = document.getElementById('log-run-id');
  if (rid) rid.textContent = '';
  const badge = document.getElementById('log-status-badge');
  if (badge) badge.className = 'hidden';
}

function setLogStatus(status) {
  const el = document.getElementById('log-status-badge');
  if (!el) return;
  el.className = '';
  el.innerHTML = statusBadge(status);
}

function attachLog(runId) {
  if (State.ws) { State.ws.close(); State.ws = null; }

  State.activeRunId = runId;
  clearLog();
  const ridEl = document.getElementById('log-run-id');
  if (ridEl) ridEl.textContent = `run: ${runId.slice(0, 8)}...`;
  setLogStatus('RUNNING');

  const ws = new WebSocket(API.wsUrl(`/ws/logs/${runId}`));
  State.ws = ws;

  ws.onopen = () => appendLog('WebSocket 연결됨', 'system');

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'log') {
      appendLog(msg.line);
    } else if (msg.type === 'done') {
      setLogStatus(msg.status || 'COMPLETED');
      appendLog(`--- 종료: ${msg.status || 'COMPLETED'} ---`, 'system');
      ws.close();
      pollProcesses();
      loadHistory(true);
    } else if (msg.type === 'error') {
      appendLog(`에러: ${msg.message}`, 'stderr');
    }
  };

  ws.onerror = () => appendLog('WebSocket 오류', 'stderr');
  ws.onclose = () => appendLog('WebSocket 연결 종료', 'system');

  renderActiveProcesses();
}

function toggleAutoScroll() {
  State.autoScroll = !State.autoScroll;
  const btn = document.getElementById('btn-autoscroll');
  if (btn) {
    btn.textContent = `↓ 자동스크롤 ${State.autoScroll ? 'ON' : 'OFF'}`;
  }
}

// ─── Run Modal ────────────────────────────────────────────────────
function openRunModal() {
  if (!State.selectedJob) return;
  const job = State.selectedJob;

  const nameEl = document.getElementById('modal-job-name');
  if (nameEl) nameEl.textContent = `Job: ${job.name}`;

  const paramsEl = document.getElementById('modal-params');
  if (!paramsEl) return;

  if (!job.params || !job.params.length) {
    paramsEl.innerHTML = '<p class="text-gray-500 text-sm">이 Job은 파라미터가 없습니다.</p>';
  } else {
    paramsEl.innerHTML = job.params.map(p => `
      <div>
        <label class="param-label">${escapeHtml(p.label || p.name)}
          <span class="text-gray-600">(${p.type})</span>
        </label>
        ${p.type === 'bool'
          ? `<select id="param-${p.name}" class="param-input">
               <option value="false" ${!p.default ? 'selected' : ''}>False</option>
               <option value="true"  ${p.default  ? 'selected' : ''}>True</option>
             </select>`
          : `<input id="param-${p.name}" type="${p.type === 'int' || p.type === 'float' ? 'number' : 'text'}"
               class="param-input" value="${p.default ?? ''}"
               placeholder="${p.default ?? ''}" />`
        }
      </div>
    `).join('');
  }

  const modal = document.getElementById('run-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeRunModal() {
  const modal = document.getElementById('run-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitRun() {
  const job = State.selectedJob;
  if (!job) return;

  const params = {};
  (job.params || []).forEach(p => {
    const el = document.getElementById(`param-${p.name}`);
    if (!el) return;
    let val = el.value;
    if (p.type === 'int')   val = parseInt(val, 10);
    if (p.type === 'float') val = parseFloat(val);
    if (p.type === 'bool')  val = val === 'true';
    params[p.name] = val;
  });

  closeRunModal();

  try {
    const run = await API.post(`/api/jobs/${job.id}/run`, { params });
    toast(`▶ 실행 시작: ${run.run_id.slice(0,8)}`, 'success');
    State.activeProcesses[run.run_id] = {
      job_id: run.job_id, job_name: run.job_name,
      pid: run.pid, started_at: run.started_at,
    };
    renderActiveProcesses();
    renderJobList();
    attachLog(run.run_id);
    updateActiveBadge();
  } catch (e) {
    toast('실행 실패: ' + e.message, 'error');
  }
}

// ─── Kill ─────────────────────────────────────────────────────────
async function killProcess(runId) {
  if (!confirm(`run_id ${runId.slice(0,8)}... 을(를) 강제 종료하시겠습니까?`)) return;
  try {
    await API.delete(`/api/processes/${runId}`);
    toast(`⬛ 강제 종료: ${runId.slice(0,8)}`, 'info');
    delete State.activeProcesses[runId];
    renderActiveProcesses();
    renderJobList();
    updateActiveBadge();
    loadHistory(true);
  } catch (e) {
    toast('종료 실패: ' + e.message, 'error');
  }
}

// ─── Process Polling ──────────────────────────────────────────────
async function pollProcesses() {
  try {
    const data = await API.get('/api/processes');
    const newMap = {};
    data.processes.forEach(p => {
      newMap[p.id] = { job_id: p.job_id, job_name: p.job_name,
                       pid: p.pid, started_at: p.started_at };
    });
    State.activeProcesses = newMap;
    renderActiveProcesses();
    renderJobList();
    updateActiveBadge();
  } catch (_) {}
}

function updateActiveBadge() {
  const count = Object.keys(State.activeProcesses).length;
  const dot   = document.querySelector('#active-badge span:first-child');
  const countEl = document.getElementById('active-count');
  if (countEl) countEl.textContent = `${count}개 실행 중`;
  if (dot) dot.className = `w-2 h-2 rounded-full ${count > 0 ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`;
}

// ─── History ──────────────────────────────────────────────────────
async function loadHistory(reset = true) {
  if (reset) State.historyPage = 1;
  const jobFilter = State.selectedJob ? `&job_id=${State.selectedJob.id}` : '';
  try {
    const data = await API.get(`/api/history?page=${State.historyPage}&size=20${jobFilter}`);
    renderHistory(data.items, reset);
    State.historyHasMore = State.historyPage < data.pages;
    const moreBtn = document.getElementById('history-more-btn');
    if (moreBtn) moreBtn.classList.toggle('hidden', !State.historyHasMore);
  } catch (e) {
    toast('이력 로드 실패: ' + e.message, 'error');
  }
}

async function loadMoreHistory() {
  State.historyPage++;
  await loadHistory(false);
}

function renderHistory(items, reset) {
  const el = document.getElementById('history-list');
  if (!el) return;
  if (reset) el.innerHTML = '';

  if (!items.length && reset) {
    el.innerHTML = '<p class="text-gray-600 text-xs px-2 py-4 text-center">이력 없음</p>';
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="flex items-center justify-between gap-1">
        <span class="text-xs font-semibold text-gray-300 truncate flex-1">${escapeHtml(item.job_name)}</span>
        ${statusBadge(item.status)}
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-xs text-gray-600">${fmtTime(item.started_at)}</span>
        <div class="flex gap-1.5">
          <button onclick="App.showLogModal('${item.id}')"
            class="text-xs text-blue-400 hover:text-blue-300 transition">로그</button>
          <button onclick="App.deleteHistory('${item.id}', this)"
            class="text-xs text-red-500 hover:text-red-400 transition">삭제</button>
        </div>
      </div>
    `;
    el.appendChild(div);
  });
}

async function showLogModal(runId) {
  const modal = document.getElementById('log-modal');
  if (modal) modal.classList.remove('hidden');
  const logEl = document.getElementById('lm-log');
  const titleEl = document.getElementById('lm-title');
  const metaEl = document.getElementById('lm-meta');
  if (logEl) logEl.textContent = '로딩 중...';
  if (titleEl) titleEl.textContent = '실행 로그';
  if (metaEl) metaEl.textContent = '';

  try {
    const data = await API.get(`/api/history/${runId}`);
    if (titleEl) titleEl.textContent = data.job_name;
    if (metaEl) metaEl.textContent =
      `run_id: ${runId.slice(0,8)} | 상태: ${data.status} | 시작: ${fmtTime(data.started_at)}`;
    if (logEl) logEl.textContent = data.log_output || '(로그 없음)';
  } catch (e) {
    if (logEl) logEl.textContent = '로그 로드 실패: ' + e.message;
  }
}

function closeLogModal() {
  const modal = document.getElementById('log-modal');
  if (modal) modal.classList.add('hidden');
}

async function deleteHistory(runId, btn) {
  if (!confirm('이 실행 이력을 삭제하시겠습니까?')) return;
  try {
    await API.delete(`/api/history/${runId}`);
    btn.closest('.history-item').remove();
    toast('이력 삭제 완료', 'info');
  } catch (e) {
    toast('삭제 실패: ' + e.message, 'error');
  }
}

// ─── Filters ──────────────────────────────────────────────────────
function filterTag(tag) {
  State.activeTag = tag;
  renderTagFilters();
  renderJobList();
}

// ─── Refresh All ──────────────────────────────────────────────────
async function refreshAll() {
  await loadJobs();
  await pollProcesses();
  await loadHistory(true);
  toast('새로고침 완료', 'info');
}

// ─── App entry point ──────────────────────────────────────────────
window.App = {
  selectJob, openRunModal, closeRunModal, submitRun,
  killProcess, attachLog, clearLog, toggleAutoScroll,
  loadHistory, loadMoreHistory, showLogModal, closeLogModal, deleteHistory,
  filterTag, refreshAll, pollProcesses,
};

(async () => {
  await loadJobs();
  await pollProcesses();
  await loadHistory(true);

  // 5초마다 프로세스 폴링
  setInterval(pollProcesses, 5000);
  // 30초마다 이력 갱신
  setInterval(() => loadHistory(true), 30000);
})();
