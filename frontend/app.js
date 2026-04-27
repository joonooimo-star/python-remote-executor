/**
 * Python Remote Executor — Frontend App
 * Vanilla JS, no build step required.
 */

const API = '';   // same origin
let selectedJobId = null;
let currentPage   = 1;
let historyPage   = 1;
let activeWs      = {};   // { run_id: WebSocket }
let allJobs       = [];

// ══════════════════════════════════════════════
//  Utils
// ══════════════════════════════════════════════

function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function statusBadge(status) {
  return `<span class="status-badge status-${status}">${status}</span>`;
}

function formatDuration(start, end) {
  if (!start) return '-';
  const s = new Date(start), e = end ? new Date(end) : new Date();
  const sec = Math.floor((e - s) / 1000);
  const m = Math.floor(sec / 60), ss = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// ══════════════════════════════════════════════
//  Job List (Sidebar)
// ══════════════════════════════════════════════

async function loadJobs() {
  try {
    const data = await apiFetch('/api/jobs');
    allJobs = data.jobs;
    renderTags(allJobs);
    renderJobList(allJobs);
    populateHistoryJobFilter(allJobs);
  } catch (e) {
    $('#jobList').innerHTML = `<div class="empty-state">❌ Job 로드 실패: ${e.message}</div>`;
  }
}

function renderTags(jobs) {
  const tagSet = new Set(['all']);
  jobs.forEach(j => (j.tags || []).forEach(t => tagSet.add(t)));
  const container = $('#tagFilter');
  container.innerHTML = [...tagSet].map(t =>
    `<button class="tag-btn ${t === 'all' ? 'active' : ''}" data-tag="${t}">${t}</button>`
  ).join('');
  container.querySelectorAll('.tag-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      $$('.tag-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tag = btn.dataset.tag;
      const filtered = tag === 'all' ? allJobs : allJobs.filter(j => (j.tags||[]).includes(tag));
      renderJobList(filtered);
    })
  );
}

function renderJobList(jobs) {
  const container = $('#jobList');
  if (!jobs.length) {
    container.innerHTML = '<div class="empty-state">등록된 Job이 없습니다.<br/>jobs/ 폴더에 .py 파일을 추가하세요.</div>';
    return;
  }
  container.innerHTML = jobs.map(j => `
    <div class="job-card ${j.id === selectedJobId ? 'selected' : ''}" data-id="${j.id}">
      <div class="job-card-name">
        <span>⚙️</span> ${escapeHtml(j.name)}
      </div>
      <div class="job-card-desc">${escapeHtml(j.description || '설명 없음')}</div>
      <div class="job-card-tags">
        ${(j.tags||[]).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}
      </div>
      <div class="job-card-actions">
        <button class="btn btn-primary btn-sm run-btn" data-id="${j.id}">▶ 실행</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.job-card').forEach(card =>
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('run-btn')) return;
      $$('.job-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedJobId = card.dataset.id;
    })
  );

  container.querySelectorAll('.run-btn').forEach(btn =>
    btn.addEventListener('click', () => openRunModal(btn.dataset.id))
  );
}

function populateHistoryJobFilter(jobs) {
  const sel = $('#historyJobFilter');
  const current = sel.value;
  sel.innerHTML = '<option value="">전체 Job</option>' +
    jobs.map(j => `<option value="${j.id}">${escapeHtml(j.name)}</option>`).join('');
  sel.value = current;
}

// ══════════════════════════════════════════════
//  Run Modal
// ══════════════════════════════════════════════

function openRunModal(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;

  $('#modalTitle').textContent = `▶ ${job.name}`;

  const params = job.params || [];
  if (!params.length) {
    $('#modalBody').innerHTML = `
      <p class="text-muted text-sm">이 Job은 파라미터가 없습니다.<br/>바로 실행됩니다.</p>`;
  } else {
    $('#modalBody').innerHTML = params.map(p => `
      <div class="form-group">
        <label class="form-label">${escapeHtml(p.label || p.name)}</label>
        <input class="form-input" type="${p.type === 'int' || p.type === 'float' ? 'number' : 'text'}"
          data-name="${p.name}" data-type="${p.type}"
          value="${p.default !== undefined ? p.default : ''}"
          placeholder="${p.default !== undefined ? p.default : ''}"/>
      </div>`).join('');
  }

  $('#runModal').classList.remove('hidden');
  $('#modalRun').onclick = () => executeJob(jobId);
}

function closeRunModal() { $('#runModal').classList.add('hidden'); }

async function executeJob(jobId) {
  const params = {};
  $$('#modalBody .form-input').forEach(inp => {
    const val = inp.value;
    const type = inp.dataset.type;
    params[inp.dataset.name] = type === 'int' ? parseInt(val) :
                                type === 'float' ? parseFloat(val) : val;
  });

  closeRunModal();
  try {
    const run = await apiFetch(`/api/jobs/${jobId}/run`, {
      method: 'POST',
      body: JSON.stringify({ params }),
    });
    toast(`▶ 실행 시작: ${run.job_name}`, 'success');
    openRunPanel(run);
    switchTab('monitor');
  } catch (e) {
    toast(`❌ 실행 실패: ${e.message}`, 'error');
  }
}

// ══════════════════════════════════════════════
//  Run Panel (Monitor Tab)
// ══════════════════════════════════════════════

function openRunPanel(run) {
  // 빈 상태 제거
  const emptyEl = $('.empty-state-main');
  if (emptyEl) emptyEl.remove();

  const panels = $('#runPanels');
  const panelId = `panel-${run.run_id}`;

  // 이미 있으면 스킵
  if (document.getElementById(panelId)) return;

  const panel = document.createElement('div');
  panel.className = 'run-panel';
  panel.id = panelId;
  panel.innerHTML = `
    <div class="run-panel-header">
      <span class="run-panel-title">
        <span class="running-dot" id="dot-${run.run_id}"></span>
        ${escapeHtml(run.job_name)}
      </span>
      <span class="run-panel-meta" id="meta-${run.run_id}">
        PID: ${run.pid} | 시작: ${formatTime(run.started_at)}
      </span>
      <div class="run-panel-actions">
        ${statusBadge(run.status)}
        <button class="btn btn-danger btn-sm kill-btn" data-run="${run.run_id}">⏹ 종료</button>
        <button class="btn btn-ghost btn-sm close-btn" data-panel="${panelId}">✕</button>
      </div>
    </div>
    <pre class="log-box" id="log-${run.run_id}"></pre>
    <div class="log-toolbar">
      <span id="logCount-${run.run_id}">0줄</span>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="autoScroll-${run.run_id}" checked />
        자동 스크롤
      </label>
    </div>
  `;
  panels.prepend(panel);

  // 종료 버튼
  panel.querySelector('.kill-btn').addEventListener('click', async () => {
    await killRun(run.run_id);
  });

  // 패널 닫기
  panel.querySelector('.close-btn').addEventListener('click', () => {
    if (activeWs[run.run_id]) {
      activeWs[run.run_id].close();
      delete activeWs[run.run_id];
    }
    panel.remove();
    if (!$('#runPanels .run-panel')) {
      $('#runPanels').innerHTML = `
        <div class="empty-state-main">
          <div class="empty-icon">▶</div>
          <p>왼쪽에서 Job을 선택하고 <strong>실행</strong> 버튼을 누르세요</p>
        </div>`;
    }
  });

  connectWebSocket(run.run_id, panel);
  updateActiveBadge();
}

function connectWebSocket(runId, panel) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/logs/${runId}`);
  activeWs[runId] = ws;

  const logEl    = $(`#log-${runId}`);
  const countEl  = $(`#logCount-${runId}`);
  const dotEl    = $(`#dot-${runId}`);
  let lineCount  = 0;

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'log') {
      lineCount++;
      const span = document.createElement('span');
      span.className = 'log-line';
      span.textContent = msg.line;
      logEl.appendChild(span);
      logEl.appendChild(document.createTextNode('\n'));

      const autoScroll = $(`#autoScroll-${runId}`);
      if (autoScroll?.checked) logEl.scrollTop = logEl.scrollHeight;
      if (countEl) countEl.textContent = `${lineCount}줄`;

    } else if (msg.type === 'done') {
      const status = msg.status || 'COMPLETED';
      // 상태 배지 교체
      const header = panel.querySelector('.run-panel-actions');
      const badge  = header.querySelector('.status-badge');
      if (badge) badge.outerHTML = statusBadge(status);
      // 점 애니메이션 종료
      if (dotEl) { dotEl.style.animation = 'none'; dotEl.style.background = statusColor(status); }
      // kill 버튼 비활성화
      const killBtn = panel.querySelector('.kill-btn');
      if (killBtn) killBtn.disabled = true;

      appendLogLine(logEl, `\n[${status}] 프로세스 종료${msg.exit_code !== undefined && msg.exit_code !== null ? ` (exit: ${msg.exit_code})` : ''}`, '#94a3b8');
      lineCount++;
      if (countEl) countEl.textContent = `${lineCount}줄`;

      delete activeWs[runId];
      updateActiveBadge();
      // 이력 자동 새로고침 (이력 탭에 있을 때)
      if ($('#tabHistory').classList.contains('active')) loadHistory();
    } else if (msg.type === 'ping') {
      // heartbeat — ignore
    }
  };

  ws.onerror = () => appendLogLine(logEl, '[WebSocket 오류]', '#f87171');
  ws.onclose = () => { delete activeWs[runId]; updateActiveBadge(); };
}

function appendLogLine(el, text, color) {
  const span = document.createElement('span');
  span.className = 'log-line';
  span.style.color = color || '';
  span.textContent = text;
  el.appendChild(span);
  el.appendChild(document.createTextNode('\n'));
  el.scrollTop = el.scrollHeight;
}

function statusColor(status) {
  return { COMPLETED: '#22c55e', FAILED: '#ef4444', KILLED: '#f59e0b' }[status] || '#6b7280';
}

async function killRun(runId) {
  try {
    await apiFetch(`/api/processes/${runId}`, { method: 'DELETE' });
    toast('⏹ 강제 종료 요청 완료', 'success');
  } catch (e) {
    toast(`❌ 종료 실패: ${e.message}`, 'error');
  }
}

function updateActiveBadge() {
  const count = Object.keys(activeWs).length;
  const badge = $('#activeBadge');
  badge.textContent = `● ${count}개 실행 중`;
  badge.className = count > 0 ? 'active-badge' : 'active-badge idle';
}

// ══════════════════════════════════════════════
//  History Tab
// ══════════════════════════════════════════════

async function loadHistory(page = 1) {
  historyPage = page;
  const jobId  = $('#historyJobFilter').value;
  const status = $('#historyStatusFilter').value;

  let url = `/api/history?page=${page}&size=20`;
  if (jobId)  url += `&job_id=${jobId}`;
  if (status) url += `&status=${status}`;

  try {
    const data = await apiFetch(url);
    renderHistoryTable(data);
  } catch (e) {
    $('#historyTable').innerHTML = `<div class="empty-state">❌ 이력 로드 실패: ${e.message}</div>`;
  }
}

function renderHistoryTable(data) {
  if (!data.items.length) {
    $('#historyTable').innerHTML = '<div class="empty-state">실행 이력이 없습니다.</div>';
    $('#historyPager').innerHTML = '';
    return;
  }

  $('#historyTable').innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Job 이름</th>
          <th>상태</th>
          <th>시작 시간</th>
          <th>소요 시간</th>
          <th>종료 코드</th>
          <th>액션</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.map(r => `
          <tr>
            <td>${escapeHtml(r.job_name)}</td>
            <td>${statusBadge(r.status)}</td>
            <td>${formatTime(r.started_at)}</td>
            <td>${formatDuration(r.started_at, r.finished_at)}</td>
            <td>${r.exit_code !== null ? r.exit_code : '-'}</td>
            <td>
              <button class="btn btn-ghost btn-sm view-log-btn" data-run="${r.id}" data-name="${escapeHtml(r.job_name)}">📄 로그</button>
              <button class="btn btn-ghost btn-sm del-btn" data-run="${r.id}" style="color:#ef4444">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  // 로그 보기
  $$('.view-log-btn').forEach(btn =>
    btn.addEventListener('click', () => openLogModal(btn.dataset.run, btn.dataset.name))
  );
  // 삭제
  $$('.del-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (!confirm('이 이력을 삭제하시겠습니까?')) return;
      try {
        await apiFetch(`/api/history/${btn.dataset.run}`, { method: 'DELETE' });
        toast('삭제되었습니다.', 'success');
        loadHistory(historyPage);
      } catch (e) { toast(`❌ ${e.message}`, 'error'); }
    })
  );

  // 페이저
  const pager = $('#historyPager');
  if (data.pages <= 1) { pager.innerHTML = ''; return; }
  pager.innerHTML = `
    <button class="btn btn-ghost btn-sm" ${data.page<=1?'disabled':''} onclick="loadHistory(${data.page-1})">◀</button>
    <span class="text-muted text-sm">${data.page} / ${data.pages}  (총 ${data.total}건)</span>
    <button class="btn btn-ghost btn-sm" ${data.page>=data.pages?'disabled':''} onclick="loadHistory(${data.page+1})">▶</button>`;
}

async function openLogModal(runId, jobName) {
  $('#logModalTitle').textContent = `📄 로그 — ${jobName}`;
  $('#logModalContent').textContent = '로그를 불러오는 중...';
  $('#logModal').classList.remove('hidden');
  try {
    const data = await apiFetch(`/api/history/${runId}`);
    $('#logModalContent').textContent = data.log_output || '(로그 없음)';
  } catch (e) {
    $('#logModalContent').textContent = `오류: ${e.message}`;
  }
}

// ══════════════════════════════════════════════
//  Tab switching
// ══════════════════════════════════════════════

function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab${name.charAt(0).toUpperCase()+name.slice(1)}`));
  if (name === 'history') loadHistory(historyPage);
}

// ══════════════════════════════════════════════
//  Active run polling (헤더 배지 갱신용)
// ══════════════════════════════════════════════

async function pollActiveRuns() {
  try {
    const data = await apiFetch('/api/processes');
    // WebSocket이 없는 RUNNING run은 패널 복원
    // (새로고침 후 실행 중인 것들을 보여줌)
    data.processes.forEach(run => {
      const panelId = `panel-${run.id}`;
      if (!document.getElementById(panelId)) {
        openRunPanel({ run_id: run.id, job_name: run.job_name,
                       pid: run.pid, status: run.status, started_at: run.started_at });
      }
    });
  } catch (_) {}
}

// ══════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  loadJobs();
  pollActiveRuns();

  // 탭
  $$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // Job 새로고침
  $('#refreshJobsBtn').addEventListener('click', loadJobs);

  // 모달 닫기
  $('#modalClose').addEventListener('click', closeRunModal);
  $('#modalCancel').addEventListener('click', closeRunModal);
  $('#runModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeRunModal(); });

  // 로그 모달 닫기
  $('#logModalClose').addEventListener('click', () => $('#logModal').classList.add('hidden'));
  $('#logModal').addEventListener('click', e => { if (e.target === e.currentTarget) $('#logModal').classList.add('hidden'); });

  // 이력 검색
  $('#historySearchBtn').addEventListener('click', () => loadHistory(1));
  $('#historyRefreshBtn').addEventListener('click', () => loadHistory(historyPage));

  // 주기적 갱신
  setInterval(pollActiveRuns, 5000);
});
