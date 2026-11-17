# 아침 7시 홈트 달력

홍성민 님의 아침 7시 홈트 루틴을 보는 모바일 웹앱입니다. 갤럭시(삼성 인터넷·크롬)에서
**홈 화면에 추가**하면 일반 앱처럼 아이콘으로 열립니다.

- 배포: GitHub Pages (정적 파일만 사용, 빌드 필요 없음)
- 화면: 월간 달력(월~일) + 날짜를 누르면 그날 기구별 운동·세트 체크
- 기록: 이 기기의 `localStorage`에 저장되고, 서버(`data.json`) 기록과 병합되어 표시됩니다

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 뼈대 |
| `style.css` | 모바일(360~412px) 우선 스타일, 다크 모드 없음 |
| `app.js` | 달력·통계·상세 패널·저장 로직 |
| `data.json` | 루틴·주간 계획·운동 메뉴·기록 (앱이 `fetch`로 읽음) |
| `fallback.js` | `data.json`의 내장 사본 (파일로 직접 열 때 사용) |
| `manifest.json` | PWA 매니페스트 (standalone, 아이콘) |
| `sw.js` | 오프라인 캐시 (앱 셸) |
| `icon-*.png`, `icon.svg` | 아이콘 |
| `tools/sync_data.py` | `workouts/log.json` → `data.json` 동기화 도구 |

## 운동 메뉴 고치기

`data.json`의 `menus` 를 고치면 됩니다. 항목 하나는 이렇게 생겼습니다.

```json
{
  "id": "lower-squat",
  "name": "바벨 백 스쿼트",
  "equipment": "바벨 27kg",
  "sets": 4,
  "reps": "10~12회",
  "note": "무릎과 발끝 같은 방향"
}
```

`id`는 기록(`sets`)의 키로 쓰이므로 **이미 쓴 id는 바꾸지 마세요.**

## 기록 동기화

`workouts/log.json`이 바뀌면(예: 매일 아침 체크 기록):

```bash
cd workouts/webapp
python3 tools/sync_data.py ../../log.json   # data.json + fallback.js 갱신
git add -A && git commit -m "기록 동기화" && git push
```

`sync_data.py`는 `start_date`·`routine_name`·`equipment`·`weekly_plan`·`records`만
옮기고 `menus`·`menu_labels`는 그대로 둡니다.

## 기록이 저장되는 곳

- 앱에서 직접 누른 체크 → 브라우저 `localStorage` 키 `homet.calendar.v1`
- `data.json`의 `records` → 서버(저장소) 기록
- 둘 다 있으면 **이 기기 기록이 우선**하고, `data.json` 기록은 병합되어 보입니다.
- `이 날짜 기록 지우기` → 그 날짜만 기기 기록에서 지웁니다.
- `내 기록 초기화`(하단) → 이 기기에 저장된 기록 전체를 지웁니다.

## 고칠 때 주의

- `style.css`, `app.js`, `fallback.js`, `manifest.json` 을 고치면 `index.html` 의 `?v=` 숫자를 하나 올려 주세요.
  (GitHub Pages 는 정적 파일을 10분간 캐시하고, service worker 도 앱 셸을 캐시합니다.)
- `preview/mobile.html` — 갤럭시 폭(360/390/412px)과 날짜 상세 패널을 한 화면에서 확인하는 점검용 페이지입니다.
  배포 URL 뒤에 `/preview/mobile.html` 을 붙이면 열립니다.
- 날짜 딥링크: `https://hlssuy555-sketch.github.io/homet-calendar/#d=2026-11-19` 처럼
  `#d=YYYY-MM-DD` 를 붙이면 그 날짜 상세 패널이 바로 열립니다(아침 알림 링크에 사용).
