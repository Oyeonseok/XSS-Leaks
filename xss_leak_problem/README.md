# Cross-Site Subdomain Leak Practice

## Overview

이 저장소는 cross-site subdomain leak 기법을 로컬에서 실습해볼 수 있도록 만든 재현 환경입니다.

victim 페이지는 `localStorage.flag` 값을 읽은 뒤 hex로 인코딩하고, 이를 subdomain 위치에 넣어 요청을 보냅니다. 공격자는 응답 본문을 직접 읽지 못하지만, 브라우저 connection pool ordering과 timing 차이를 이용해 subdomain에 들어간 값을 조금씩 복원할 수 있습니다.

이 프로젝트는 그 흐름을 하나의 로컬 환경에서 직접 확인할 수 있게 구성되어 있습니다.

## Scenario

시나리오는 다음과 같습니다.

1. 봇이 victim origin에 방문해 `localStorage.flag` 를 설정합니다.
2. 이후 봇이 attacker 페이지를 열어 exploit을 실행합니다.
3. exploit은 victim 창의 hash 변경을 이용해 cross-origin 요청을 유도합니다.
4. 동시에 attacker 쪽 probe 요청과 짧은 sleep 요청을 섞어 timing oracle을 만듭니다.
5. 이 oracle을 이용해 subdomain에 들어간 flag hex를 한 글자씩 추정합니다.

## Goal

목표는 victim이 생성한 subdomain 요청을 timing side channel로 분석해 최종적으로 `wsl{...}` 형태의 flag를 복원하는 것입니다.

즉, 이 실습 환경의 핵심은 "응답 내용을 읽는 것"이 아니라 "요청 처리 순서와 지연 시간만으로 값을 유추하는 것"입니다.

## Run

### Docker

가장 간단한 실행 방법은 아래와 같습니다.

```bash
docker compose up --build
```

실행 후 브라우저에서 아래 주소로 접속하면 됩니다.

```text
http://localhost:1337/index.html
```

### Local

직접 실행하려면:

```bash
cd src
npm install
npm start
```

문법 확인:

```bash
cd src
npm run check
```
