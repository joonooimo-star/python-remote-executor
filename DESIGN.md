# 🧠 Python Remote Executor — 설계 문서

> 버전: v1.0  
> 작성일: 2026-04-27  
> 목적: 사용자가 작성한 Python 로직을 웹 UI를 통해 원격 실행·모니터링·강제종료할 수 있는 시스템

---

## 1. 프로젝트 개요 (Overview)

### 1.1 한 줄 요약
> "웹 브라우저에서 내가 만든 Python 스크립트를 실행하고, 실시간으로 로그를 보고, 언제든지 멈출 수 있는 플랫폼"

### 1.2 핵심 기능 목표
| 목표 | 설명 |
|------|------|
| **원격 실행** | 웹 UI에서 등록된 Python 작업(Job)을 실행 |
| **실시간 모니터링** | 실행 중 stdout/stderr 로그를 웹에서 스트리밍 확인 |
| **강제 종료** | 실행 중인 프로세스를 웹에서 즉시 Kill |
| **확장성** | 새로운 Python 로직을 플러그인처럼 쉽게 추가 가능 |
| **실행 이력** | 과거 실행 결과(로그, 상태, 시간)를 영구 보관 |

---

## 2. 시스템 아키텍처

### 2.1 전체 구조도

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Browser                          │
│                    (React or Vanilla JS)                    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│   │ Job 목록  │  │ 실행/종료 │  │ 로그 뷰어 │  │ 실행이력  │  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
└────────┼─────────────┼─────────────┼──────────────┼────────┘
         │   REST API  │             │  WebSocket   │
         ▼             ▼             ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Job Router │  │ Process Mgr  │  │  WebSocket Handler │  │
│  │  (REST API) │  │ (실행/종료)   │  │  (로그 스트리밍)    │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                │                    │              │
│  ┌──────▼────────────────▼────────────────────▼───────────┐  │
│  │              Job Registry (플러그인 시스템)               │  │
│  │         jobs/ 디렉토리의 Python 파일 자동 감지            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌────────────────────────────▼───────────────────────────┐  │
│  │              SQLite / DB (실행 이력 저장)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ subprocess.Popen
┌─────────────────────────────────────────────────────────────┐
│               Python Job Workers (Child Processes)           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  job_a.py│  │  job_b.py│  │  job_c.py│  ...             │
│  │ (내 로직) │  │ (내 로직) │  │ (내 로직) │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 컴포넌트 책임

| 컴포넌트 | 역할 |
|---------|------|
| **Web UI** | Job 목록 조회, 실행·종료 요청, 로그 실시간 표시, 이력 조회 |
| **FastAPI Backend** | REST API + WebSocket 서버, 비즈니스 로직 조정 |
| **Process Manager** | subprocess 생명주기 관리 (spawn / kill / 상태 추적) |
| **Job Registry** | `jobs/` 디렉토리 스캔, 메타데이터 로드, 플러그인 등록 |
| **Log Streamer** | 실행 중 프로세스의 stdout/stderr를 WebSocket으로 브로드캐스트 |
| **DB (SQLite)** | 실행 이력, 로그 스냅샷, Job 상태 영구 저장 |
| **Python Jobs** | 실제 비즈니스 로직 — 독립 파이썬 파일 |

---

## 3. 디렉토리 구조

```
python-remote-executor/
│
├── backend/                        # FastAPI 서버
│   ├── main.py                     # 앱 진입점, 라우터 등록
│   ├── config.py                   # 환경설정 (포트, DB경로 등)
│   ├── database.py                 # SQLite 연결 및 모델
│   │
│   ├── routers/
│   │   ├── jobs.py                 # GET /jobs, POST /jobs/{id}/run 등
│   │   ├── processes.py            # GET /processes, DELETE /processes/{pid}
│   │   └── history.py              # GET /history
│   │
│   ├── core/
│   │   ├── process_manager.py      # subprocess 실행·종료·상태 관리
│   │   ├── job_registry.py         # jobs/ 폴더 스캔 & 메타데이터 파싱
│   │   └── log_streamer.py         # 로그 큐 → WebSocket 브로드캐스트
│   │
│   └── websocket/
│       └── log_ws.py               # WebSocket 엔드포인트 (/ws/logs/{run_id})
│
├── jobs/                           # ✨ 사용자 Python 로직 (플러그인 영역)
│   ├── __job_template__.py         # 새 Job 작성 가이드 템플릿
│   ├── example_hello.py            # 예제: Hello World
│   ├── example_counter.py          # 예제: 카운터 (종료 테스트용)
│   └── example_data_pipeline.py    # 예제: 데이터 처리 파이프라인
│
├── frontend/                       # Web UI (Vanilla JS or React)
│   ├── index.html
│   ├── app.js                      # 메인 앱 로직
│   ├── components/
│   │   ├── JobList.js              # Job 목록 컴포넌트
│   │   ├── LogViewer.js            # 실시간 로그 뷰어
│   │   ├── ProcessStatus.js        # 실행 상태 배지
│   │   └── RunHistory.js           # 실행 이력 테이블
│   └── styles.css
│
├── data/
│   └── executor.db                 # SQLite DB 파일
│
├── requirements.txt
├── README.md
└── DESIGN.md                       # 📄 이 문서
```

---

## 4. 핵심 개념 상세 설계

### 4.1 Job 플러그인 시스템 (확장성의 핵심)

**목표**: 새 Python 파일을 `jobs/` 폴더에 넣기만 하면 자동으로 Web UI에 나타남

#### Job 파일 구조 (Convention over Configuration)
```python
# jobs/my_custom_job.py

# ─── 필수 메타데이터 (파일 상단 주석 or 모듈 변수) ───────────────────
JOB_NAME = "내 커스텀 작업"           # UI에 표시될 이름
JOB_DESCRIPTION = "설명을 적어주세요"  # 툴팁 설명
JOB_TAGS = ["data", "analysis"]      # 분류 태그 (선택)
JOB_PARAMS = [                        # 실행 시 입력받을 파라미터 (선택)
    {"name": "target_date", "type": "string", "default": "today", "label": "처리 날짜"},
    {"name": "batch_size",  "type": "int",    "default": 100,     "label": "배치 크기"},
]

# ─── 실제 로직 ────────────────────────────────────────────────────────
import sys
import time

def run(params: dict):
    """
    실제 비즈니스 로직을 여기에 작성합니다.
    print() 출력이 실시간으로 Web UI에 스트리밍됩니다.
    """
    target_date = params.get("target_date", "today")
    batch_size  = params.get("batch_size", 100)

    print(f"[시작] 날짜={target_date}, 배치={batch_size}")

    for i in range(batch_size):
        print(f"처리 중... {i+1}/{batch_size}")
        time.sleep(0.1)

    print("[완료] 모든 작업이 끝났습니다.")

if __name__ == "__main__":
    import json
    params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(params)
```

#### Job Registry 동작 방식
```
서버 시작
  └─► jobs/ 폴더 스캔 (glob *.py, __로 시작하는 파일 제외)
        └─► 각 파일 importlib로 동적 로드
              └─► JOB_NAME, JOB_DESCRIPTION, JOB_PARAMS 추출
                    └─► 메모리 내 Job Registry에 등록
                          └─► 파일시스템 감시(watchdog)로 변경 시 자동 재등록
```

### 4.2 Process Manager

**역할**: Job 실행 → 프로세스 생성 → 로그 캡처 → 종료 처리

```
실행 요청 (POST /jobs/{job_id}/run)
  └─► subprocess.Popen([python, jobs/xxx.py, params_json])
        ├─► stdout PIPE 연결
        ├─► stderr PIPE 연결
        ├─► run_id 생성 (UUID)
        ├─► DB에 실행 레코드 INSERT (상태: RUNNING)
        └─► 백그라운드 스레드: 로그 큐에 실시간 push

강제 종료 요청 (DELETE /processes/{run_id})
  └─► 프로세스 PID 조회
        └─► process.terminate() → 2초 대기 → process.kill()
              └─► DB 상태 업데이트 (KILLED)

프로세스 종료 감지 (백그라운드 스레드)
  └─► process.wait() 반환 시
        └─► DB 상태 업데이트 (COMPLETED | FAILED)
              └─► 로그 최종 스냅샷 DB 저장
```

### 4.3 실시간 로그 스트리밍 (WebSocket)

```
Client                    FastAPI                  Child Process
  │                          │                          │
  │──── WS Connect ─────────►│                          │
  │   /ws/logs/{run_id}      │                          │
  │                          │◄── stdout line ──────────│
  │◄─── log line ────────────│                          │
  │◄─── log line ────────────│◄── stderr line ──────────│
  │◄─── log line ────────────│                          │
  │                          │◄── process exit ─────────│
  │◄─── {"type":"done"} ─────│                          │
  │                          │                          │
```

**구현 방식**: `asyncio.Queue` + 백그라운드 스레드
- 별도 스레드에서 `process.stdout.readline()` 블로킹 읽기
- 읽은 줄을 `asyncio.Queue`에 put
- WebSocket 핸들러가 Queue에서 get → 클라이언트로 전송

### 4.4 REST API 설계

#### Jobs API
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/jobs` | 등록된 Job 목록 조회 |
| `GET` | `/api/jobs/{job_id}` | Job 상세 (메타데이터, 파라미터 스키마) |
| `POST` | `/api/jobs/{job_id}/run` | Job 실행 (파라미터 전달) |

#### Processes API
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/processes` | 현재 실행 중인 프로세스 목록 |
| `GET` | `/api/processes/{run_id}` | 특정 실행 상태 조회 |
| `DELETE` | `/api/processes/{run_id}` | 실행 중인 프로세스 강제 종료 |

#### History API
| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/history` | 전체 실행 이력 (페이징) |
| `GET` | `/api/history/{run_id}` | 특정 실행의 전체 로그 조회 |
| `DELETE` | `/api/history/{run_id}` | 이력 삭제 |

#### WebSocket
| Endpoint | 설명 |
|----------|------|
| `WS /ws/logs/{run_id}` | 실행 중 로그 실시간 스트리밍 |

### 4.5 데이터베이스 스키마

```sql
-- Job 실행 이력
CREATE TABLE run_history (
    id          TEXT PRIMARY KEY,      -- UUID (run_id)
    job_id      TEXT NOT NULL,         -- jobs/ 파일명 기반 ID
    job_name    TEXT NOT NULL,         -- 실행 시점의 Job 이름 스냅샷
    params      TEXT,                  -- JSON 문자열 (실행 파라미터)
    status      TEXT NOT NULL,         -- PENDING | RUNNING | COMPLETED | FAILED | KILLED
    pid         INTEGER,               -- OS 프로세스 ID
    exit_code   INTEGER,               -- 종료 코드 (null=실행중)
    started_at  TEXT NOT NULL,         -- ISO8601 시작 시간
    finished_at TEXT,                  -- ISO8601 종료 시간 (null=실행중)
    log_output  TEXT                   -- 전체 로그 (종료 후 스냅샷)
);

-- 인덱스
CREATE INDEX idx_run_history_job_id ON run_history(job_id);
CREATE INDEX idx_run_history_status ON run_history(status);
CREATE INDEX idx_run_history_started_at ON run_history(started_at DESC);
```

---

## 5. Web UI 화면 설계

### 5.1 메인 레이아웃

```
┌────────────────────────────────────────────────────────────────┐
│  🐍 Python Remote Executor          [●] 3개 실행 중            │
├──────────────┬─────────────────────────────────────────────────┤
│              │                                                  │
│  📋 Job 목록  │  📊 실행 현황 / 로그 뷰어                         │
│  ─────────── │  ──────────────────────────────────────────────  │
│  ▶ Job A     │  ┌─────────────────────────────────────────────┐ │
│  ▶ Job B     │  │ run_id: abc-123  |  Job A  |  ● RUNNING     │ │
│  ▶ Job C     │  │ 시작: 14:23:01   |  경과: 00:02:15    [종료] │ │
│              │  ├─────────────────────────────────────────────┤ │
│  🏷️ 태그 필터 │  │ [LOG]                                       │ │
│  ○ all       │  │ > [시작] 날짜=today, 배치=100               │ │
│  ○ data      │  │ > 처리 중... 1/100                          │ │
│  ○ analysis  │  │ > 처리 중... 2/100                          │ │
│              │  │ > 처리 중... 3/100                          │ │
│              │  │ > _                                         │ │
│              │  └─────────────────────────────────────────────┘ │
│              │                                                  │
│              │  📜 실행 이력                                     │
│              │  ─────────────────────────────────────────────  │
│              │  Job A | COMPLETED | 14:20 | 소요 0:01:32       │
│              │  Job B | FAILED    | 14:15 | 소요 0:00:08 [로그] │
│              │  Job A | KILLED    | 14:10 | 소요 0:00:45 [로그] │
└──────────────┴─────────────────────────────────────────────────┘
```

### 5.2 Job 실행 다이얼로그

```
┌─────────────────────────────────┐
│  Job 실행: 내 커스텀 작업          │
│  ─────────────────────────────  │
│  처리 날짜:  [today         ▼]  │
│  배치 크기:  [100              ]  │
│                                  │
│           [취소]  [▶ 실행하기]   │
└─────────────────────────────────┘
```

### 5.3 UI 상태 흐름

```
Job 선택 → [▶ 실행] 클릭
  → 파라미터 입력 다이얼로그 (파라미터 없으면 스킵)
  → POST /api/jobs/{id}/run
  → run_id 수신
  → WS /ws/logs/{run_id} 연결
  → 로그 실시간 표시
  → [종료] 클릭 시 DELETE /api/processes/{run_id}
  → WS 연결 종료
  → 이력 갱신
```

---

## 6. 기술 스택 결정

| 영역 | 선택 | 이유 |
|------|------|------|
| **Backend Framework** | FastAPI | 비동기 지원, WebSocket 내장, 자동 API 문서 |
| **Process 관리** | Python `subprocess` | 표준 라이브러리, 크로스플랫폼 |
| **DB** | SQLite + aiosqlite | 설치 불필요, 단일 파일, 충분한 성능 |
| **WebSocket** | FastAPI WebSocket | FastAPI 내장, asyncio 기반 |
| **Job 감시** | watchdog | 파일시스템 이벤트 → 자동 재로드 |
| **Frontend** | Vanilla JS (+ Tailwind CSS) | 빌드 불필요, 즉시 실행 가능 |
| **로그 큐** | asyncio.Queue | 스레드-비동기 브릿지 |

---

## 7. 보안 고려사항

| 위협 | 대응 방안 |
|------|----------|
| 임의 코드 실행 | `jobs/` 폴더의 파일만 실행 가능 (화이트리스트), 경로 탈출 방지 |
| 무한 실행 | 실행 당 타임아웃 설정 가능 (JOB_TIMEOUT 메타데이터) |
| 동시 실행 제한 | Job 당 최대 동시 실행 수 설정 가능 (JOB_MAX_CONCURRENT) |
| 로그 크기 | 로그 최대 크기 제한 (기본 10MB) |
| 접근 제어 | (v2) API Key 또는 Basic Auth 추가 예정 |

---

## 8. 구현 단계별 로드맵

### Phase 1 — MVP (핵심 기능)
- [ ] FastAPI 기본 서버 구성
- [ ] Job Registry (파일 스캔 + 메타데이터 파싱)
- [ ] Process Manager (실행 + 강제종료)
- [ ] WebSocket 로그 스트리밍
- [ ] SQLite 이력 저장
- [ ] 기본 Web UI (Job 목록, 실행, 로그, 종료)

### Phase 2 — 완성도 향상
- [ ] Job 파라미터 입력 UI
- [ ] 실행 이력 페이지
- [ ] watchdog 파일 감시 (자동 재로드)
- [ ] 실행 중 Job 목록 실시간 뱃지

### Phase 3 — 운영 기능
- [ ] API 인증 (API Key)
- [ ] 타임아웃 / 동시실행 제한
- [ ] Job 스케줄링 (cron-like)
- [ ] 이메일/Webhook 알림

---

## 9. 주요 결정 사항 요약 (ADR)

### ADR-001: Job 메타데이터를 파일 내 모듈 변수로 저장
- **결정**: 별도 YAML/JSON 설정 파일 없이, Python 파일 내 `JOB_NAME`, `JOB_PARAMS` 등의 변수로 메타데이터 정의
- **이유**: 파일 하나만으로 완결성, 코드와 설정의 분리 최소화, 실수 방지

### ADR-002: 로그 스트리밍에 asyncio.Queue 사용
- **결정**: 블로킹 readline 스레드 ↔ 비동기 WebSocket 간 브릿지로 asyncio.Queue 사용
- **이유**: FastAPI는 비동기 기반이나 subprocess 읽기는 블로킹 → 스레드+큐 패턴이 가장 안전

### ADR-003: Frontend는 Vanilla JS (빌드 없음)
- **결정**: React/Vue 대신 순수 JS + CDN Tailwind 사용
- **이유**: 별도 빌드 단계 없이 바로 실행 가능, 의존성 최소화, 프로토타입 속도 우선

---

*이 문서는 구현 진행에 따라 업데이트됩니다.*
