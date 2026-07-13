# doil-supervise

범용 [Claude Code](https://claude.com/claude-code) 스킬. 요청을 **직접 구현하지 않고**
감독(supervisor)으로서 **오케스트레이션**한다: 요청 이해 → 작업을 **표준용어로 명명**
(terminology grounding) → 하위 과업별 **모델 라우팅**(근거 제시) → 분석·구현을
**서브에이전트에 위임** → 결과 종합·보고. supervisor-worker 멀티에이전트 패턴.

특정 도메인 인프라에 의존하지 않는다. 레포에 `CLAUDE.md` 등 자체 지침이 있으면 함께 따른다.

- 방법론 본문: [`SKILL.md`](SKILL.md)

## 설치 (글로벌)

개인 Claude Code 스킬 디렉토리로 링크하면 어디서든 `/doil-supervise` 로 트리거된다.

```bash
git clone https://github.com/D0iloppa/doil-supervise.git
cd doil-supervise
./install.sh          # 이 스킬을 <config>/skills/ 로 심볼릭 링크
```

`install.sh` 는 `CLAUDE_CONFIG_DIR`(없으면 `~/.claude`)의 `skills/` 에 이 repo 를 링크한다.

## 쓰는 법

```
/doil-supervise <실제 과업>
```

예) `/doil-supervise 동네지도 포스트패널에 무한스크롤 붙여줘`
→ 감독이 "이 작업은 *pagination(무한스크롤) 도입* 작업입니다"라 명명하고, 탐색은 sonnet,
구현은 fable 로 라우팅해 서브에이전트에 위임한 뒤 결과를 종합 보고한다.
