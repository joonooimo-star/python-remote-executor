# 🐍 Python Remote Executor

> 파이썬 스크립트를 **웹 브라우저에서 원격 실행·모니터링·강제종료**할 수 있는 플랫폼

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)](https://fastapi.tiangolo.com)

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| **원격 실행** | 웹 UI에서 등록된 Python Job을 즉시 실행 |
| **실시간 로그** | WebSocket으로 stdout/stderr를 실시간 스트리밍 |
| **강제 종료** | 실행 중인 프로세스를 웹에서 즉시 Kill |
| **플러그인 확장** | `jobs/` 폴더에 `.py` 파일만 추가하면 자동 등록 |
| **실행 이력** | 모든 실행 결과(로그 포함)를 SQLite에 영구 저장 |
| **자동 재감지** | jobs/ 폴더 파일 변경 시 자동으로 Job Registry 갱신 |

---

## 🚀 빠른 시작

### 1. 설치

```bash
# 의존성 설치
pip install -r requirements.txt
```

### 2. 서버 실행

```bash
python run.py
```

브라우저에서 **http://localhost:8000** 으로 접속하세요.

---

## 📁 프로젝트 구조

```
python-remote-executor/
│
├── backend/                        # FastAPI 서버
│   ├── main.py                     # 앱 진입점
│   ├── config.py                   # 환경설정
│   ├── database.py                 # SQLite (aiosqlite)
│   ├── routers/
│   │   ├── jobs.py                 # GET|POST /api/jobs
│   │   ├── processes.py            # GET|DELETE /api/processes
│   │   └── history.py              # GET|DELETE /api/history
│   ├── core/
│   │   ├── job_registry.py         # jobs/ 폴더 스캔·플러그인 관리
│   │   ├── process_manager.py      # subprocess 실행·종료·로그 큐
│   │   └── file_watcher.py         # watchdog 파일 감시
│   └── websocket/
│       └── log_ws.py               # WS /ws/logs/{run_id}
│
├── jobs/                           # ✨ 사용자 Python 로직 (여기만 수정!)
│   ├── __job_template__.py         # 새 Job 작성 가이드
│   ├── example_hello.py            # 예제: Hello World
│   ├── example_counter.py          # 예제: 카운터 (Kill 테스트용)
│   ├── example_data_pipeline.py    # 예제: ETL 파이프라인
│   └── example_error_demo.py       # 예제: 에러 처리 테스트
│
├── frontend/                       # Web UI (Vanilla JS)
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── data/                           # SQLite DB (자동 생성)
├── run.py                          # 서버 실행 진입점
├── requirements.txt
├── DESIGN.md                       # 시스템 설계 문서
└── README.md
```

---

## ✏️ 나만의 Job 추가하기

### 1. `jobs/` 폴더에 새 Python 파일 생성

```python
# jobs/my_awesome_job.py

JOB_NAME        = "내 멋진 작업"
JOB_DESCRIPTION = "데이터를 처리하는 나만의 로직"
JOB_TAGS        = ["data", "custom"]

JOB_PARAMS = [
    {"name": "target", "type": "string", "default": "prod", "label": "대상 환경"},
    {"name": "limit",  "type": "int",    "default": 100,    "label": "처리 건수"},
]

import sys, time

def run(params: dict):
    target = params.get("target", "prod")
    limit  = int(params.get("limit", 100))

    print(f"[시작] 환경={target}, 건수={limit}")

    for i in range(limit):
        # 내 비즈니스 로직
        print(f"처리 중: {i+1}/{limit}")
        time.sleep(0.1)

    print("[완료]")

if __name__ == "__main__":
    import json
    run(json.loads(sys.argv[1]) if len(sys.argv) > 1 else {})
```

### 2. 서버 재시작 없이 자동 반영!
파일을 저장하면 watchdog이 감지하여 Web UI에 즉시 나타납니다.

---

## 🌐 REST API

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/jobs` | Job 목록 |
| `GET` | `/api/jobs/{job_id}` | Job 상세 |
| `POST` | `/api/jobs/{job_id}/run` | Job 실행 |
| `GET` | `/api/processes` | 실행 중 프로세스 |
| `DELETE` | `/api/processes/{run_id}` | 강제 종료 |
| `GET` | `/api/history` | 실행 이력 |
| `GET` | `/api/history/{run_id}` | 특정 실행 로그 |
| `DELETE` | `/api/history/{run_id}` | 이력 삭제 |
| `WS` | `/ws/logs/{run_id}` | 로그 실시간 스트리밍 |
| `GET` | `/api/health` | 서버 상태 확인 |

자동 생성된 API 문서: **http://localhost:8000/docs**

---

## ⚙️ 환경 설정

| 환경변수 | 기본값 | 설명 |
|---------|--------|------|
| `HOST` | `0.0.0.0` | 서버 바인드 주소 |
| `PORT` | `8000` | 서버 포트 |

---

## 🗺️ 로드맵

- [x] **Phase 1 (MVP)** — 실행·종료·로그·이력·플러그인
- [ ] **Phase 2** — Job 스케줄링 (cron), 알림 (Webhook)
- [ ] **Phase 3** — API Key 인증, 다중 사용자

---

## 🛠️ 기술 스택

- **Backend**: FastAPI + uvicorn + aiosqlite + watchdog
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **DB**: SQLite
- **프로세스**: Python `subprocess` + `asyncio`
