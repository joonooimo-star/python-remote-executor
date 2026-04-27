"""
예제 Job 2: Long Running Counter
오래 실행되는 작업을 시뮬레이션합니다. 강제 종료 테스트에 적합합니다.
"""

JOB_NAME        = "Long Running Counter"
JOB_DESCRIPTION = "카운터를 지정한 횟수만큼 실행하는 장기 작업입니다. 강제 종료 테스트에 활용하세요."
JOB_TAGS        = ["example", "long-running"]
JOB_PARAMS = [
    {
        "name":    "total",
        "type":    "int",
        "default": 60,
        "label":   "총 카운트 수",
    },
    {
        "name":    "interval",
        "type":    "float",
        "default": 1.0,
        "label":   "간격 (초)",
    },
]
JOB_TIMEOUT        = 0
JOB_MAX_CONCURRENT = 3

import sys
import time


def run(params: dict):
    total    = int(params.get("total", 60))
    interval = float(params.get("interval", 1.0))

    print(f"[시작] 총 {total}회, {interval}초 간격으로 카운트합니다.")
    print(f"  강제 종료 버튼으로 언제든 멈출 수 있습니다.")
    print("-" * 40)

    for i in range(1, total + 1):
        pct = i / total * 100
        bar = "█" * int(pct // 5) + "░" * (20 - int(pct // 5))
        print(f"[{bar}] {i:3d}/{total}  ({pct:.0f}%)")
        time.sleep(interval)

    print("-" * 40)
    print(f"[완료] {total}회 카운트 완료!")


if __name__ == "__main__":
    import json
    _params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(_params)
