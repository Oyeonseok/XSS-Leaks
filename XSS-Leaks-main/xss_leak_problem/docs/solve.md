# Cross-Site Subdomain Leak Solve.md

## 목차

1. [환경 구성](#1-환경-구성)
2. [정찰 - 서비스 구조 파악](#2-정찰---서비스-구조-파악)
3. [victim 동작 확인](#3-victim-동작-확인)
4. [bot 흐름 파악](#4-bot-흐름-파악)
5. [attacker 페이지 역할 확인](#5-attacker-페이지-역할-확인)
6. [oracle 구성](#6-oracle-구성)
7. [`000000...` 기준 요청의 의미](#7-000000-기준-요청의-의미)
8. [binary search로 flag 복원](#8-binary-search로-flag-복원)
9. [취약점 원인 요약](#9-취약점-원인-요약)

---

## 1. 환경 구성

### Docker 실행

```bash
docker compose up --build
```

### attacker 서버 실행

```bash
docker run --rm -p 3001:3001 -e PORT=3001 xss_leak_problem-web:latest sh -lc 'node /attacker/server.js'
```

### 접근 가능한 주소

| 서비스 | 주소 | 비고 |
|---|---|---|
| victim | http://example.localhost:1337/ | 문제 본체 |
| attacker | http://attacker.localhost:1337/index.html | viewer mode |
| attacker upstream | http://localhost:3001/ | attacker 서버 직접 확인용 |

---

## 2. 정찰 - 서비스 구조 파악

이 환경은 victim 과 attacker 가 같은 외부 포트 `1337` 을 쓰지만, Host 기준으로 라우팅됩니다.

- `example.localhost:1337` 으로 들어오면 victim 앱 처리
- `attacker.localhost:1337` 으로 들어오면 attacker upstream 으로 프록시

전체 구조는 다음과 같습니다.

```text
사용자 브라우저
   |
   +-- http://example.localhost:1337/    -> victim
   |
   +-- http://attacker.localhost:1337/   -> victim app 내부 프록시 -> attacker:3001
```

**관찰 포인트**

- victim 페이지는 `hashchange` 시 특정 요청을 새로 보냄
- `/report` 가 존재하고 bot 이 신고된 URL 을 방문함
- attacker 페이지는 단순 HTML 이 아니라 자동으로 leak 를 수행하는 로직을 포함함

---

## 3. victim 동작 확인

victim 페이지는 `localStorage.flag` 를 읽은 뒤 hex 로 인코딩하고, 아래 형태의 요청을 보냅니다.

```text
http://<hex(flag)>.<DOMAIN>:<PORT>
```

즉, 비밀값은 응답 본문이 아니라 **호스트 이름** 안에 실려 나갑니다.

예를 들어 flag 가 `wsl{...}` 라면 victim 은 실제 문자열 대신 그 hex 값을 서브도메인으로 사용합니다.

**관찰 포인트**

- 공격자는 응답 본문을 읽을 수 없음
- 대신 victim 이 어떤 호스트로 요청을 보냈는지가 중요함
- 결국 "요청 내용"이 아니라 "요청 처리 순서"를 관찰해야 함

---

## 4. bot 흐름 파악

`/report` 로 attacker URL 이 들어오면 bot 이 다음 순서로 동작합니다.

1. victim origin 방문
2. `localStorage.flag` 에 실제 flag 저장
3. 신고된 attacker URL 방문
4. attacker 페이지의 로그를 일정 시간 읽음

즉, attacker 는 직접 victim 상태를 만들지 않고 bot 방문을 통해서만 실제 flag 를 가진 victim 환경을 만들 수 있습니다.

이 구조 때문에 viewer mode 와 autorun mode 가 분리되어 있습니다.

---

## 5. attacker 페이지 역할 확인

attacker 페이지는 두 모드로 나뉩니다.

### viewer mode

- 사용자가 직접 여는 기본 화면
- bot 에게 같은 페이지의 `?autorun=1` URL 을 신고
- 실제 공격은 하지 않고 로그만 표시

### autorun mode

- bot 이 실제로 여는 공격 화면
- 새 victim 창을 열고 hash 를 바꾸면서 victim 요청을 반복 발생시킴
- timing oracle 을 이용해 flag 를 한 글자씩 복원

즉, viewer mode 는 관찰용이고 autorun mode 가 실제 공격 수행용입니다.

---

## 6. oracle 구성

### 6-1. connection pool 고갈

attacker 는 자신의 sleep 서버로 긴 요청을 `255`개 보내 브라우저 연결 대부분을 점유합니다.

```text
http://sleep<index>.<attacker-host>/360?q=<index>
```

이렇게 하면 사실상 마지막 연결 슬롯 하나만 남게 됩니다.

### 6-2. victim 요청과 candidate 요청 대기

문자 하나를 판정할 때는 다음 순서로 동작합니다.

1. blocker 요청으로 마지막 슬롯까지 막음
2. victim 창 hash 변경
3. victim 이 `http://<hex(flag)>...` 요청 생성
4. attacker 가 `http://<candidateHex>ffffff...` 요청 생성

이 시점에는 victim 요청과 candidate 요청 둘 다 대기 상태입니다.

### 6-3. threshold 기준

실제 판정 전에 아래 baseline 을 측정해 threshold 를 계산합니다.

- attacker probe 기본 지연
- victim origin 기본 지연
- `000000...` 폰트 요청 기본 지연

이 threshold 를 기준으로 candidate 요청이 정상적으로 빨리 끝난 것인지, 아니면 대기열 때문에 밀렸는지를 구분합니다.

---

## 7. `000000...` 기준 요청의 의미

마지막 blocker 를 끊어 슬롯 하나를 푼 직후, attacker 는 아래 요청을 보냅니다.

```text
http://000000.<attacker-host>/ssleep/<short-ms>
```

이 요청은 값을 직접 누출하는 용도가 아닙니다. 역할은 **기준 요청**입니다.

핵심은 이 요청 뒤에 아직 대기 중인 두 요청,

- victim 요청
- candidate 요청

중 누가 먼저 처리되는지를 보는 것입니다.

현재 구현은 이를 직접 읽는 대신, `candidate` 요청 완료 시간으로 간접 판정합니다.

- candidate 가 빨리 끝남  
  → victim 보다 먼저 처리된 것으로 해석
- candidate 가 늦게 끝남  
  → victim 이 먼저 처리되고 candidate 가 뒤로 밀린 것으로 해석

즉, oracle 의 본질은 "`000000...` 뒤에서 victim 과 candidate 중 누가 먼저 처리되는가"입니다.

---

## 8. binary search로 flag 복원

문자 판정은 `0-9a-f` 범위를 binary search 로 줄이는 방식입니다.

### 8-1. 시작 prefix

이미 알고 있는 시작 문자열 `wsl{` 의 hex 값인 아래 값에서 시작합니다.

```text
77736c7b
```

### 8-2. 다음 문자 판정

1. 중간 후보 문자 하나 선택
2. 같은 후보에 대해 oracle 여러 번 실행
3. blocked 여부를 다수결로 계산
4. 결과에 따라 lower half / upper half 결정

### 8-3. 종료 조건

복원된 hex 를 문자열로 decode 했을 때 `}` 가 등장하면 종료합니다.

즉, 전체 흐름은 아래와 같습니다.

```text
seedHex("wsl{")
  -> 다음 hex 문자 판정
  -> leak 뒤에 추가
  -> 다시 판정
  -> "}" 가 나올 때까지 반복
```

---

## 9. 취약점 원인 요약

### 원인 1 - victim 이 비밀값을 host 부분에 포함해 요청함

victim 은 flag 를 hex 로 바꾼 뒤 호스트 이름에 직접 넣어 요청합니다.

```text
http://<hex(flag)>.<DOMAIN>:<PORT>
```

이 설계 때문에 응답을 읽지 못해도 요청 대상 호스트의 정렬 관계를 timing 으로 관찰할 수 있습니다.

### 원인 2 - bot 이 실제 flag 를 가진 victim 환경을 만들어 줌

bot 은 victim origin 에 flag 를 심은 뒤 attacker 페이지를 방문합니다. 공격자는 이 흐름을 이용해 자신이 직접 접근할 수 없는 victim 상태를 간접적으로 공격합니다.

### 원인 3 - connection pool ordering 이 side channel 이 됨

브라우저 연결 대부분을 먼저 점유한 상태에서는, 남은 슬롯 하나가 누구에게 먼저 돌아가는지가 timing 차이로 드러납니다.

### 원인 4 - `000000...` 기준 요청으로 순서 비교가 안정화됨

`000000...` 요청을 먼저 흘려보낸 뒤 남은 victim 과 candidate 의 상대 순서를 보는 방식이라, 단순 단발 timing 보다 비교가 더 안정적으로 동작합니다.

---

## 최종 정리

이 문제는 victim 이 비밀값을 서브도메인에 담아 요청하는 상황에서, connection pool ordering 과 timing oracle 만으로 flag 를 복원하는 XSS-Leaks 실습 문제입니다.

정리하면:

1. bot 이 victim 에 flag 를 심음
2. attacker 가 connection pool 을 고갈시킴
3. victim 요청과 candidate 요청을 동시에 대기시킴
4. `000000...` 기준 요청을 보냄
5. 그 뒤 두 요청의 상대적 처리 순서를 candidate 완료 시간으로 판정
6. binary search 로 `hex(flag)` 를 복원
