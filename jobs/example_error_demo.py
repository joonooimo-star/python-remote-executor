"""
예제 Job 4: Error Demo
의도적으로 에러를 발생시켜 FAILED 상태를 테스트합니다.
"""

JOB_NAME        = "Error Demo"
JOB_DESCRIPTION = "의도적으로 에러를 발생시켜 FAILED 상태와 에러 로그를 확인하는 테스트용 Job입니다."
JOB_TAGS        = ["example", "debug"]
JOB_PARAMS = [
    {
        "name":    "fail_at",
        "type":    "int",
        "default": 5,
        "label":   "몇 번째 단계에서 실패할까요?",
    },
]
JOB_TIMEOUT        = 30
JOB_MAX_CONCURRENT = 5

import sys
import time


def run(params: dict):
    fail_at = int(params.get("fail_at", 5))

    print(f"[시작] {fail_at}번째 단계에서 에러가 발생할 예정입니다.")
    print()

    for i in range(1, 10):
        print(f"  단계 {i} 처리 중...")
        time.sleep(0.4)

        if i == fail_at:
            print()
            print(f"💥 [에러] {i}번째 단계에서 예외가 발생했습니다!", file=sys.stderr)
            raise ValueError(f"Step {i}에서 의도적 오류 발생! (fail_at={fail_at})")

    print()
    print("[완료] 모든 단계 성공!")


if __name__ == "__main__":
    import json
    _params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(_params)
