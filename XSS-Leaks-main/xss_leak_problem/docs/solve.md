# Solve

## 개요

이 문제는 victim 페이지가 `localStorage.flag` 값을 읽고, 이를 hex 로 인코딩한 뒤 서브도메인에 포함해 요청을 보내는 구조를 이용합니다. 공격자는 응답 본문을 읽을 수 없지만, 브라우저 connection pool 에서 어떤 요청이 먼저 슬롯을 잡는지에 따른 timing 차이를 이용해 `hex(flag)` 를 한 글자씩 복원할 수 있습니다.

현재 구현은 단순 PoC 가 아니라 로컬 실습용 랩 형태에 가깝습니다. 공격 페이지는 viewer mode 와 autorun mode 로 나뉘고, threshold 도 고정값이 아니라 baseline 측정을 통해 자동 보정됩니다.

## 관련 파일

- `app/src/victim/app.js`: victim 앱과 `/report` 엔드포인트, attacker upstream 프록시
- `app/src/victim/bot.js`: 봇이 victim origin 에 flag 를 심고 attacker URL 을 방문하는 로직
- `app/views/index.ejs`: victim 페이지. `hashchange` 시 `http://<hex(flag)>.DOMAIN:PORT` 요청 전송
- `attacker/exploit.html`: viewer mode, autorun mode, timing oracle, binary search 구현
- `attacker/app.js`: exploit 페이지 및 sleep 엔드포인트 제공
- `attacker/server.js`: attacker 서버 실행 엔트리

## 전체 흐름

### 1. victim 동작

victim 페이지는 `hashchange` 가 발생하면 `localStorage.flag` 를 읽습니다. 이후 flag 문자열을 hex 로 인코딩하고, 아래 형태의 요청을 보냅니다.

```text
http://<hex(flag)>.<DOMAIN>:<PORT>
```

이 요청의 응답 내용을 공격자가 읽는 것은 불가능합니다. 대신 "이 요청이 connection pool 경쟁에서 언제 처리되느냐"가 side channel 이 됩니다.

### 2. bot 동작

`/report` 로 attacker URL 이 들어오면 bot 이 실행됩니다.

1. bot 은 먼저 victim origin 을 방문합니다.
2. incognito context 의 victim origin `localStorage.flag` 에 실제 플래그를 저장합니다.
3. 그 다음 신고된 attacker URL 을 방문합니다.
4. attacker 페이지의 로그를 일정 시간 동안 주기적으로 읽어 콘솔에 남깁니다.

즉, attacker 는 직접 flag 를 심을 수 없고, 반드시 bot 의 방문 흐름을 통해 victim 상태를 만든 뒤 timing leak 를 수행해야 합니다.

### 3. attacker 동작

attacker 페이지는 두 모드로 나뉩니다.

- viewer mode: 사용자가 여는 기본 화면입니다. 직접 누출을 수행하지 않고, 봇에게 같은 페이지의 `?autorun=1` URL 을 신고한 뒤 공유 로그만 표시합니다.
- autorun mode: 봇이 실제로 여는 화면입니다. 새 victim 창을 열고, hash 변경과 timing 측정을 반복하면서 flag 를 복원합니다.

이 분리 덕분에 사용자는 로그만 보고, 실제 공격은 bot 이 연 브라우저 컨텍스트에서 수행됩니다.

## Oracle 구성

### 1. connection pool 고갈

attacker 는 자신의 sleep 서버로 장시간 요청을 `255`개 보내 대부분의 연결 슬롯을 먼저 점유합니다. 구현상 기본 전체 연결 수를 `256`으로 보고, 마지막 1개 슬롯만 oracle 판정에 사용합니다.

이때 사용되는 요청은 대략 아래 형태입니다.

```text
http://sleep<index>.<attacker-host>/360?q=<index>
```

각 요청은 `AbortController` 로 잡고 있어서, 필요할 때 특정 슬롯을 해제할 수 있습니다.

### 2. victim 요청 트리거

oracle 한 번을 측정할 때 attacker 는 추가 blocker 요청 하나를 열어 마지막 슬롯도 막습니다. 그 뒤 victim 창의 hash 를 바꿔 victim 이 다시 `http://<hex(flag)>...` 요청을 만들게 합니다.

이 시점에서 victim 요청은 즉시 처리되지 못하고 대기열에 들어갑니다.

### 3. candidate probe 요청

직후 attacker 는 현재 추측 중인 prefix 를 바탕으로 probe 요청을 하나 더 보냅니다.

```text
http://<candidateHex>ffffff.<attacker-host>/0?q=<candidateHex>
```

`candidateHex + "ffffff"` 형태를 쓰는 이유는 현재 prefix 와 실제 `hex(flag)` 의 사전순 관계를 비교하기 위함입니다.

### 4. 마지막 슬롯 해제 후 기준 요청 전송

blocker 요청을 끊어 마지막 슬롯 하나를 비운 다음, attacker 는 짧은 폰트 로딩 요청을 보냅니다.

```text
http://000000.<attacker-host>/ssleep/<short-ms>
```

이 요청은 직접 값을 누출하는 역할보다는, 마지막 슬롯이 언제 풀렸는지를 안정적으로 맞추기 위한 기준 신호 역할을 합니다. 현재 구현은 일반 `fetch` 대신 `FontFace` 로딩을 사용합니다.

### 5. timing 판정

attacker 는 자신의 probe 요청이 threshold 보다 늦었는지 측정합니다.

- probe 가 threshold 이내로 끝나면: 현재 candidate 가 더 작은 쪽이라고 해석
- probe 가 threshold 를 넘기면: victim 요청에 밀렸거나 더 늦게 처리된 것으로 보고 반대쪽이라고 해석

이 yes/no 결과가 곧 oracle 입니다.

## 문자 복원 방식

각 hex 문자 후보는 `0-9a-f` 범위에서 binary search 로 찾습니다.

1. 현재까지 알아낸 `leak` 뒤에 중간값 문자 하나를 붙입니다.
2. 같은 후보에 대해 oracle 을 여러 번 실행합니다.
3. blocked 판정 수를 다수결로 정리합니다.
4. 결과에 따라 lower half 또는 upper half 로 범위를 줄입니다.
5. 문자가 결정되면 `leak` 뒤에 붙이고 다음 문자로 넘어갑니다.

현재 구현은 다음 보정값을 사용합니다.

- 시작 prefix: `wsl{` 의 hex 인 `77736c7b`
- 문자당 샘플 수: `5`
- 실패 시 재시도 횟수: `4`
- 종료 조건: decode 된 문자열에 `}` 가 등장할 때까지 반복

## Threshold 보정

기존 PoC 처럼 고정 threshold 를 쓰지 않고, 아래 세 종류의 baseline 을 먼저 측정합니다.

1. attacker probe 자체의 기본 지연
2. victim origin 요청의 기본 지연
3. 폰트 로딩 요청의 기본 지연

각 baseline 에 대해 p50, p75, p90 을 구한 뒤, 현재 구현은 대략 아래 개념으로 threshold 를 만듭니다.

```text
threshold =
  leakBaseline.p50 +
  targetBaseline.p50 +
  fontBaseline.p50 +
  max(15, 각 baseline 의 p90-p50 합)
```

이 방식은 단순 평균보다 이상치에 덜 흔들리고, 로컬 환경 차이에도 덜 민감합니다.

## Minimal PoC 와의 차이

현재 구현은 공개된 subdomain leak 아이디어를 그대로 따르면서도 실습 안정성을 위해 몇 가지를 추가했습니다.

- viewer mode 와 autorun mode 를 분리해 사용자는 로그만 보고, 실제 공격은 bot 이 수행
- `/api/exploit-state` 로 진행 로그를 공유해 bot 이 수행 중인 상태를 외부 창에서도 확인 가능
- 고정 threshold 대신 baseline 측정 기반 자동 보정 사용
- 단일 측정이 아니라 다수결 샘플링으로 문자 판정
- victim 창 warmup 을 먼저 수행해 첫 `hashchange` 누락 가능성 완화

즉, 핵심 아이디어는 동일하지만 현재 저장소는 "동작 원리 설명용 PoC" 보다 "재현 가능한 로컬 실습 환경"에 더 가깝습니다.
