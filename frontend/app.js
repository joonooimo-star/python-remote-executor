/**
 * Remote Controller — Frontend App
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
  // 데스크탑 WebSocket + run
  activeRunId: null,
  autoScroll: true,
  ws: null,
  // 모바일 WebSocket + run
  mActiveRunId: null,
  mAutoScroll: true,
  mWs: null,
  // 공용
  historyPage: 1,
  historyHasMore: false,
  activeProcesses: {},   // { run_id: {job_id, job_name, pid, started_at} }
  mobileTab: 'jobs',     // 'jobs' | 'monitor' | 'history'
};

// ─── Helpers ──────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function isMobile() { return window.innerWidth <= 767; }

function escapeHtml(t) {
  return String(t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
}
function elapsed(startedAt, finishedAt) {
  const s   = new Date(startedAt);
  const e   = finishedAt ? new Date(finishedAt) : new Date();
  const sec = Math.floor((e - s) / 1000);
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function statusBadge(status) {
  const map = {
    RUNNING:   { cls:'badge-running',   icon:'●' },
    COMPLETED: { cls:'badge-completed', icon:'✓' },
    FAILED:    { cls:'badge-failed',    icon:'✗' },
    KILLED:    { cls:'badge-killed',    icon:'■' },
    PENDING:   { cls:'badge-pending',   icon:'○' },
  };
  const s = map[status] || { cls:'badge-pending', icon:'?' };
  return `<span class="badge ${s.cls}">${s.icon} ${status}</span>`;
}
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── 모바일 탭 전환 ───────────────────────────────────────────────
function switchTab(tab) {
  State.mobileTab = tab;

  // 탭바 active 표시
  document.querySelectorAll('.tabbar-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // 모든 모바일 패널 숨기기
  ['mobileJobs', 'mobileMonitor', 'mobileHistory'].forEach(id => {
    const el = $(id);
    if (el) el.classList.remove('active');
  });

  // 선택된 탭 패널 표시
  if (tab === 'jobs') {
    $('mobileJobs').classList.add('active');
  } else if (tab === 'monitor') {
    $('mobileMonitor').classList.add('active');
  } else if (tab === 'history') {
    $('mobileHistory').classList.add('active');
    loadHistory(true);
  }
}

// ─── Job List ─────────────────────────────────────────────────────
async function loadJobs() {
  try {
    const data = await API.get('/api/jobs');
    State.jobs = data.jobs;
    renderTagFilters();
    renderJobList();
    const cnt = `${data.total}개`;
    if ($('job-count'))        $('job-count').textContent = cnt;
    if ($('job-count-mobile')) $('job-count-mobile').textContent = cnt;
  } catch (e) {
    toast('Job 목록 로드 실패: ' + e.message, 'error');
  }
}

function _tagHtml(containerId) {
  const allTags = new Set(['all']);
  State.jobs.forEach(j => (j.tags||[]).forEach(t => allTags.add(t)));
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = [...allTags].map(tag =>
    `<span class="tag-btn ${State.activeTag===tag?'active':''}"
           onclick="App.filterTag('${tag}')">${tag}</span>`
  ).join('');
}

function renderTagFilters() {
  _tagHtml('tag-filters');
  _tagHtml('tag-filters-mobile');
}

function _jobListHtml(jobs) {
  if (!jobs.length) return '<p class="empty-small">Job이 없습니다</p>';
  return jobs.map(job => {
    const runCnt = Object.values(State.activeProcesses).filter(p=>p.job_id===job.id).length;
    return `
      <div class="job-item ${State.selectedJob?.id===job.id?'selected':''}"
           onclick="App.selectJob('${job.id}')">
        <div class="job-item-row">
          <span class="job-item-name">${escapeHtml(job.name)}</span>
          ${runCnt>0?`<span class="badge badge-running">${runCnt} 실행중</span>`:''}
        </div>
        ${job.description?`<p class="job-item-desc">${escapeHtml(job.description)}</p>`:''}
        <div class="job-item-tags">
          ${(job.tags||[]).map(t=>`<span class="tag-chip">${t}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderJobList() {
  const filtered = State.activeTag==='all'
    ? State.jobs
    : State.jobs.filter(j=>(j.tags||[]).includes(State.activeTag));
  const html = _jobListHtml(filtered);
  ['job-list','job-list-mobile'].forEach(id=>{
    const el = $(id);
    if (el) el.innerHTML = html;
  });
}

// ─── Job View ─────────────────────────────────────────────────────
function selectJob(jobId) {
  const job = State.jobs.find(j=>j.id===jobId);
  if (!job) return;
  State.selectedJob = job;

  if (isMobile()) {
    // ── 모바일 ──
    // welcome 숨기고 job-view 표시
    const mWelcome = $('mobile-welcome');
    const mJobView = $('mobile-job-view');
    if (mWelcome) mWelcome.style.display = 'none';
    if (mJobView) {
      mJobView.classList.remove('hidden');
      mJobView.style.display = 'flex';
    }

    if ($('m-jv-name')) $('m-jv-name').textContent = job.name;
    if ($('m-jv-desc')) $('m-jv-desc').textContent = job.description || '';

    renderJobList();
    renderMobileActiveProcesses();
    loadHistory(true);

    // 실행 중인 것 자동 연결
    const running = Object.keys(State.activeProcesses)
      .filter(rid=>State.activeProcesses[rid].job_id===jobId);
    if (running.length>0) attachMobileLog(running[0]);

    // monitor 탭으로 이동
    switchTab('monitor');
  } else {
    // ── 데스크탑 ──
    $('welcome-view').classList.add('hidden');
    $('job-view').classList.remove('hidden');

    $('jv-name').textContent = job.name;
    $('jv-desc').textContent = job.description || '';
    $('jv-tags').innerHTML = (job.tags||[]).map(t=>`<span class="tag-chip">${t}</span>`).join('');

    renderJobList();
    renderActiveProcesses();
    loadHistory(true);

    const running = Object.keys(State.activeProcesses)
      .filter(rid=>State.activeProcesses[rid].job_id===jobId);
    if (running.length>0) attachLog(running[0]);
  }
}

// 모바일 뒤로가기: monitor -> jobs
function mobileGoBack() {
  const mWelcome = $('mobile-welcome');
  const mJobView = $('mobile-job-view');
  State.selectedJob = null;
  if (mWelcome) mWelcome.style.display = '';
  if (mJobView) { mJobView.classList.add('hidden'); mJobView.style.display = 'none'; }
  renderJobList();
  switchTab('jobs');
}

// ─── Active Processes (데스크탑) ──────────────────────────────────
function renderActiveProcesses() {
  const el = $('active-processes');
  if (!el) return;
  const procs = Object.entries(State.activeProcesses)
    .filter(([,p])=>!State.selectedJob||p.job_id===State.selectedJob.id);

  if (!procs.length) {
    el.innerHTML = '<span class="no-proc">실행 중인 프로세스 없음</span>';
    return;
  }
  el.innerHTML = procs.map(([runId,p])=>`
    <div class="proc-chip ${State.activeRunId===runId?'proc-chip-active':''}"
         onclick="App.attachLog('${runId}')">
      <span class="proc-dot"></span>
      <span class="proc-id">${runId.slice(0,8)}</span>
      <span class="proc-pid">PID ${p.pid}</span>
      <span class="proc-elapsed">${elapsed(p.started_at)}</span>
      <button class="proc-kill" onclick="event.stopPropagation(); App.killProcess('${runId}')">✕ 종료</button>
    </div>
  `).join('');
}

// ─── Active Processes (모바일) ────────────────────────────────────
function renderMobileActiveProcesses() {
  const el = $('m-active-processes');
  if (!el) return;
  const procs = Object.entries(State.activeProcesses)
    .filter(([,p])=>!State.selectedJob||p.job_id===State.selectedJob.id);

  if (!procs.length) {
    el.innerHTML = '<span class="no-proc">실행 중인 프로세스 없음</span>';
    return;
  }
  el.innerHTML = procs.map(([runId,p])=>`
    <div class="proc-chip ${State.mActiveRunId===runId?'proc-chip-active':''}"
         onclick="App.attachMobileLog('${runId}')">
      <span class="proc-dot"></span>
      <span class="proc-id">${runId.slice(0,8)}</span>
      <span class="proc-pid">PID ${p.pid}</span>
      <span class="proc-elapsed">${elapsed(p.started_at)}</span>
      <button class="proc-kill" onclick="event.stopPropagation(); App.killProcess('${runId}')">✕ 종료</button>
    </div>
  `).join('');
}

function updateActiveBadge() {
  const count   = Object.keys(State.activeProcesses).length;
  const badge   = $('active-badge');
  const dot     = document.querySelector('#active-badge .badge-dot');
  const countEl = $('active-count');
  if (countEl) countEl.textContent = `${count}개 실행 중`;
  if (dot) {
    dot.classList.toggle('dot-active', count>0);
    dot.classList.toggle('dot-idle',   count===0);
  }
  if (badge) badge.classList.toggle('is-active', count>0);

  const hBadge = $('historyBadge');
  if (hBadge) {
    if (count>0) { hBadge.textContent=count; hBadge.classList.remove('hidden'); }
    else           hBadge.classList.add('hidden');
  }
}

// ─── Log Viewer (데스크탑) ────────────────────────────────────────
function appendLog(text, cls='') {
  const el = $('log-viewer');
  if (!el) return;
  const now  = new Date().toLocaleTimeString('ko-KR',{hour12:false});
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
  const rid = $('log-run-id'); if (rid) rid.textContent='';
  const badge = $('log-status-badge'); if (badge){badge.textContent='';badge.className='hidden';}
}

function setLogStatus(status) {
  const el = $('log-status-badge');
  if (!el) return;
  el.className='';
  el.innerHTML = statusBadge(status);
}

function attachLog(runId) {
  if (State.ws) { State.ws.close(); State.ws=null; }
  State.activeRunId = runId;
  clearLog();
  const ridEl = $('log-run-id'); if (ridEl) ridEl.textContent=`run: ${runId.slice(0,8)}…`;
  setLogStatus('RUNNING');

  const ws = new WebSocket(API.wsUrl(`/ws/logs/${runId}`));
  State.ws = ws;

  ws.onopen  = ()=>appendLog('WebSocket 연결됨 ✓','log-system');
  ws.onerror = ()=>appendLog('WebSocket 오류','log-err');
  ws.onclose = ()=>appendLog('WebSocket 연결 종료','log-system');
  ws.onmessage = (ev)=>{
    const msg = JSON.parse(ev.data);
    if (msg.type==='log') {
      appendLog(msg.line);
    } else if (msg.type==='done') {
      setLogStatus(msg.status||'COMPLETED');
      appendLog(`─── 종료: ${msg.status||'COMPLETED'} (exit: ${msg.exit_code??'-'}) ───`,'log-system');
      ws.close();
      pollProcesses();
      loadHistory(true);
    } else if (msg.type==='error') {
      appendLog('에러: '+msg.message,'log-err');
    }
  };
  renderActiveProcesses();
}

function toggleAutoScroll() {
  State.autoScroll = !State.autoScroll;
  const btn = $('btn-autoscroll');
  if (btn) btn.textContent=`↓ 자동스크롤 ${State.autoScroll?'ON':'OFF'}`;
}

// ─── Log Viewer (모바일) ──────────────────────────────────────────
function appendMobileLog(text, cls='') {
  const el = $('m-log-viewer');
  if (!el) return;
  const now  = new Date().toLocaleTimeString('ko-KR',{hour12:false});
  const line = document.createElement('div');
  line.className = `log-line ${cls}`;
  line.innerHTML = `<span class="log-ts">[${now}]</span> ${escapeHtml(String(text))}`;
  el.appendChild(line);
  if (State.mAutoScroll) el.scrollTop = el.scrollHeight;
}

function clearMobileLog() {
  const el = $('m-log-viewer');
  if (el) el.innerHTML = '';
  State.mActiveRunId = null;
  const badge = $('m-log-status-badge');
  if (badge) { badge.textContent=''; badge.className='hidden'; }
}

function setMobileLogStatus(status) {
  const el = $('m-log-status-badge');
  if (!el) return;
  el.className='';
  el.innerHTML = statusBadge(status);
}

function attachMobileLog(runId) {
  if (State.mWs) { State.mWs.close(); State.mWs=null; }
  State.mActiveRunId = runId;
  clearMobileLog();
  setMobileLogStatus('RUNNING');

  const ws = new WebSocket(API.wsUrl(`/ws/logs/${runId}`));
  State.mWs = ws;

  ws.onopen  = ()=>appendMobileLog('WebSocket 연결됨 ✓','log-system');
  ws.onerror = ()=>appendMobileLog('WebSocket 오류','log-err');
  ws.onclose = ()=>appendMobileLog('WebSocket 연결 종료','log-system');
  ws.onmessage = (ev)=>{
    const msg = JSON.parse(ev.data);
    if (msg.type==='log') {
      appendMobileLog(msg.line);
    } else if (msg.type==='done') {
      setMobileLogStatus(msg.status||'COMPLETED');
      appendMobileLog(`─── 종료: ${msg.status||'COMPLETED'} (exit: ${msg.exit_code??'-'}) ───`,'log-system');
      ws.close();
      pollProcesses();
      loadHistory(true);
    } else if (msg.type==='error') {
      appendMobileLog('에러: '+msg.message,'log-err');
    }
  };
  renderMobileActiveProcesses();
}

// ─── Run Modal ────────────────────────────────────────────────────
function openRunModal() {
  if (!State.selectedJob) return;
  const job    = State.selectedJob;
  const nameEl = $('modal-job-name');
  if (nameEl) nameEl.textContent = job.name;

  const paramsEl = $('modal-params');
  if (!paramsEl) return;

  if (!job.params||!job.params.length) {
    paramsEl.innerHTML='<p class="no-params">이 Job은 파라미터가 없습니다. 바로 실행됩니다.</p>';
  } else {
    paramsEl.innerHTML = job.params.map(p=>`
      <div class="param-group">
        <label class="param-label">${escapeHtml(p.label||p.name)}<span class="param-type">${p.type}</span></label>
        ${p.type==='bool'
          ?`<select id="param-${p.name}" class="param-input">
               <option value="false" ${!p.default?'selected':''}>False</option>
               <option value="true"  ${p.default?'selected':''}>True</option>
             </select>`
          :`<input id="param-${p.name}"
               type="${p.type==='int'||p.type==='float'?'number':'text'}"
               class="param-input"
               value="${p.default??''}"
               placeholder="${p.default??''}" />`
        }
      </div>`).join('');
  }
  $('run-modal').classList.remove('hidden');
}

function closeRunModal() { $('run-modal').classList.add('hidden'); }

async function submitRun() {
  const job = State.selectedJob;
  if (!job) return;

  const params = {};
  (job.params||[]).forEach(p=>{
    const el = document.getElementById(`param-${p.name}`);
    if (!el) return;
    let val = el.value;
    if (p.type==='int')   val=parseInt(val,10);
    if (p.type==='float') val=parseFloat(val);
    if (p.type==='bool')  val=val==='true';
    params[p.name] = val;
  });

  closeRunModal();
  try {
    const run = await API.post(`/api/jobs/${job.id}/run`,{params});
    toast(`▶ 실행 시작: ${run.run_id.slice(0,8)}`,'success');
    State.activeProcesses[run.run_id] = {
      job_id: run.job_id, job_name: run.job_name,
      pid: run.pid, started_at: run.started_at,
    };
    renderActiveProcesses();
    renderMobileActiveProcesses();
    renderJobList();
    updateActiveBadge();
    if (isMobile()) {
      attachMobileLog(run.run_id);
    } else {
      attachLog(run.run_id);
    }
  } catch (e) {
    toast('실행 실패: '+e.message,'error');
  }
}

// ─── Kill ─────────────────────────────────────────────────────────
async function killProcess(runId) {
  if (!confirm(`run_id ${runId.slice(0,8)}… 을(를) 강제 종료하시겠습니까?`)) return;
  try {
    await API.del(`/api/processes/${runId}`);
    toast('⬛ 강제 종료 완료','info');
    delete State.activeProcesses[runId];
    renderActiveProcesses();
    renderMobileActiveProcesses();
    renderJobList();
    updateActiveBadge();
    loadHistory(true);
  } catch (e) {
    toast('종료 실패: '+e.message,'error');
  }
}

// ─── Process Polling ──────────────────────────────────────────────
async function pollProcesses() {
  try {
    const data = await API.get('/api/processes');
    const newMap = {};
    data.processes.forEach(p=>{
      newMap[p.id]={job_id:p.job_id,job_name:p.job_name,pid:p.pid,started_at:p.started_at};
    });
    State.activeProcesses = newMap;
    renderActiveProcesses();
    renderMobileActiveProcesses();
    renderJobList();
    updateActiveBadge();
  } catch(_) {}
}

// ─── History ──────────────────────────────────────────────────────
async function loadHistory(reset=true) {
  if (reset) State.historyPage=1;
  const jobFilter = State.selectedJob?`&job_id=${State.selectedJob.id}`:'';
  try {
    const data = await API.get(`/api/history?page=${State.historyPage}&size=20${jobFilter}`);
    renderHistory(data.items, reset);
    renderHistoryMobile(data.items, reset);
    State.historyHasMore = State.historyPage < data.pages;
    [$('history-more-btn'),$('history-more-btn-mobile')].forEach(btn=>{
      if (btn) btn.classList.toggle('hidden',!State.historyHasMore);
    });
  } catch(e) {
    toast('이력 로드 실패: '+e.message,'error');
  }
}

async function loadMoreHistory() {
  State.historyPage++;
  await loadHistory(false);
}

function _historyItemHtml(item) {
  return `
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
    </div>`;
}

function renderHistory(items, reset) {
  const el = $('history-list');
  if (!el) return;
  if (reset) el.innerHTML='';
  if (!items.length&&reset){el.innerHTML='<p class="empty-small">이력 없음</p>';return;}
  items.forEach(item=>{
    const div=document.createElement('div');
    div.className='history-item';
    div.dataset.runId=item.id;
    div.innerHTML=_historyItemHtml(item);
    el.appendChild(div);
  });
}

function renderHistoryMobile(items, reset) {
  const el = $('history-list-mobile');
  if (!el) return;
  if (reset) el.innerHTML='';
  if (!items.length&&reset){el.innerHTML='<p class="empty-small">이력 없음</p>';return;}
  items.forEach(item=>{
    const div=document.createElement('div');
    div.className='history-item';
    div.dataset.runId=item.id;
    div.innerHTML=_historyItemHtml(item);
    el.appendChild(div);
  });
}

async function showLogModal(runId) {
  $('log-modal').classList.remove('hidden');
  $('lm-log').textContent  = '로딩 중...';
  $('lm-title').textContent= '실행 로그';
  $('lm-meta').textContent = '';
  try {
    const data = await API.get(`/api/history/${runId}`);
    $('lm-title').textContent = data.job_name;
    $('lm-meta').textContent  = `run_id: ${runId.slice(0,8)} | ${data.status} | ${fmtTime(data.started_at)}`;
    $('lm-log').textContent   = data.log_output||'(로그 없음)';
  } catch(e) {
    $('lm-log').textContent='로그 로드 실패: '+e.message;
  }
}

function closeLogModal() { $('log-modal').classList.add('hidden'); }

async function deleteHistory(runId, btn) {
  if (!confirm('이 실행 이력을 삭제하시겠습니까?')) return;
  try {
    await API.del(`/api/history/${runId}`);
    // data-run-id로 정확하게 제거
    document.querySelectorAll(`.history-item[data-run-id="${runId}"]`).forEach(el=>el.remove());
    toast('이력 삭제 완료','info');
  } catch(e) {
    toast('삭제 실패: '+e.message,'error');
  }
}

// ─── Tag Filter ───────────────────────────────────────────────────
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
  toast('새로고침 완료','info');
}

// ─── Expose to HTML ───────────────────────────────────────────────
window.App = {
  selectJob, openRunModal, closeRunModal, submitRun,
  killProcess, attachLog, attachMobileLog, clearLog, clearMobileLog,
  toggleAutoScroll, loadHistory, loadMoreHistory,
  showLogModal, closeLogModal, deleteHistory,
  filterTag, refreshAll, pollProcesses,
  switchTab, mobileGoBack,
};

// ─── Bootstrap ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // ── 공통 버튼 이벤트 ──
  const refreshAllBtn = $('refreshAllBtn');
  if (refreshAllBtn) refreshAllBtn.addEventListener('click', refreshAll);

  const historyRefreshBtn = $('historyRefreshBtn');
  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', ()=>loadHistory(true));

  const btnRun = $('btn-run');
  if (btnRun) btnRun.addEventListener('click', openRunModal);

  const btnClearlog = $('btn-clearlog');
  if (btnClearlog) btnClearlog.addEventListener('click', clearLog);

  const btnAutoscroll = $('btn-autoscroll');
  if (btnAutoscroll) btnAutoscroll.addEventListener('click', toggleAutoScroll);

  const historyMoreBtn = $('history-more-btn');
  if (historyMoreBtn) historyMoreBtn.addEventListener('click', loadMoreHistory);

  // ── 모달 버튼 ──
  const runModalCloseBtn = $('runModalCloseBtn');
  if (runModalCloseBtn) runModalCloseBtn.addEventListener('click', closeRunModal);

  const runModalCancelBtn = $('runModalCancelBtn');
  if (runModalCancelBtn) runModalCancelBtn.addEventListener('click', closeRunModal);

  const runModalSubmitBtn = $('runModalSubmitBtn');
  if (runModalSubmitBtn) runModalSubmitBtn.addEventListener('click', submitRun);

  const logModalCloseBtn = $('logModalCloseBtn');
  if (logModalCloseBtn) logModalCloseBtn.addEventListener('click', closeLogModal);

  // 모달 배경 클릭으로 닫기
  const runModal = $('run-modal');
  if (runModal) runModal.addEventListener('click', e=>{
    if (e.target === runModal) closeRunModal();
  });
  const logModal = $('log-modal');
  if (logModal) logModal.addEventListener('click', e=>{
    if (e.target === logModal) closeLogModal();
  });

  // ── 모바일 전용 버튼 ──
  const mBtnRun = $('m-btn-run');
  if (mBtnRun) mBtnRun.addEventListener('click', openRunModal);

  const mBtnClearlog = $('m-btn-clearlog');
  if (mBtnClearlog) mBtnClearlog.addEventListener('click', clearMobileLog);

  const mobileBackBtn = $('mobileBackBtn');
  if (mobileBackBtn) mobileBackBtn.addEventListener('click', mobileGoBack);

  const mHistoryRefreshBtn = $('mHistoryRefreshBtn');
  if (mHistoryRefreshBtn) mHistoryRefreshBtn.addEventListener('click', ()=>loadHistory(true));

  const historyMoreBtnMobile = $('history-more-btn-mobile');
  if (historyMoreBtnMobile) historyMoreBtnMobile.addEventListener('click', loadMoreHistory);

  // ── 모바일 탭바 버튼 ──
  document.querySelectorAll('.tabbar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // ── 초기화 ──
  if (isMobile()) {
    switchTab('jobs');
  }

  (async () => {
    await loadJobs();
    await pollProcesses();
    await loadHistory(true);
  })();

  setInterval(pollProcesses, 5000);
  setInterval(()=>loadHistory(true), 30000);

  // 화면 크기 변경 대응
  window.addEventListener('resize', ()=>{
    if (isMobile()) {
      switchTab(State.mobileTab);
    } else {
      // 데스크탑 전환 시 모바일 패널 숨기기
      ['mobileJobs','mobileMonitor','mobileHistory'].forEach(id=>{
        const el=$(id); if(el) el.classList.remove('active');
      });
    }
  });
});
