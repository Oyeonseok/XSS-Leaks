# Solve

## 개요

victim 페이지는 `localStorage.flag` 값을 읽어 hex 로 인코딩한 뒤 `http://<hex(flag)>.<DOMAIN>:<PORT>` 요청을 보냅니다. 공격자는 응답 본문을 직접 읽을 수 없기 때문에, 브라우저 connection pool 에서 요청 처리 순서가 달라지는 타이밍 차이를 이용해 flag 를 복원합니다.

현재 익스플로잇은 viewer mode 와 autorun mode 로 나뉘어 있습니다. 사용자는 viewer mode 에서 로그만 보고, 실제 timing leak 는 bot 이 방문한 autorun mode 에서 수행됩니다.

## 익스플로잇 단계

### 1. viewer mode 에서 bot 신고

사용자가 `http://attacker.localhost:1337/index.html` 에 접속하면 기본적으로 viewer mode 가 열립니다. 이 모드는 직접 공격하지 않고, bot 에게 같은 페이지의 `?autorun=1` URL 을 신고하는 역할을 합니다.

### 2. bot 이 victim 환경 준비

bot 은 먼저 victim origin 에 방문해 `localStorage.flag` 를 심습니다. 그 다음 신고된 attacker autorun URL 을 방문합니다.  
이 단계가 있어야 victim 페이지가 실제 flag 값을 가진 상태에서 attacker 코드가 timing leak 를 수행할 수 있습니다.

### 3. autorun mode 시작

autorun mode 는 새 victim 창을 열고, 이후 이 창의 hash 를 바꿔 victim 이 내부적으로 `http://<hex(flag)>...` 요청을 다시 보내게 만듭니다.  
즉, victim 창은 비밀 요청을 만드는 쪽이고, attacker 창은 그 요청의 처리 순서를 관찰하는 쪽입니다.

### 4. baseline 측정과 threshold 계산

실제 누출 전에 먼저 세 가지 기본 지연을 측정합니다.

- attacker probe 요청의 기본 지연
- victim origin 요청의 기본 지연
- `000000.<attacker-host>` 폰트 요청의 기본 지연

이 값들로 threshold 를 자동 보정한 뒤, 이후 candidate 요청이 정상적으로 빨리 끝난 것인지 아니면 대기열 때문에 늦어진 것인지 판정합니다.

### 5. connection pool 고갈

attacker 는 자신의 sleep 서버로 장시간 요청 `255`개를 열어 브라우저 연결 대부분을 점유합니다. 이렇게 하면 사실상 마지막 슬롯 하나만 남고, 특정 요청이 그 슬롯을 언제 잡는지를 timing 으로 볼 수 있게 됩니다.

### 6. victim 요청과 candidate 요청을 대기열에 올림

문자 하나를 판정할 때마다 마지막 슬롯까지 blocker 로 막은 뒤, 아래 두 요청을 차례로 대기열에 올립니다.

- victim 이 보내는 `http://<hex(flag)>...`
- attacker 가 보내는 `http://<candidateHex>ffffff...`

이 둘은 마지막 슬롯이 풀리기 전까지 바로 처리되지 못하고 대기 상태가 됩니다.

### 7. `000000...` 기준 요청 전송

blocker 를 끊어 마지막 슬롯을 푼 직후, attacker 는 `000000.<attacker-host>` 로 짧은 요청을 하나 더 보냅니다.  
이 요청은 값을 누출하는 용도가 아니라, 블로그에서 설명한 것처럼 "그 다음 요청들의 순서를 비교하기 위한 기준점" 역할을 합니다.

### 8. 두 대기 요청의 상대 순서 판정

핵심은 `000000...` 뒤에 남아 있는 두 요청,

- victim 요청
- candidate 요청

중 누가 먼저 처리되느냐입니다.

현재 구현은 이 순서를 직접 읽는 대신, `candidate` 요청이 언제 끝나는지를 측정합니다.

- candidate 가 빨리 끝나면: victim 보다 먼저 처리된 것으로 해석
- candidate 가 늦게 끝나면: victim 이 먼저 처리되고 candidate 가 뒤로 밀린 것으로 해석

즉, 현재 oracle 은 "candidate 요청이 threshold 안에 끝났는가"지만, 본질적으로는 `000000...` 뒤에서 victim 과 candidate 중 누가 먼저 처리되는지를 보는 구조입니다.

### 9. binary search 로 다음 문자 복원

위 판정을 여러 번 반복해 다수결을 내고, `0-9a-f` 범위를 binary search 로 줄입니다. 그 결과 다음 hex 문자 하나가 결정되면 현재 누출값 뒤에 붙이고, 같은 과정을 반복합니다.

초기값은 이미 알고 있는 `wsl{` 의 hex 값인 `77736c7b` 입니다. decode 결과에 `}` 가 등장하면 복원을 종료합니다.

## 핵심 포인트

- `000000...` 요청은 기준 요청이다.
- 실제 oracle 은 그 뒤에 대기 중인 victim 과 candidate 의 상대적 처리 순서다.
- 현재 구현은 그 순서를 `candidate` 요청 완료 시간으로 간접 측정한다.
