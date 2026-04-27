"""
예제 Job 3: Data Pipeline Simulator
데이터 처리 파이프라인을 시뮬레이션합니다.
Extract → Transform → Load 단계로 진행됩니다.
"""

JOB_NAME        = "Data Pipeline (ETL)"
JOB_DESCRIPTION = "Extract → Transform → Load 단계로 진행되는 데이터 파이프라인 시뮬레이터입니다."
JOB_TAGS        = ["data", "pipeline", "etl"]
JOB_PARAMS = [
    {
        "name":    "rows",
        "type":    "int",
        "default": 100,
        "label":   "처리할 데이터 행 수",
    },
    {
        "name":    "source",
        "type":    "string",
        "default": "database",
        "label":   "데이터 소스 (database / csv / api)",
    },
]
JOB_TIMEOUT        = 120
JOB_MAX_CONCURRENT = 2

import sys
import time
import random


def extract(source: str, rows: int):
    print(f"\n📥 [EXTRACT] 소스: {source}, 대상: {rows}행")
    for i in range(0, rows, max(1, rows // 10)):
        loaded = min(i + rows // 10, rows)
        print(f"  로딩 중... {loaded}/{rows}행")
        time.sleep(0.2)
    print(f"  ✅ {rows}행 추출 완료")
    return [{"id": i, "value": random.randint(1, 1000)} for i in range(rows)]


def transform(data: list):
    print(f"\n🔄 [TRANSFORM] {len(data)}행 변환 시작")
    errors = 0
    for i, row in enumerate(data):
        if row["value"] < 0:
            errors += 1
        if (i + 1) % max(1, len(data) // 5) == 0:
            print(f"  변환 중... {i+1}/{len(data)}행")
            time.sleep(0.15)
    print(f"  ✅ 변환 완료 (오류: {errors}건)")
    return data


def load(data: list):
    print(f"\n📤 [LOAD] {len(data)}행 적재 시작")
    batch_size = max(1, len(data) // 5)
    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        print(f"  배치 적재 {i}~{i+len(batch)-1}행 ({len(batch)}건)")
        time.sleep(0.2)
    print(f"  ✅ 전체 적재 완료")


def run(params: dict):
    rows   = int(params.get("rows", 100))
    source = params.get("source", "database")

    print("=" * 50)
    print("  🚀 ETL 파이프라인 시작")
    print(f"  소스: {source}  |  행 수: {rows}")
    print("=" * 50)

    start = time.time()

    data = extract(source, rows)
    data = transform(data)
    load(data)

    elapsed = time.time() - start
    print()
    print("=" * 50)
    print(f"  ✅ 파이프라인 완료! 소요 시간: {elapsed:.2f}초")
    print(f"  처리 건수: {len(data)}행")
    print("=" * 50)


if __name__ == "__main__":
    import json
    _params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    run(_params)
