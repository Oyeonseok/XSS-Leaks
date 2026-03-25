# Cross-Site Subdomain Leak Practice

## 개요

이 저장소는 cross-site subdomain leak 기법을 로컬에서 재현하고 실습할 수 있도록 만든 환경입니다.

victim 페이지는 `localStorage.flag` 값을 읽은 뒤 hex로 인코딩하여 subdomain 위치에 요청을 보냅니다. 공격자는 응답 본문을 직접 읽지 못하지만, 브라우저 connection pool ordering과 timing 차이를 이용해 해당 값을 조금씩 복원할 수 있습니다.

봇은 victim origin에 `localStorage.flag` 를 심은 뒤 신고된 attacker 페이지를 방문하고, 플래그 값은 `docker-compose.yml` 의 `FLAG` 환경변수에서 주입됩니다. 공격 흐름과 구현 상세는 `docs/solve.md` 에 정리되어 있습니다.

## 프로젝트 구조

```text
xss_leak_problem/
├─ app/
│  ├─ package.json
│  ├─ public/
│  ├─ src/
│  │  └─ victim/
│  │     ├─ app.js
│  │     ├─ bot.js
│  │     ├─ config.js
│  │     └─ server.js
│  └─ views/
│     └─ index.ejs
├─ attacker/
│  ├─ app.js
│  ├─ exploit.html
│  └─ server.js
├─ docs/
│  └─ solve.md
├─ docker-compose.yml
└─ Dockerfile
```

- `app/src/victim`: challenge 본체와 bot 실행 코드
- `attacker`: 실습용 attacker 서버와 exploit 페이지
- `app/views`: victim 렌더링 템플릿
- `docs`: 구조 설명과 풀이 문서

## 환경 실행

기본 Docker 실행은 victim challenge 서버를 `:1337` 에 띄웁니다. attacker host는 브라우저 기준으로 같은 외부 포트 `:1337` 을 유지하고, 내부적으로는 `:3001` 업스트림으로 프록시됩니다.

```bash
docker compose up --build
```

브라우저에서 victim 페이지는 아래 주소로 접속할 수 있습니다.

```text
http://example.localhost:1337/
```

예시 attacker 서버를 같이 테스트하려면 다른 터미널에서 아래 명령으로 실행합니다.

```bash
docker run --rm -p 3001:3001 -e PORT=3001 xss_leak_problem-web:latest sh -lc 'node /attacker/server.js'
```

attacker 페이지는 아래 주소로 열 수 있습니다.

```text
http://attacker.localhost:1337/index.html
```

직접 실행하고 싶다면 `app/` 에서 victim 앱을 띄우고, 별도로 attacker 서버를 실행하면 됩니다.

```bash
cd app
npm install
npm start
```

```bash
cd attacker
PORT=3001 node server.js
```

```bash
cd app
npm run check
```

## 목표

목표는 victim이 생성한 subdomain 요청을 timing side channel로 분석해 최종적으로 `wsl{...}` 형태의 flag를 복원하는 것입니다.

즉, 이 환경의 핵심은 응답 내용을 읽는 것이 아니라 요청 처리 순서와 지연 시간만으로 값을 유추하는 데 있습니다.
