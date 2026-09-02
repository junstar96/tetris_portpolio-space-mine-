# 테트리스 (Tetris) 🎮

클래식 테트리스 게임 — Python 백엔드 + HTML5 Canvas 프론트엔드

![Python](https://img.shields.io/badge/Python-3.x-blue)
![HTML5](https://img.shields.io/badge/HTML5-Canvas-orange)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-yellow)

## 실행 방법

```bash
python3 server.py
```

브라우저에서 `http://localhost:3000` 접속

## 게임 화면

### 메인 메뉴
- **게임 시작** — 테트리스 게임을 시작합니다
- **스코어** — 상위 10위 기록을 확인합니다
- **게임 종료** — 종료 화면으로 이동합니다

### 게임 플레이
| 위치 | 내용 |
|------|------|
| 중앙 | 10×20 테트리스 보드 |
| 좌측 상단 | 점수, 레벨, 라인 수, 플레이 타임(초) |
| 좌측 하단 | 홀드 블록 |
| 우측 상단 | 다음 블록 미리보기 3개 |

## 조작법

| 키 | 동작 |
|----|------|
| ← → | 좌우 이동 |
| ↑ | 회전 |
| ↓ | 소프트 드롭 |
| Space | 하드 드롭 (즉시 착지) |
| C / Shift | 홀드 |
| P / ESC | 일시정지 |

## 게임 기능

- **7-bag 랜덤 시스템** — 공정한 블록 배분
- **고스트 피스** — 착지 위치 미리보기
- **벽 차기(Wall Kick)** — SRS 회전 시스템
- **레벨업** — 10줄 클리어마다 속도 증가
- **라인 클리어 애니메이션** — 플래시 이펙트
- **스코어 저장** — 서버 Top 10 리더보드

## 타일 색상

| 블록 | 색상 |
|------|------|
| Z | 🔴 빨강 |
| J | 🔵 파랑 |
| O | 🟡 노랑 |
| S | 🟢 초록 |
| T | 🟣 보라 |
| I | 🔵 시안 |
| L | 🟠 주황 |

## 프로젝트 구조

```
├── server.py              # Python HTTP 서버 (포트 3000)
├── static/
│   ├── index.html         # 게임 HTML (메뉴, 게임, 스코어 화면)
│   ├── style.css          # 다크 테마 UI 스타일
│   ├── tetris.js          # 테트리스 게임 엔진
│   └── favicon.ico        # 파비콘
├── .gitignore
└── README.md
```

## 기술 스택

- **백엔드**: Python 3 (`http.server` 표준 라이브러리)
- **프론트엔드**: HTML5 Canvas, CSS3, Vanilla JavaScript
- **폰트**: Press Start 2P (레트로), Noto Sans KR (한글)
- **데이터**: JSON 파일 기반 스코어 저장
