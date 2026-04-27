"""
───────────────────────────────────────────────────────────────
🐍 Python Remote Executor — Job 작성 템플릿

이 파일을 복사하여 새 Job을 만드세요.
파일명이 곧 job_id가 됩니다. (예: my_job.py → job_id: my_job)

⚠️  __로 시작하는 파일(이 파일 포함)은 자동으로 무시됩니다.
───────────────────────────────────────────────────────────────
"""

# ──────────────────────────────────────────────────────────────
# 1. 필수 메타데이터
# ──────────────────────────────────────────────────────────────

JOB_NAME        = "Job 이름 (UI 표시)"          # 필수
JOB_DESCRIPTION = "이 Job이 하는 일을 설명하세요"  # 선택
JOB_TAGS        = ["example"]                   # 선택: 분류 태그

# 실행 시 받을 파라미터 정의 (선택)
# type: "string" | "int" | "float" | "bool"
JOB_PARAMS = [
    {
        "name":    "param1",
        "type":    "string",
        "default": "기본값",
        "label":   "파라미터 1 레이블",
    },
    {
        "name":    "count",
        "type":    "int",
        "default": 10,
        "label":   "반복 횟수",
    },
]

JOB_TIMEOUT        = 0   # 초, 0이면 제한 없음
JOB_MAX_CONCURRENT = 3   # 동시에 실행 가능한 최대 수


# ──────────────────────────────────────────────────────────────
# 2. 실제 로직
# ──────────────────────────────────────────────────────────────

import sys
import time


def run(params: dict):
    """
    이 함수에 비즈니스 로직을 작성하세요.

    - print() 출력이 실시간으로 Web UI에 스트리밍됩니다.
    - params 딕셔너리로 실행 파라미터를 받습니다.
    - 에러 발생 시 sys.exit(1)로 종료하면 FAILED 상태가 됩니다.
    - 정상 종료(return 또는 sys.exit(0))는 COMPLETED 상태가 됩니다.
    """
    param1 = params.get("param1", "기본값")
    count  = int(params.get("count", 10))

    print(f"[시작] param1={param1}, count={count}")

    for i in range(count):
        print(f"처리 중... {i + 1}/{count}")
        time.sleep(0.5)

    print("[완료] 작업이 끝났습니다.")


# ──────────────────────────────────────────────────────────────
# 3. 진입점 (수정 불필요)
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    _params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(_params)
