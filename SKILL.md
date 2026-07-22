---
name: doil-supervise
description: >-
  요청을 직접 구현하지 않고 감독(supervisor)으로서 오케스트레이션할 때 사용한다. 표준 절차는
  (1) 요청을 이해하고 가정을 명시, (2) 이 작업이 무슨 작업인지 표준용어로 한 줄 명명해 사용자가
  어휘를 익히게 함(terminology grounding), (3) 하위 과업별로 적절한 모델을 근거와 함께 라우팅,
  (4) 분석·구현을 서브에이전트에 위임하고 감독은 이해·라우팅·검토·종합만 맡는 supervisor-worker
  패턴이다. "이거 서브에이전트로 시켜줘 / 네가 직접 하지 말고 위임해서 / 적절한 모델 골라서 /
  이 작업이 무슨 작업인지도 알려줘" 류, 그리고 구현·리팩터링·조사 등 하위 과업으로 쪼개
  위임하는 게 이로운 작업에서 트리거된다. 사소한 1회성 수정에는 쓰지 않는다. 세션 토큰이
  부족할 때 void-dispatch MCP 가 있으면 워커를 다른 계정 프로파일로 헤드리스 위임(오프로딩)해
  그 계정의 토큰으로 실행시킬 수 있다.
---

# doil-supervise

요청을 **직접 구현하지 않는다.** 감독(supervisor)으로서 이해·명명·라우팅·위임·종합만 한다.
실제 분석과 구현은 서브에이전트(worker)가 한다.

> **카파시 4원칙**(Karpathy's agentic-coding guidelines) — 아래 절차 전체에 우선한다:
> 1. **Think Before Coding** — 가정하지 말고, 불확실하면 먼저 묻는다. 해석이 둘 이상이면 모두 제시.
> 2. **Simplicity First** — 요청을 푸는 최소한의 코드. 과설계·요청 안 한 유연성 금지.
> 3. **Surgical Changes** — 시킨 것만 건드린다. 무관한 리팩터링·정리 금지.
> 4. **Goal-Driven Execution** — 작업을 검증 가능한 목표로 바꾼다.
>
> 레포에 자체 에이전트 지침(CLAUDE.md 등)이 있으면 그것을 **함께** 따른다. 이 스킬은 "어떻게
> 위임할지"의 절차이며, 개별 과업의 산출물이 아니다.

## 절차 (감독이 순서대로 수행)

`$ARGUMENTS`(뒤에 붙은 실제 과업)를 받아 아래 절차로 처리한다.

### 0. 이해 (Understand) — 감독이 직접, 인라인
- **task_context 저장소(SoT)를 먼저 확인한다.** `workspace`는 저장소 루트 절대경로(예:
  `git rev-parse --show-toplevel` 결과)로 고정한다.
  - **`mcp__doil-context__*` 툴이 노출돼 있으면(설치 여부는 [optional requirements](#optional-requirements)
    참고)**: `task_context_find_recent(workspace)` 로 최근 메인 티켓을 찾는다. 있으면
    `task_context_get`/`task_context_find_subs` 로 요청 원문·라우팅 계획·워커 상태를 확인하고
    이어갈 작업이면 거기서부터 follow-up 한다.
  - **없으면**: 저장소 루트의 `TASK_CONTEXT.md` 를 폴백으로 읽는다(기존 방식 그대로).
  - 둘 다 없으면 새로 시작한다. (아래 `follow` 커맨드는 이 확인을 명시적으로 트리거하는
    지름길일 뿐, 커맨드 없이도 0단계는 항상 먼저 확인한다.)
- 요청을 읽고 **가정을 명시**한다. 불확실하면 **먼저 묻는다**(카파시 #1). 해석이 둘 이상이면
  모두 제시하고 사용자가 고르게 한다.
- 더 단순한 길이 있으면 반박한다. **위임 자체가 과할 만큼 사소한 과업**(한 줄 수정, 오타,
  단일 파일 조회)이면 "이건 위임이 과합니다, 인라인으로 처리할까요?"라고 push back 한다.

### 1. 명명 (Label) — terminology grounding
반드시 한 줄로, 이 작업의 **표준용어(영문 기술/업계 용어)** 를 밝힌다. 사용자가 다음부터
적확히 지시할 수 있게 하는 게 목적이다. 형식:

> **이 작업은 «표준용어» 작업입니다.** (한 줄 설명)

예: "이 작업은 *safe-margin 조정(tolerance tuning)* 작업입니다 — 임계값 여유분을 조절합니다."
용어가 여럿이면 대표 용어 + 동의어를 괄호로. 억지로 만들지 말고, 마땅한 표준용어가 없으면
"표준용어가 딱히 없습니다"라고 솔직히 말한다.

### 2. 라우팅 (Route) — 하위 과업별 모델 + 근거
과업을 하위 과업으로 쪼개고, 각각에 모델을 배정하되 **근거를 반드시 제시**한다.
사용자가 모델을 수동 지정하지 않는다 — 판단은 감독 몫이다.

기본 배분 (레포지토리 지침이 다르면 그쪽 우선):



- 단순·기계적 작업 → **haiku**
  - CSS px/폰트 조정, 문구/카피 변경, 색상 토큰 교체, i18n, 단순 코드 제거
  - *Rule:* 모델 위임 오버헤드가 과업 자체보다 크다고 판단되면, 프롬프트 실행 대신 인라인 코드 처리를 직접 제안할 것 (0단계 push back).

- 주력 실무 및 UI 구현 → **sonnet**
  - 일반 비즈니스 로직, 검색·탐색, 문서 정리, 패턴 미러링
  - 디자인 및 UI 개선 (컨텍스트 유실 방지를 위해 리서치부터 실제 코드 구현까지 Sonnet이 일괄 처리)

- 코어 설계 및 고위험 경로 → **fable / opus**
  - 복잡한 시스템 아키텍처 및 설계 단계
  - 머니 경로(결제/보상/인증) 등 보안과 데이터 무결성이 절대적으로 보장되어야 하는 로직


근거 예: "코드 위치 탐색은 커버리지가 관건인 기계적 작업 — sonnet", "신뢰 체계 네이밍·시각
설계는 품질 판단 필요 — opus/fable".

### 3. 위임 (Delegate) — 서브에이전트 실행
`Agent` 도구로 worker 를 띄운다. 감독은 코드를 직접 수정하지 않는다.

- **위임 전, task_context를 먼저 기록(또는 기존 것을 이어서 갱신)한다** — 요청 원문, 가정,
  표준용어 명명, 라우팅 계획, 워커 목록/상태를 담는다. 세션이 끊겨도 다음 세션이 이를 읽고
  그대로 이어갈 수 있게 하기 위함이다. 워커가 하나 끝날 때마다(4단계 종합, 또는 진행 중
  제어의 add/edit/stop 발생 시) 즉시 반영한다.
  - **`mcp__doil-context__*` 있으면**: `task_context_put(workspace, task_id, task, context)` 로
    메인 티켓을 쓴다. `task_id`는 감독이 이번 작업을 가리키는 **의미있는 slug**를 직접 짓는다
    (예: `2026-07-17-auth-refactor`). 각 워커는 `sub_id`를 지정해 **서브 티켓으로 별도 upsert**
    한다(예: `sub_id: 'analysis-1'`) — 워커 하나 갱신이 다른 워커·메인 문서를 건드리지 않게
    하기 위함이다.
  - **없으면**: 저장소 루트 `TASK_CONTEXT.md` 에 직접 쓴다(기존 방식).
- 이 하위과업의 **검증 가능한 목표 조건**(카파시 #4)을 한 줄로 정의하고 `/goal <조건>` 으로
  감독 세션에 고정한다 — 워커가 도는 동안 감독이 그 조건 충족 여부를 기준으로 다음 턴을
  자동으로 이어가게 하기 위함이다. `/goal` 은 세션 차원 명령이라 워커에게 자동 전파되지
  않으므로, **동일한 조건 문장을 서브에이전트 프롬프트에도 명시적으로 포함**한다. 조건이
  충족되면 `/goal clear`.
- 기본 2단 파이프라인: **분석(analysis) → 구현(implementation)**. 분석 결과를 감독이 읽고,
  그 위에서 구현 프롬프트를 정교화한다.
- **분석(analysis) 서브에이전트는 codebase-memory MCP 를 1순위로 활용하도록 지시한다** —
  설치 여부 확인·구체 지시 방식은 [`[optional requirements]`](#optional-requirements) 참고.
- 각 호출에 `model`(haiku/sonnet/opus/fable) 오버라이드를 명시하고, 근거를 함께 남긴다.
- 대부분의 작업은 sonnet으로도 충분하다. opus, fable은 고비용이므로 근거가 명확할 때만 배정한다.
- **opus/fable 배정은 자동 진행 금지 — 승인 없이 넘어가지 않는다.** 라우팅 계획에 opus나
  fable이 하나라도 포함되면, 근거를 제시하는 것과 별개로 `Agent` 호출 **전에**
  `AskUserQuestion`(또는 동등하게 명시적인 확인 메시지)으로 사용자에게 **재확인을 요청하고
  실제 응답을 기다린다.** "근거를 댔으니 됐다"고 스스로 판단해 그대로 위임을 실행하지
  않는다 — 이 확인은 사용자의 명시적 응답이 와야 통과된 것으로 친다.
- **세션에 `model-limit` 이 설정돼 있으면 그 상한을 넘는 모델을 배정하지 않는다**(아래
  "세션 모델 상한" 참고). 과업상 상한을 넘겨야 한다고 판단되면, 라우팅 단계에서 임의로
  다운그레이드하거나 무시하지 말고 사용자에게 상한 상향 여부를 먼저 묻는다.
- **프롬프트에 도구·컨텍스트 사용을 명시적으로 지시한다.** 서브에이전트는 부모 컨텍스트를
  물려받지 않는다 — 필요한 파일 경로, "CLAUDE.md 규약을 따르라" 등을 프롬프트에 직접 써 준다.
- **세션 토큰이 부족할 때 — 계정-교차 위임(cross-account offload).** `mcp__void-dispatch__*`
  도구가 노출돼 있으면(설치 여부는 [optional requirements](#optional-requirements) 참고),
  워커를 현재 계정의 `Agent` 서브에이전트로 띄우는 대신 **다른 계정 프로파일로 위임**할 수
  있다 — inference 가 그 계정 토큰으로 청구된다. `list_profiles` 로 로그인된(위임 가능한)
  프로파일을 확인하고, `delegate(profile, prompt, {permission_mode})` 로 헤드리스 실행한다.
  현재 세션 토큰이 부족/소진됐을 때만 쓰고, 여유가 있으면 기본 `Agent` 경로를 유지한다.
  `delegate` 는 1회성 헤드리스 실행(결과 텍스트 반환)이라 **자기완결적 분석·구현 과업**에
  적합하고, 여러 턴 상호작용이 필요한 워커에는 부적합하다 — 그런 워커는 `Agent` 로 띄운다.
  라우팅(2단계)의 "모델" 축과 직교하는 **"토큰 풀(계정)" 축**으로 다루고, 반환값의
  usage/costUsd 를 종합(4단계)에 사실대로 반영한다.
- 독립적인 분석 갈래가 여럿이면 **한 메시지에서 병렬로** 띄운다(동시 실행).
- 구현이 파일을 병렬 변경해 충돌 위험이 있으면 `isolation: "worktree"` 를 쓴다.
- 검토가 필요한 고위험 변경(머니 경로·인증)이면 구현 뒤 **독립 reviewer 서브에이전트**를
  read-only 로 붙여 교차검증한다.

### 4. 종합 (Synthesize) — 감독이 직접
- 서브에이전트의 최종 메시지는 사용자에게 보이지 않는다. **감독이 핵심만 추려** 보고한다.
- 무엇을 어떤 모델에 왜 맡겼는지, 결과·검증 상태(테스트/빌드/lint 통과 여부)를 사실대로 전한다.
- 실패·건너뜀·미검증은 숨기지 않는다.
- task_context 를 갱신한다 — 완료된 워커·결과·남은 우선순위를 반영해 다음 세션이 이어갈 수
  있게 한다(`mcp__doil-context__*` 있으면 `task_context_put`, 없으면 `TASK_CONTEXT.md` 수정).
  모든 워커가 끝나 작업이 완전히 마무리됐으면 `/goal clear` 로 목표를 해제한다.
- **작업이 완전히 마무리됐고 `mcp__doil-context__*` 가 있으면**, 사용자에게 "이 task의
  task_context를 정리(vacuum)할까요?"라고 되묻는다. 동의하면 `task_context_vacuum(workspace,
  task_id)` 로 메인+서브 티켓을 모두 삭제한다. **자동으로 vacuum 하지 않는다** — 되묻지 않고
  넘어가지 않는다.

## 진행 중 제어 (follow / add / edit / stop / status / model-limit) — 워커가 도는 도중 요구가 바뀔 때

이미 워커가 돌고 있는데 추가 요구·변경·중지가 들어오면 **in-flight 워커를 조정**한다.
`$ARGUMENTS` 의 첫 토큰으로 분기한다.

- `follow` — task_context(SoT)를 읽고 그 내용을 기준으로 **0단계(이해)를 이어간다**: 이미
  기록된 요청 원문·가정·표준용어 명명·라우팅 계획·워커 상태를 그대로 이어받아, 처음부터
  다시 묻지 않고 남은 워커/우선순위부터 재개한다(`mcp__doil-context__*` 있으면
  `task_context_find_recent` → `task_context_get`/`task_context_find_subs`, 없으면
  `TASK_CONTEXT.md`). 이어갈 컨텍스트가 없으면 "이어갈 컨텍스트가 없습니다, 새로 시작할까요?"
  라고 되묻는다(카파시 #1). 이 커맨드가 없어도 0단계는 항상 존재 여부를 먼저 확인한다 —
  `follow` 는 그걸 명시적으로 트리거하는 지름길일 뿐이다.
- `add <추가 요구>` — 기존 워커는 그대로 두고 **워커를 추가 투입**한다. 새 하위과업을
  명명·라우팅(모델+근거)한 뒤 `Agent` 로 (가능하면 병렬) 실행한다. 기존 워커와 같은 파일을
  건드릴 위험이 있으면 `isolation: "worktree"`.
- `edit <대상>: <변경>` — 특정 워커의 **요청을 변경하거나 중지**한다.
  - 방향만 바꾸면 됨: `SendMessage` 로 그 워커에 새 지시를 보낸다(컨텍스트 유지, 이어서 진행).
  - 접근이 틀어져 되돌려야 함: `TaskStop` 으로 중지 후, 필요 시 교정된 프롬프트로 재투입.
- `stop <대상>` — 해당 워커만 `TaskStop`. (`edit` 의 중지 케이스를 짧게 부른 것)
- `status` — `TaskList`/`TaskGet` 으로 도는 워커·상태를 사용자에게 요약한다.
- `model-limit <haiku|sonnet|opus|fable>` — **이번 스레드(현재 감독 세션)에 한정해** 라우팅
  가능한 모델의 **상한**을 설정한다. 스킬 전역 설정이 아니라 이 스킬이 호출된 세션에만
  적용되며, 다른 세션·다른 스레드에는 영향을 주지 않는다. 설정 후에는 2단계(라우팅)에서
  이 상한을 넘는 모델을 배정하지 않는다 — 상한 초과가 필요하다고 판단되면 임의로 넘기지
  말고 사용자에게 상향을 먼저 묻는다. `model-limit clear` 로 해제한다(해제 전까지는 세션
  내내 유지된다). 설정/해제 시 task_context 에도 현재 상한을 기록해 `follow` 로 이어받을 때
  사라지지 않게 한다.
- `vacuum-all` — **(`mcp__doil-context__*` 전용, 명시적 호출 시에만)** 이 workspace의
  task_context를 **모두** 삭제한다. `task_context_vacuum_all(workspace, confirm:false)` 로
  먼저 현재 개수를 조회해 사용자에게 보여주고 "모두 삭제합니다, 진행할까요?"라고 재확인한
  뒤, 동의를 받으면 `confirm:true` 로 재호출한다. **절대 자동으로 트리거하지 않는다** — 다른
  절차의 부산물로 호출되지 않는다.

대상 지정은 위임 시 감독이 붙인 **워커 라벨**이나 하위과업 설명으로 가리킨다. 애매하면
`status` 로 목록을 보이고 어느 워커인지 되묻는다(카파시 #1). 제어 모드에서도 새로 투입하는
워커는 반드시 **명명·라우팅 근거**를 거친다(기본 절차와 동일, `model-limit` 상한도 그대로
적용). add/edit/stop 처리 직후에도 task_context 의 워커 상태를 즉시 갱신한다.

## [optional requirements]

- **codebase-memory MCP** — https://github.com/DeusData/codebase-memory-mcp
  분석 서브에이전트가 코드 구조·의존관계를 파악할 때 전체 파일 풀텍스트 검색 대신 그래프
  조회를 1순위로 쓰게 하기 위한 선택적 요구사항이다. 이 스킬 자체는 특정 MCP 설치를 강제하지
  않는다 — 있으면 활용하고, 없으면 아래 폴백을 따른다.
  - **설치돼 있으면**: 분석 서브에이전트 프롬프트에 "`mcp__codebase-memory__*` 도구
    (search_graph, query_graph, trace_path, get_architecture 등)를 1순위로 사용하고, 그래프에
    없는 부분만 grep/find 로 보완하라" 를 명시한다.
  - **설치돼 있지 않으면**: 일반 분석 서브에이전트(Explore 등)로 그대로 진행한다. 절차를
    막지 않되, 사용자에게 "codebase-memory MCP 를 설치하면 구조 파악 정확도가 올라갑니다"
    라고 짧게 설치를 제안한다(강제하지 않음).
  - 설치 여부는 세션에 `mcp__codebase-memory__*` 도구가 실제로 노출돼 있는지로 판단한다
    (ToolSearch 등으로 확인). 없으면 억지로 흉내내지 않고 바로 폴백한다.

- **doil-context MCP** — 이 스킬 저장소 안의 `mcp-server/` (dJinn/SQLite 기반). `TASK_CONTEXT.md`
  의 SoT 역할을 대체하는 선택적 요구사항이다 — 있으면 우선 사용하고, 없으면 `TASK_CONTEXT.md`
  로 그대로 폴백한다(0/3/4단계 및 진행 중 제어에 폴백 규칙이 명시돼 있다).
  - **설치**: `mcp-server/`에서 `npm install` 후, Claude Code MCP 설정에 `node
    <스킬경로>/mcp-server/src/index.js` 를 stdio 서버로 등록한다.
  - **설치돼 있으면**: `mcp__doil-context__task_context_put/get/find_subs/find_recent/del`
    로 메인/서브 티켓을 관리하고, 작업 완료 후에는 `task_context_vacuum` (사용자 확인 후),
    필요 시 `task_context_export_md` 로 `TASK_CONTEXT.md` 형식 스냅샷을 뽑아 다른 도구/사람이
    참고하게 할 수 있다.
  - **설치돼 있지 않으면**: `TASK_CONTEXT.md` 읽기/쓰기로 그대로 진행한다. 절차를 막지 않되,
    "doil-context MCP를 설치하면 여러 워크스페이스/세션 간 컨텍스트 조회·정리가 쉬워집니다"
    라고 짧게 설치를 제안한다(강제하지 않음).
  - 설치 여부는 세션에 `mcp__doil-context__*` 도구가 실제로 노출돼 있는지로 판단한다.

- **void-dispatch MCP** — void 런처(void-ai-launcher)의 `lib/voidDispatchMcp.js` (stdio 서버,
  `.mcp.json` 에 `void-dispatch` 로 등록). 서브에이전트 워커를 **다른 계정 프로파일로 헤드리스
  위임**해 그 계정의 토큰으로 실행시키는 선택적 요구사항이다 — 현재 세션 토큰이 부족할 때의
  오프로딩 채널이다. Claude Code 의 네이티브 `Agent` 서브에이전트는 부모 계정 크리덴셜을
  상속하므로 다른 계정으로 청구시킬 수 없다. 반면 void 의 named session 은 격리된
  `CLAUDE_CONFIG_DIR` + 독립 로그인을 가지므로, 그 프로파일로 헤드리스 `claude -p` / `codex
  exec` 를 1회 spawn 하면 inference 가 100% 그 계정 토큰으로 청구된다.
  - **설치돼 있으면**: 세션 토큰이 부족/소진된 상황에서 `list_profiles({tool_command})` 로
    로그인된(ready) 위임 대상을 확인하고, `delegate({profile, prompt, tool_command, model,
    permission_mode, allowed_tools, cwd, timeout_ms})` 로 워커를 다른 계정으로 실행한다.
    inference 는 지정 프로파일 계정으로 청구되며, 반환값의 `usage`/`costUsd`(그 계정이 실제
    쓴 사용량)를 종합에 반영한다. 파일 편집·명령 실행 등 실작업을 시키려면
    `permission_mode`(예: `acceptEdits`) 를 넘겨야 한다. 위임은 자기완결적 과업에 적합하다 —
    여러 턴 상호작용이 필요하면 기본 `Agent` 로 띄운다.
  - **설치돼 있지 않으면**: 모든 워커를 `Agent`(현재 계정) 로 띄운다. 절차를 막지 않되,
    세션 토큰 부족이 반복되면 "void-dispatch MCP 를 붙이면 다른 계정으로 워커를 오프로딩할
    수 있습니다" 라고 짧게 제안한다(강제하지 않음).
  - 위임 대상 프로파일은 void 의 named session 으로 미리 만들어 그 계정으로 로그인돼 있어야
    한다 — `list_profiles` 의 `ready`/`warnings` 로 로그인 여부를 점검할 수 있다. 설치 여부는
    세션에 `mcp__void-dispatch__*` 도구가 실제로 노출돼 있는지로 판단한다.

## 요약 (감독의 1턴 골격)

```
0) 이해 전 → task_context 있으면 먼저 읽고 이어감 (doil-context MCP 1순위, 없으면 TASK_CONTEXT.md;
           follow 커맨드는 이걸 명시적으로 트리거)
1) 이해   → 가정 명시 / 애매하면 질문 / 과설계면 push back
2) 명명   → "이 작업은 «표준용어» 작업입니다." (한 줄)
3) 라우팅 → 하위과업별 모델 + 근거 (사소 시각·문구=haiku, 로직·디자인=fable/opus, model-limit 상한 준수)
           [+ 계정 축: 세션 토큰 부족 & void-dispatch 있으면 워커를 다른 계정으로 오프로딩]
4) 위임   → task_context 작성(메인 티켓, 워커=서브 티켓) → /goal 고정 → [opus/fable 배정 시
           AskUserQuestion 으로 승인 대기, 응답 오기 전 위임 실행 금지] → Agent(analysis,
           codebase-memory MCP 1순위) → [읽고] → Agent(implementation) [→ reviewer]
           [토큰 부족 시 & void-dispatch 있으면 delegate(profile,prompt) 로 다른 계정 헤드리스 실행]
5) 종합   → 결과·검증상태 사실 보고 → task_context 갱신 → /goal clear → 완전 종료 시 vacuum
           여부 사용자에게 확인(동의 시에만 삭제)

진행 중: follow(task_context 이어받기) / add(워커 추가) / edit(방향변경·중지) / stop / status
        / model-limit(이 세션 한정 모델 상한 설정, task_context 에도 기록) / vacuum-all(workspace
        전체 삭제 — 명시적 호출 + 개수 확인 + 재확인 필수, 자동 트리거 금지) (각각 task_context 갱신)
```
