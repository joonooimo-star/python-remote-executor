# 🐍 Python Remote Executor

> 웹 브라우저에서 내가 만든 Python 스크립트를 실행하고, 실시간으로 로그를 보고, 언제든지 멈출 수 있는 플랫폼

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| **원격 실행** | 웹 UI에서 등록된 Python Job을 버튼 한 번으로 실행 |
| **실시간 로그** | 실행 중 stdout/stderr를 WebSocket으로 즉시 스트리밍 |
| **강제 종료** | 실행 중인 프로세스를 웹에서 즉시 Kill |
| **플러그인 확장** | `jobs/` 폴더에 `.py` 파일 추가만으로 자동 등록 |
| **파일 자동 감지** | watchdog으로 jobs/ 변경 시 서버 재시작 없이 반영 |
| **실행 이력** | 과거 실행 결과(로그, 상태, 시간)를 SQLite에 영구 보관 |
| **파라미터 입력** | Job별 실행 파라미터를 웹 UI 폼으로 입력 가능 |

---

## 🚀 빠른 시작

### 1. 의존성 설치
```bash
pip install -r requirements.txt
```

### 2. 서버 실행
```bash
PYTHONPATH=. python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 브라우저 접속
```
http://localhost:8000
```

---

## 📁 프로젝트 구조

```
python-remote-executor/
├── backend/                    # FastAPI 서버
│   ├── main.py                 # 앱 진입점
│   ├── config.py               # 환경설정
│   ├── database.py             # SQLite 연결
│   ├── core/
│   │   ├── job_registry.py     # Job 플러그인 시스템
│   │   ├── process_manager.py  # subprocess 생명주기 관리
│   │   └── file_watcher.py     # jobs/ 폴더 자동 감지
│   ├── routers/
│   │   ├── jobs.py             # Job 실행 API
│   │   ├── processes.py        # 프로세스 조회/종료 API
│   │   └── history.py          # 실행 이력 API
│   └── websocket/
│       └── log_ws.py           # 실시간 로그 WebSocket
│
├── jobs/                       # ✨ 사용자 Python 로직 (여기에 추가!)
│   ├── __job_template__.py     # Job 작성 가이드 템플릿
│   ├── example_hello.py        # 예제: Hello World
│   ├── example_counter.py      # 예제: 장기 실행 카운터
│   ├── example_data_pipeline.py# 예제: ETL 파이프라인
│   └── example_error_demo.py   # 예제: 에러 테스트
│
├── frontend/                   # Web UI (Vanilla JS)
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── data/                       # SQLite DB (자동 생성)
├── requirements.txt
├── DESIGN.md                   # 설계 문서
└── README.md
```

---

## 🔌 나만의 Job 추가하기

`jobs/` 폴더에 새 `.py` 파일을 만들기만 하면 **서버 재시작 없이** 자동으로 UI에 나타납니다.

```python
# jobs/my_job.py

# ── 메타데이터 ──────────────────────────────────
JOB_NAME        = "내 작업 이름"
JOB_DESCRIPTION = "이 Job이 하는 일"
JOB_TAGS        = ["my-tag"]
JOB_PARAMS = [
    {"name": "target", "type": "string", "default": "value", "label": "대상"},
    {"name": "count",  "type": "int",    "default": 10,      "label": "횟수"},
]
JOB_TIMEOUT        = 0    # 초 (0 = 제한 없음)
JOB_MAX_CONCURRENT = 3    # 최대 동시 실행 수

# ── 로직 ────────────────────────────────────────
import sys, time

def run(params: dict):
    target = params.get("target", "value")
    count  = int(params.get("count", 10))

    print(f"[시작] target={target}, count={count}")
    for i in range(count):
        print(f"처리 중... {i+1}/{count}")
        time.sleep(0.5)
    print("[완료]")

# ── 진입점 (수정 불필요) ─────────────────────────
if __name__ == "__main__":
    import json
    _params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(_params)
```

---

## 🌐 API 문서

서버 실행 후 `http://localhost:8000/docs` 에서 Swagger UI로 전체 API를 확인할 수 있습니다.

### 주요 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET`  | `/api/jobs` | Job 목록 조회 |
| `POST` | `/api/jobs/{job_id}/run` | Job 실행 |
| `GET`  | `/api/processes` | 실행 중인 프로세스 목록 |
| `DELETE` | `/api/processes/{run_id}` | 강제 종료 |
| `GET`  | `/api/history` | 실행 이력 조회 |
| `WS`   | `/ws/logs/{run_id}` | 실시간 로그 스트리밍 |

---

## 🛠️ 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI + Uvicorn |
| 프로세스 관리 | Python `subprocess` |
| 실시간 통신 | WebSocket (FastAPI 내장) |
| DB | SQLite + aiosqlite |
| 파일 감시 | watchdog |
| Frontend | Vanilla JS + CSS (빌드 없음) |

---

## 📋 설계 문서

전체 아키텍처 설계는 [DESIGN.md](./DESIGN.md)를 참고하세요.
