/**
 * Python Remote Executor — Frontend App
 * Vanilla JS, no build step required.
 */

// ─── API helpers ──────────────────────────────────────────────────
const API = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({ detail: r.statusText }))).detail);
    return r.json();
  },
  async post(path, body = {}) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({ detail: r.statusText }))).detail);
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({ detail: r.statusText }))).detail);
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
  activeProcesses: {},  // { run_id: {job_id, job_name, pid, started_at} }
};

// ─── Utility ──────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function escapeHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
}

function elapsed(startedAt, finishedAt) {
  const s = new Date(startedAt);
  const e = finishedAt ? new Date(finishedAt) : new Date();
  const sec = Math.floor((e - s) / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const sc = String(sec % 60).padStart(2, '0');
  return `${m}:${sc}`;
}

function statusBadge(status) {
  const map = {
    RUNNING:   { cls: 'badge-running',   icon: '●' },
    COMPLETED: { cls: 'badge-completed', icon: '✓' },
    FAILED:    { cls: 'badge-failed',    icon: '✗' },
    KILLED:    { cls: 'badge-killed',    icon: '■' },
    PENDING:   { cls: 'badge-pending',   icon: '○' },
  };
  const s = map[status] || { cls: 'badge-pending', icon: '?' };
  return `<span class="badge ${s.cls}">${s.icon} ${status}</span>`;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Job List ─────────────────────────────────────────────────────
async function loadJobs() {
  try {
    const data = await API.get('/api/jobs');
    State.jobs = data.jobs;
    renderTagFilters();
    renderJobList();
    $('job-count').textContent = `${data.total}개`;
  } catch (e) {
    toast('Job 목록 로드 실패: ' + e.message, 'error');
  }
}

function renderTagFilters() {
  const allTags = new Set(['all']);
  State.jobs.forEach(j => (j.tags || []).forEach(t => allTags.add(t)));
  $('tag-filters').innerHTML = [...allTags].map(tag =>
    `<span class="tag-btn ${State.activeTag === tag ? 'active' : ''}"
           onclick="App.filterTag('${tag}')">${tag}</span>`
  ).join('');
}

function renderJobList() {
  const el = $('job-list');
  const filtered = State.activeTag === 'all'
    ? State.jobs
    : State.jobs.filter(j => (j.tags || []).includes(State.activeTag));

  if (!filtered.length) {
    el.innerHTML = '<p class="empty-small">Job이 없습니다</p>';
    return;
  }

  el.innerHTML = filtered.map(job => {
    const runCnt = Object.values(State.activeProcesses).filter(p => p.job_id === job.id).length;
    return `
      <div class="job-item ${State.selectedJob?.id === job.id ? 'selected' : ''}"
           onclick="App.selectJob('${job.id}')">
        <div class="job-item-row">
          <span class="job-item-name">${escapeHtml(job.name)}</span>
          ${runCnt > 0 ? `<span class="badge badge-running">${runCnt} 실행중</span>` : ''}
        </div>
        ${job.description ? `<p class="job-item-desc">${escapeHtml(job.description)}</p>` : ''}
        <div class="job-item-tags">
          ${(job.tags || []).map(t => `<span class="tag-chip">${t}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ─── Job View ─────────────────────────────────────────────────────
function selectJob(jobId) {
  const job = State.jobs.find(j => j.id === jobId);
  if (!job) return;
  State.selectedJob = job;

  $('welcome-view').classList.add('hidden');
  $('job-view').classList.remove('hidden');

  $('jv-name').textContent = job.name;
  $('jv-desc').textContent = job.description || '';
  $('jv-tags').innerHTML = (job.tags || []).map(t => `<span class="tag-chip">${t}</span>`).join('');

  renderJobList();
  renderActiveProcesses();
  loadHistory(true);

  // 이미 실행 중인 것이 있으면 자동 연결
  const running = Object.keys(State.activeProcesses)
    .filter(rid => State.activeProcesses[rid].job_id === jobId);
  if (running.length > 0) attachLog(running[0]);
}

// ─── Active Processes ─────────────────────────────────────────────
function renderActiveProcesses() {
  const el = $('active-processes');
  const procs = Object.entries(State.activeProcesses)
    .filter(([, p]) => !State.selectedJob || p.job_id === State.selectedJob.id);

  if (!procs.length) {
    el.innerHTML = '<span class="no-proc">실행 중인 프로세스 없음</span>';
    return;
  }
  el.innerHTML = procs.map(([runId, p]) => `
    <div class="proc-chip ${State.activeRunId === runId ? 'proc-chip-active' : ''}"
         onclick="App.attachLog('${runId}')">
      <span class="proc-dot"></span>
      <span class="proc-id">${runId.slice(0, 8)}</span>
      <span class="proc-pid">PID ${p.pid}</span>
      <span class="proc-elapsed">${elapsed(p.started_at)}</span>
      <button class="proc-kill" onclick="event.stopPropagation(); App.killProcess('${runId}')">✕ 종료</button>
    </div>
  `).join('');
}

function updateActiveBadge() {
  const count = Object.keys(State.activeProcesses).length;
  const dot = document.querySelector('#active-badge .badge-dot');
  const countEl = $('active-count');
  if (countEl) countEl.textContent = `${count}개 실행 중`;
  if (dot) {
    dot.classList.toggle('dot-active', count > 0);
    dot.classList.toggle('dot-idle', count === 0);
  }
}

// ─── Log Viewer ───────────────────────────────────────────────────
function appendLog(text, cls = '') {
  const el = $('log-viewer');
  if (!el) return;
  const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const line = document.createElement('div');
  line.className = `log-line ${cls}`;
  line.innerHTML = `<span class="log-ts">[${now}]</span> ${escapeHtml(String(text))}`;
  el.appendChild(line);
  if (State.autoScroll) el.scrollTop = el.scrollHeight;
}

function clearLog() {
  const el = $('log-viewer');
  if (el) el.innerHTML = '';
  State.activeRunId = null;
  const rid = $('log-run-id');
  if (rid) rid.textContent = '';
  const badge = $('log-status-badge');
  if (badge) { badge.textContent = ''; badge.className = 'hidden'; }
}

function setLogStatus(status) {
  const el = $('log-status-badge');
  if (!el) return;
  el.className = '';
  el.innerHTML = statusBadge(status);
}

function attachLog(runId) {
  if (State.ws) { State.ws.close(); State.ws = null; }
  State.activeRunId = runId;
  clearLog();

  const ridEl = $('log-run-id');
  if (ridEl) ridEl.textContent = `run: ${runId.slice(0, 8)}…`;
  setLogStatus('RUNNING');

  const ws = new WebSocket(API.wsUrl(`/ws/logs/${runId}`));
  State.ws = ws;

  ws.onopen  = () => appendLog('WebSocket 연결됨 ✓', 'log-system');
  ws.onerror = () => appendLog('WebSocket 오류', 'log-err');
  ws.onclose = () => appendLog('WebSocket 연결 종료', 'log-system');

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'log') {
      appendLog(msg.line);
    } else if (msg.type === 'done') {
      setLogStatus(msg.status || 'COMPLETED');
      appendLog(`─── 종료: ${msg.status || 'COMPLETED'} (exit: ${msg.exit_code ?? '-'}) ───`, 'log-system');
      ws.close();
      pollProcesses();
      loadHistory(true);
    } else if (msg.type === 'error') {
      appendLog('에러: ' + msg.message, 'log-err');
    }
  };

  renderActiveProcesses();
}

function toggleAutoScroll() {
  State.autoScroll = !State.autoScroll;
  const btn = $('btn-autoscroll');
  if (btn) btn.textContent = `↓ 자동스크롤 ${State.autoScroll ? 'ON' : 'OFF'}`;
}

// ─── Run Modal ────────────────────────────────────────────────────
function openRunModal() {
  if (!State.selectedJob) return;
  const job = State.selectedJob;
  const nameEl = $('modal-job-name');
  if (nameEl) nameEl.textContent = job.name;

  const paramsEl = $('modal-params');
  if (!paramsEl) return;

  if (!job.params || !job.params.length) {
    paramsEl.innerHTML = '<p class="no-params">이 Job은 파라미터가 없습니다. 바로 실행됩니다.</p>';
  } else {
    paramsEl.innerHTML = job.params.map(p => `
      <div class="param-group">
        <label class="param-label">${escapeHtml(p.label || p.name)} <span class="param-type">${p.type}</span></label>
        ${p.type === 'bool'
          ? `<select id="param-${p.name}" class="param-input">
               <option value="false" ${!p.default ? 'selected' : ''}>False</option>
               <option value="true"  ${p.default  ? 'selected' : ''}>True</option>
             </select>`
          : `<input id="param-${p.name}"
               type="${p.type === 'int' || p.type === 'float' ? 'number' : 'text'}"
               class="param-input"
               value="${p.default ?? ''}"
               placeholder="${p.default ?? ''}" />`
        }
      </div>
    `).join('');
  }

  $('run-modal').classList.remove('hidden');
}

function closeRunModal() {
  $('run-modal').classList.add('hidden');
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
    toast(`▶ 실행 시작: ${run.run_id.slice(0, 8)}`, 'success');
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
  if (!confirm(`run_id ${runId.slice(0, 8)}… 을(를) 강제 종료하시겠습니까?`)) return;
  try {
    await API.del(`/api/processes/${runId}`);
    toast('⬛ 강제 종료 완료', 'info');
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
      newMap[p.id] = { job_id: p.job_id, job_name: p.job_name, pid: p.pid, started_at: p.started_at };
    });
    State.activeProcesses = newMap;
    renderActiveProcesses();
    renderJobList();
    updateActiveBadge();
  } catch (_) {}
}

// ─── History ──────────────────────────────────────────────────────
async function loadHistory(reset = true) {
  if (reset) State.historyPage = 1;
  const jobFilter = State.selectedJob ? `&job_id=${State.selectedJob.id}` : '';
  try {
    const data = await API.get(`/api/history?page=${State.historyPage}&size=20${jobFilter}`);
    renderHistory(data.items, reset);
    State.historyHasMore = State.historyPage < data.pages;
    const moreBtn = $('history-more-btn');
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
  const el = $('history-list');
  if (reset) el.innerHTML = '';
  if (!items.length && reset) {
    el.innerHTML = '<p class="empty-small">이력 없음</p>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-row">
        <span class="history-name">${escapeHtml(item.job_name)}</span>
        ${statusBadge(item.status)}
      </div>
      <div class="history-meta-row">
        <span class="history-time">${fmtTime(item.started_at)}</span>
        <div class="history-actions">
          <button onclick="App.showLogModal('${item.id}')" class="link-btn">로그</button>
          <button onclick="App.deleteHistory('${item.id}', this)" class="link-btn link-danger">삭제</button>
        </div>
      </div>
    `;
    el.appendChild(div);
  });
}

async function showLogModal(runId) {
  $('log-modal').classList.remove('hidden');
  $('lm-log').textContent = '로딩 중...';
  $('lm-title').textContent = '실행 로그';
  $('lm-meta').textContent  = '';
  try {
    const data = await API.get(`/api/history/${runId}`);
    $('lm-title').textContent = data.job_name;
    $('lm-meta').textContent  = `run_id: ${runId.slice(0,8)} | ${data.status} | ${fmtTime(data.started_at)}`;
    $('lm-log').textContent   = data.log_output || '(로그 없음)';
  } catch (e) {
    $('lm-log').textContent = '로그 로드 실패: ' + e.message;
  }
}

function closeLogModal() {
  $('log-modal').classList.add('hidden');
}

async function deleteHistory(runId, btn) {
  if (!confirm('이 실행 이력을 삭제하시겠습니까?')) return;
  try {
    await API.del(`/api/history/${runId}`);
    btn.closest('.history-item').remove();
    toast('이력 삭제 완료', 'info');
  } catch (e) {
    toast('삭제 실패: ' + e.message, 'error');
  }
}

// ─── Misc ─────────────────────────────────────────────────────────
function filterTag(tag) {
  State.activeTag = tag;
  renderTagFilters();
  renderJobList();
}

async function refreshAll() {
  await loadJobs();
  await pollProcesses();
  await loadHistory(true);
  toast('새로고침 완료', 'info');
}

// ─── Expose to HTML (onclick="App.xxx") ───────────────────────────
window.App = {
  selectJob, openRunModal, closeRunModal, submitRun,
  killProcess, attachLog, clearLog, toggleAutoScroll,
  loadHistory, loadMoreHistory, showLogModal, closeLogModal,
  deleteHistory, filterTag, refreshAll, pollProcesses,
};

// ─── Bootstrap (DOM이 준비된 후 실행) ─────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadJobs();
  await pollProcesses();
  await loadHistory(true);

  setInterval(pollProcesses, 5000);
  setInterval(() => loadHistory(true), 30000);
});
