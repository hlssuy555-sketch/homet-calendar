#!/usr/bin/env python3
"""workouts/log.json → 이 웹앱의 data.json 동기화 도구.

사용 예)
    python3 tools/sync_data.py                       # ../log.json 자동 탐색
    python3 tools/sync_data.py ~/workouts/log.json   # 경로 직접 지정

하는 일
  · log.json 의 start_date / routine_name / equipment / weekly_plan / records /
    bodyweight_only_until 을
    data.json 에 그대로 옮깁니다. (운동 메뉴 menus, menu_labels 는 그대로 유지)
  · data.json 을 fallback.js(내장 사본)로 다시 만들어, fetch 가 막힌 환경에서도
    같은 내용으로 동작하게 합니다.
  · 끝나면 git add/commit/push 안내를 출력합니다.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data.json"
FALLBACK = ROOT / "fallback.js"

CARRY_KEYS = ["start_date", "routine_name", "equipment", "weekly_plan", "records",
              "bodyweight_only_until"]
HEADER = (
    "/* data.json과 같은 내용의 내장 사본 — fetch가 막힌 환경(file:// 등)에서 쓰입니다.\n"
    "   tools/sync_data.py 로 data.json과 함께 갱신됩니다. 직접 수정하지 마세요. */\n"
)


def find_log(explicit: str | None) -> pathlib.Path:
    if explicit:
        p = pathlib.Path(explicit).expanduser().resolve()
        if not p.exists():
            sys.exit(f"log.json 을 찾을 수 없습니다: {p}")
        return p
    for cand in (ROOT.parent / "log.json", ROOT.parent.parent / "workouts" / "log.json"):
        if cand.exists():
            return cand
    sys.exit("log.json 경로를 인자로 넘겨 주세요. 예) python3 tools/sync_data.py ../log.json")


def main() -> None:
    ap = argparse.ArgumentParser(description="log.json → data.json + fallback.js 동기화")
    ap.add_argument("log", nargs="?", help="workouts/log.json 경로")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 변경 내용만 확인")
    args = ap.parse_args()

    log_path = find_log(args.log)
    log = json.loads(log_path.read_text(encoding="utf-8"))
    data = json.loads(DATA.read_text(encoding="utf-8"))

    changed = []
    for key in CARRY_KEYS:
        if key in log and data.get(key) != log[key]:
            data[key] = log[key]
            changed.append(key)

    if args.dry_run:
        print(f"log: {log_path}")
        print("변경될 항목:", ", ".join(changed) if changed else "없음")
        return

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    FALLBACK.write_text(HEADER + "window.__HOMET_FALLBACK__ = "
                        + json.dumps(data, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")

    print(f"log: {log_path}")
    print("갱신된 항목:", ", ".join(changed) if changed else "없음 (이미 최신)")
    print(f"기록 {len(data.get('records', {}))}건 · 시작일 {data.get('start_date')}")
    print()
    print("배포하려면:")
    print("  git add data.json fallback.js && git commit -m '기록 동기화' && git push")


if __name__ == "__main__":
    main()
