# doil-supervise

범용 [Claude Code](https://claude.com/claude-code) 스킬. 요청을 **직접 구현하지 않고**
감독(supervisor)으로서 **오케스트레이션**한다: 요청 이해 → 작업을 **표준용어로 명명**
(terminology grounding) → 하위 과업별 **모델 라우팅**(근거 제시) → 분석·구현을
**서브에이전트에 위임** → 결과 종합·보고. supervisor-worker 멀티에이전트 패턴.

위임 전 task_context(SoT)를 써 두고 워커가 끝날 때마다 갱신해, 세션이 끊겨도 다음 세션이
이어갈 수 있게 한다. `mcp-server/`(doil-context MCP, dJinn/SQLite 기반)가 설치돼 있으면
그걸 우선 쓰고, 없으면 저장소 루트 `TASK_CONTEXT.md` 로 폴백한다. 하위과업의 검증 조건은
`/goal` 로 감독 세션에 고정한다.

특정 도메인 인프라에 의존하지 않는다. 레포에 `CLAUDE.md` 등 자체 지침이 있으면 함께 따른다.

- 방법론 본문: [`SKILL.md`](SKILL.md)

## 왜

매번 "네가 직접 하지 말고 서브에이전트로 시켜줘 / 모델 골라서 / 이게 무슨 작업인지도 표준용어로
알려줘"를 손으로 붙여 넣는 게 번거롭다. 이 스킬은 그 지시를 상시화한다.

## 설치 (글로벌)

개인 Claude Code 스킬 디렉토리로 링크하면 어디서든 `/doil-supervise` 로 트리거된다.

```bash
git clone https://github.com/D0iloppa/doil-supervise.git
cd doil-supervise
./install.sh                 # 이 스킬을 <config>/skills/ 로 심볼릭 링크
./install.sh --all-profiles  # (옵션) ~ 아래 모든 Claude 프로필에 한 번에 링크
```

기본은 `CLAUDE_CONFIG_DIR`(없으면 `~/.claude`)의 `skills/` 한 곳에 링크한다.
`--all-profiles` 를 주면 `~/.claude` 및 `~/.claude-*` 중 **`settings.json` 을 가진 실제
프로필**에 각각 링크한다(계정 설정 스냅샷 등은 제외).

## 쓰는 법

```
/doil-supervise <실제 과업>            # 새 오케스트레이션 (이해·명명·라우팅·위임·종합)
/doil-supervise follow                # TASK_CONTEXT.md 를 읽고 이어서 진행 (없으면 되물음)
/doil-supervise add <추가 요구>        # 기존 워커 유지, 워커 추가 투입
/doil-supervise edit <대상>: <변경>    # 특정 워커 방향 변경(SendMessage) 또는 중지(TaskStop)
/doil-supervise stop <대상>            # 해당 워커만 중지
/doil-supervise status                # 도는 워커·상태 요약
/doil-supervise model-limit <T1|T2|T3> # 이 세션 한정 모델 tier 상한 설정 (model-limit clear 로 해제)
/doil-supervise vacuum-all             # (doil-context MCP 전용) workspace의 task_context 전체 삭제.
                                        # 개수 확인 → 재확인 후에만 실행, 자동 트리거 없음
```

> `:` 콜론 하위커맨드가 아니라 **인자 모드**다(콜론은 플러그인 네임스페이스 전용). 첫 토큰
> `follow`/`add`/`edit`/`stop`/`status`/`model-limit` 로 분기하고, 없으면 기본 오케스트레이션.
> `TASK_CONTEXT.md` 가 저장소 루트에 있으면 `follow` 없이도 0단계(이해)에서 항상 먼저 읽는다.
> T3(심층) 라우팅은 근거 제시와 별개로 **사용자의 명시적 승인**이 와야 위임을 실행한다 —
> 감독이 스스로 승인 처리하고 자동 진행하지 않는다. tier(T1/T2/T3)와 provider별(Claude/Codex)
> 구체 모델명은 [`SKILL.md`의 모델 티어 조견표](SKILL.md#모델-티어-model-tier--provider-범용-조견표)
> 참고.

예) `/doil-supervise 동네지도 포스트패널에 무한스크롤 붙여줘`
→ 감독이 "이 작업은 *pagination(무한스크롤) 도입* 작업입니다"라 명명하고, 탐색은 T2(표준,
Claude 기준 sonnet), 구현은 T3(심층, Claude 기준 fable) 로 라우팅해 서브에이전트에 위임한
뒤 결과를 종합 보고한다.

예) 위 작업이 도는 중에 `/doil-supervise add 로딩 스켈레톤도 넣어줘`
→ 기존 워커는 두고, 스켈레톤 UI 워커(T3, Claude 기준 fable)를 추가 투입한다.

## 선택 요구사항 (optional requirements)

- **codebase-memory MCP** — https://github.com/DeusData/codebase-memory-mcp
  설치돼 있으면 분석 서브에이전트가 그래프 조회(search_graph/query_graph/trace_path 등)를
  1순위로 쓰도록 지시한다. 없으면 일반 분석 서브에이전트(Explore 등)로 그대로 진행하고,
  설치를 짧게 제안한다(강제 아님). 자세한 조건은 [`SKILL.md`](SKILL.md) 참고.

- **doil-context MCP** — 이 저장소 안의 [`mcp-server/`](mcp-server). `TASK_CONTEXT.md` 의
  SoT 역할을 dJinn(SQLite) 기반 MCP 서버로 대체하는 선택적 요구사항이다 — 워크스페이스별로
  메인/서브(워커) 티켓을 분리 저장해 여러 프로젝트·세션 간 컨텍스트가 섞이지 않게 하고,
  `vacuum`/`vacuum-all`/`export_md` 로 정리·스냅샷을 지원한다. 설치:
  `cd mcp-server && npm install` 후 Claude Code MCP 설정에 `node <스킬경로>/mcp-server/src/index.js`
  를 stdio 서버로 등록. 없으면 `TASK_CONTEXT.md` 로 그대로 폴백한다. 자세한 조건은
  [`SKILL.md`](SKILL.md) 참고.
