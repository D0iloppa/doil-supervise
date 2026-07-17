# doil-context-mcp

`doil-supervise` 스킬의 `TASK_CONTEXT.md` SoT 역할을 대체하는 MCP 서버. 스토리지 엔진으로
[dJinn](https://github.com/D0iloppa/dJinn)(embedded SQLite JSON store)을 그대로 쓰고, 이
패키지는 task_context 도메인 로직(메인/서브 티켓, vacuum, export)만 얹는다.

## 설치

```bash
cd mcp-server
npm install
```

Claude Code MCP 설정(`~/.claude/settings.json` 등)에 stdio 서버로 등록:

```json
{
  "mcpServers": {
    "doil-context": {
      "command": "node",
      "args": ["/absolute/path/to/doil-supervise/mcp-server/src/index.js"]
    }
  }
}
```

## 데이터

`data/task_context.db` (gitignored) — 심볼릭 링크 배포되는 이 스킬 저장소 하나가 유일한
실물 위치이므로, 모든 Claude 프로필/워크스페이스가 이 파일 하나를 공유하는 글로벌 SoT다.
`workspace` 필드(저장소 루트 절대경로)로 프로젝트 간 데이터를 구분한다.

## 스키마

dJinn 컬렉션 `task_context`, 고정 `{id, doc}` 위에 `doc`을 다음 형태로 사용한다:

```
id  = "<workspace>|<task_id>"           // 메인 티켓
id  = "<workspace>|<task_id>|<sub_id>"  // 서브 티켓(워커)

doc = { workspace, task_id, sub_id, type: 'main'|'sub', task, context, created_at, modified_at }
```

인덱스: `workspace`, `task_id`, `type`, `modified_at`.

## 툴

| 툴 | 용도 |
|---|---|
| `task_context_put` | 메인/서브 티켓 upsert |
| `task_context_get` | 단건 조회 |
| `task_context_find_subs` | 특정 task_id의 서브 티켓 전체 조회 |
| `task_context_find_recent` | workspace의 최근 메인 티켓 조회 (`follow` 용) |
| `task_context_del` | 단건 삭제 |
| `task_context_vacuum` | 특정 task_id의 메인+서브 전체 삭제 |
| `task_context_vacuum_all` | workspace 전체 삭제. `confirm:false`(기본)면 개수만 반환, `confirm:true`일 때만 실제 삭제 |
| `task_context_export_md` | 메인+서브를 `TASK_CONTEXT.md` 형식 마크다운 문자열로 합성해 반환(파일 쓰기는 호출자 몫) |

자세한 사용 규칙(언제 vacuum을 물어야 하는지 등)은 [`../SKILL.md`](../SKILL.md) 참고.
