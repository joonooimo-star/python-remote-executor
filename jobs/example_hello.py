"""
예제 Job 1: Hello World
간단한 인사 메시지를 출력합니다.
"""

JOB_NAME        = "Hello World"
JOB_DESCRIPTION = "이름을 입력받아 인사 메시지를 출력하는 간단한 예제입니다."
JOB_TAGS        = ["example", "beginner"]
JOB_PARAMS = [
    {
        "name":    "name",
        "type":    "string",
        "default": "World",
        "label":   "이름",
    },
    {
        "name":    "repeat",
        "type":    "int",
        "default": 3,
        "label":   "반복 횟수",
    },
]
JOB_TIMEOUT        = 30
JOB_MAX_CONCURRENT = 5

import sys
import time


def run(params: dict):
    name   = params.get("name", "World")
    repeat = int(params.get("repeat", 3))

    print(f"[시작] 안녕하세요 프로그램을 시작합니다!")
    print(f"  이름: {name}, 반복: {repeat}회")
    print()

    for i in range(repeat):
        print(f"[{i+1}/{repeat}] Hello, {name}! 👋")
        time.sleep(0.8)

    print()
    print("[완료] 프로그램이 정상 종료되었습니다.")


if __name__ == "__main__":
    import json
    _params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(_params)
