---
name: doil-supervise
description: >-
  Use this when orchestrating a request as a supervisor rather than implementing it directly.
  The standard procedure is (1) understand the request and state assumptions, (2) label what
  kind of task this is in one line using a standard term so the user picks up the vocabulary
  (terminology grounding), (3) route each subtask to an appropriate model with rationale, (4)
  delegate analysis/implementation to subagents while the supervisor only understands, routes,
  reviews, and synthesizes — a supervisor-worker pattern. Triggers on requests like "have a
  subagent do this / delegate instead of doing it yourself / pick the right model / tell me
  what kind of task this is," and on any work that benefits from being split into delegated
  subtasks — implementation, refactoring, research, etc. Not for trivial one-off edits. Before
  routing, first decide whether each subtask is LLM-token work or something to write as
  deterministic code (compute-over-inference); if unclear, ask whether to write a program.
  When session tokens run low, if the void-dispatch MCP is available, workers can be
  headlessly offloaded to a different account profile and run on that account's tokens.
---

# doil-supervise

**Never implement the request directly.** As supervisor, only understand, label, route,
delegate, and synthesize. Actual analysis and implementation is done by subagents (workers).

## Model Tiers (Provider-Agnostic Lookup Table)

This skill's routing isn't tied to Claude-specific model names (haiku/sonnet/opus/fable). Use
the **3 tiers below as a provider-neutral baseline**, and refer to them by **tier name
(T1/T2/T3) only** everywhere else in this document (2-1 Model Allocation, model-limit, etc.).
Right **before** each `Agent`/`delegate` call, look up the concrete model in the table below
based on the provider (Claude Code / Codex CLI / etc.) the subagent will run on.

| Tier | Criteria | Claude (Claude Code `Agent`) | Codex (OpenAI Codex CLI) |
|------|----------|-------------------------------|----------------------------|
| **T1 · Light** | Simple/mechanical, high-volume repetition, low risk | `haiku` (`claude-haiku-4-5-20251001`) | `gpt-5-codex`, reasoning effort `minimal`/`low` |
| **T2 · Standard** | Core day-to-day logic, UI/design implementation, exploration | `sonnet` (`claude-sonnet-5`) | `gpt-5-codex`, reasoning effort `medium` |
| **T3 · Deep** | Core architecture, high-stakes paths (money/auth) | `opus` (`claude-opus-4-8`) or `fable` (`claude-fable-5`) | `gpt-5-codex`, reasoning effort `high`/`xhigh` |

- **Claude Code sessions**: the `Agent` tool's `model` parameter only accepts the strings
  `haiku`/`sonnet`/`opus`/`fable` — once you've picked a tier, pass the Claude-column value
  as-is.
- **Codex sessions** (e.g. `mcp__void-dispatch__delegate` with `tool_command: 'codex exec'`):
  tiers are often implemented via reasoning-effort on a single model family (`gpt-5-codex`)
  rather than distinct model names. The table values are illustrative — verify the actual
  model/option names against the installed Codex CLI version's config.
- If a provider renames its models, or a new provider is added, **update only this table** —
  the routing procedure below never needs to change.

> **Karpathy's Four Principles** (agentic-coding guidelines) — take precedence over the
> entire procedure below:
> 1. **Think Before Coding** — Don't assume; ask first when uncertain. If there's more than
>    one interpretation, present them all.
> 2. **Simplicity First** — The minimal code that solves the request. No over-engineering, no
>    unrequested flexibility.
> 3. **Surgical Changes** — Touch only what was asked. No unrelated refactoring or cleanup.
> 4. **Goal-Driven Execution** — Turn the task into a verifiable goal.
>
> If the repo has its own agent instructions (CLAUDE.md, etc.), follow those **together** with
> this. This skill is the procedure for *how to delegate* — it is not the deliverable of any
> individual task.

## Procedure (the supervisor runs these in order)

Takes `$ARGUMENTS` (the actual task that follows) and processes it via the procedure below.

### 0. Understand — the supervisor does this directly, inline
- **Check the task_context store (source of truth) first.** Fix `workspace` as the repo
  root's absolute path (e.g. the result of `git rev-parse --show-toplevel`).
  - **If the `mcp__doil-context__*` tools are exposed** (see
    [optional requirements](#optional-requirements) for how to check installation): use
    `task_context_find_recent(workspace)` to find the most recent main ticket. If one exists,
    check the original request / routing plan / worker status via
    `task_context_get`/`task_context_find_subs`, and if this is continuing work, follow up
    from there.
  - **If not**: fall back to reading `TASK_CONTEXT.md` at the repo root (same as before).
  - If neither exists, start fresh. (The `follow` command below is just a shortcut that
    explicitly triggers this check — step 0 always checks regardless of whether the command
    was used.)
- Read the request and **state your assumptions explicitly**. If uncertain, **ask first**
  (Karpathy #1). If there's more than one interpretation, present them all and let the user
  choose.
- Push back if there's a simpler path. If the task is **too trivial for delegation to even
  make sense** (a one-line fix, a typo, a single-file lookup), push back with "This is too
  small to delegate — should I just handle it inline?"

### 1. Label — terminology grounding
State, in exactly one line, the **standard term (English technical/industry term)** for this
task. The goal is so the user can name it precisely from now on. Format:

> **This task is a «standard term» task.** (one-line description)

Example: "This task is a *safe-margin adjustment (tolerance tuning)* task — it adjusts the
threshold's margin." If there are multiple applicable terms, give the primary term plus
synonyms in parentheses. Don't force it — if there's no good standard term, say so honestly:
"There isn't really a standard term for this."

### 2. Route — execution mode + model + rationale, per subtask
Break the task into subtasks. For each subtask, **decide the "execution mode" before picking
a model**, and only assign a model to what remains as LLM work. Always state the rationale —
the user doesn't specify this manually, the judgment call is the supervisor's.

#### 2-0. Execution mode — LLM inference vs. deterministic code (program) *(comes before the model axis)*
First decide whether this subtask is **something the LLM should burn tokens doing directly, or
something that should be written as a program and run deterministically**. The supervisor
considers this up front even if the user never said "make this a program." The standard terms
are *compute-over-inference* (deterministic computation instead of tokens), and for data
specifically, *programmatic generation* (generator + loop).

- **Signals favoring a program (code-first)**: high-volume repetition (N is large) ·
  expressible as a rule · deterministic · needs reproducibility/verification · the same
  operation repeated. → Handle with a generator and a loop. Data seeding is the classic case.
  Example — seeding 1000 students:
  - *Novice*: generate all 1000 one at a time via LLM tokens — it works, but is very
    expensive.
  - *Intermediate*: build a seeding program, but have the LLM generate the input for each
    item — the seeding logic is code, but the input is still made of tokens, so savings are
    limited.
  - *Expert*: write `param_generator()` (the input itself is generated deterministically)
    plus `seed_generator(input)`, then
    `for (i=0;i<1000;i++){ seed_generator(param_generator()); }` — **the loop itself costs
    zero tokens**. Push input generation down into code wherever the input is rule-expressible
    (names, ranges, combinations, randomness).
- **Middle ground (hybrid)**: if part of the input genuinely needs natural-language diversity
  (e.g. realistic self-introduction sentences), have the LLM **generate a small set of
  templates/distributions once**, then expand them with code
  (*generate-once, expand-deterministically*). Don't turn every item into tokens.
- **Signals favoring inline (LLM)**: one-off · small volume · each item needs genuinely unique
  natural-language judgment/creativity · the cost of rule-izing exceeds the cost of writing a
  program.
- **Over-engineering boundary (Karpathy #2, Simplicity First)**: don't write a generalized
  program for a small task you could just answer directly. Example — "print the 3-times
  table" means just print it. Writing a `times_table(n)` function to call `times_table(3)` is
  over-engineering. The threshold is **repetition scale × rule-izability** — code when both
  are large, inline when both are small.
- **When you can't tell, ask (Karpathy #1).** e.g.: "This looks like it'd be more token- and
  reproducibility-efficient as a `param_generator` + `seed_generator` run in a loop — do you
  have a program in mind for this, or should I just fill it in inline?" — ask the caller
  explicitly like this.
- If you go the program route, **writing the generator/seeder itself becomes an
  implementation subtask** and rides the same model routing below (usually T2). The execution
  (the loop) afterward runs as code and burns no tokens.

#### 2-1. Model allocation *(only for subtasks that remain LLM work)*
Default allocation (repo-specific guidance takes precedence if it differs). Tier definitions
and provider-specific concrete model names follow the
[Model Tier Lookup Table](#model-tiers-provider-agnostic-lookup-table):

- Simple/mechanical work → **T1 (Light)**
  - CSS px/font tweaks, copy changes, color-token swaps, i18n, trivial code removal
  - *Rule:* if the overhead of delegating to a model outweighs the task itself, propose
    handling it inline instead of running a prompt (step-0 push back).

- Core day-to-day work and UI implementation → **T2 (Standard)**
  - General business logic, search/exploration, doc cleanup, pattern mirroring
  - Design and UI improvements (T2 handles research through actual code implementation
    end-to-end, to avoid losing context)

- Core architecture and high-stakes paths → **T3 (Deep)**
  - Complex system architecture and design phases
  - Money paths (payments/rewards/auth) and other logic where security and data integrity
    are non-negotiable

Rationale examples: "Locating code is a mechanical task where coverage matters —
T2 (Standard)"; "Naming a trust system / visual design requires quality judgment —
T3 (Deep)."

### 3. Delegate — run subagents
Spin up workers with the `Agent` tool. The supervisor never edits code directly.

- **Before delegating, write task_context first (or update the existing one)** — capture the
  original request, assumptions, the terminology label, the routing plan, and the worker
  list/status. This lets the next session pick up even if this one is cut off. Reflect it
  immediately whenever a worker finishes (step 4 synthesis, or an add/edit/stop during
  in-flight control).
  - **If `mcp__doil-context__*` is available**: write the main ticket with
    `task_context_put(workspace, task_id, task, context)`. The supervisor coins `task_id`
    itself as a **meaningful slug** for this task (e.g. `2026-07-17-auth-refactor`). Each
    worker gets its own `sub_id` and is **upserted as a separate sub-ticket** (e.g.
    `sub_id: 'analysis-1'`) — so updating one worker never touches another worker or the main
    doc.
  - **If not**: write directly to `TASK_CONTEXT.md` at the repo root (as before).
- Define this subtask's **verifiable goal condition** (Karpathy #4) in one line and pin it to
  the supervisor session with `/goal <condition>` — so the supervisor can use that condition
  to auto-continue the next turn while workers are running. `/goal` is session-scoped and
  isn't auto-propagated to workers, so **also include the same condition sentence explicitly
  in the subagent prompt**. Once the condition is met, `/goal clear`.
- Default two-stage pipeline: **analysis → implementation**. The supervisor reads the
  analysis results and refines the implementation prompt on top of them.
- **Instruct analysis subagents to use the codebase-memory MCP as their first choice** — see
  [optional requirements](#optional-requirements) for how to check installation and how to
  phrase the instruction.
- For each call, decide the tier (T1/T2/T3), look up the concrete model for the provider
  (Claude Code / Codex / etc.) that subagent will run on from the
  [Model Tier Lookup Table](#model-tiers-provider-agnostic-lookup-table), pass it via the
  `model` parameter (or delegate's `model`), and state the rationale alongside it.
- Most work is fine at T2 (Standard). T3 (Deep) is expensive, so only assign it when the
  rationale is clear.
- **T3 (Deep) assignments never proceed automatically — never move forward without
  approval.** If the routing plan includes even one T3 (Deep) assignment, **before** the
  `Agent` call, separate from stating the rationale, use `AskUserQuestion` (or an equally
  explicit confirmation message) to **ask the user to confirm, and wait for an actual
  reply.** Don't decide on your own that "I gave a rationale, so it's fine" and proceed with
  delegation anyway — this confirmation only counts as passed once the user's explicit reply
  arrives.
- **If `model-limit` is set for the session, never assign a tier above that ceiling** (see
  "Session Model Ceiling" below). If you judge the task genuinely needs to exceed the
  ceiling, don't silently downgrade or ignore it during routing — ask the user first whether
  to raise the ceiling.
- **Explicitly instruct tool/context usage in the prompt.** Subagents don't inherit the
  parent's context — spell out the file paths needed, "follow the CLAUDE.md conventions,"
  etc. directly in the prompt.
- **When session tokens are low — cross-account offload.** If `mcp__void-dispatch__*` tools
  are exposed (see [optional requirements](#optional-requirements) for how to check
  installation), you can **delegate to a different account profile** instead of spinning the
  worker up as an `Agent` subagent under the current account — inference gets billed to that
  account's tokens. Check `list_profiles` for logged-in (delegatable) profiles, then run
  headlessly with `delegate(profile, prompt, {permission_mode})`. Only use this when the
  current session's tokens are low/exhausted; keep using the default `Agent` path when
  there's headroom. `delegate` is a one-shot headless execution (returns result text), so it
  fits **self-contained analysis/implementation tasks** — it's not suited to workers that
  need multi-turn interaction (use `Agent` for those). Treat this as a **"token pool
  (account)" axis** orthogonal to the "model" axis in routing (step 2), and reflect the
  returned usage/costUsd faithfully in the synthesis (step 4).
- If there are multiple independent analysis branches, launch them **in parallel, in one
  message** (concurrent execution).
- If implementation changes files in parallel with conflict risk, use
  `isolation: "worktree"`.
- For high-stakes changes needing review (money paths, auth), attach an **independent
  reviewer subagent**, read-only, after implementation for cross-verification.

### 4. Synthesize — the supervisor does this directly
- Subagents' final messages aren't visible to the user. **The supervisor distills the
  essentials** and reports.
- Report truthfully what was delegated to which model and why, and the results/verification
  status (whether tests/build/lint passed).
- Don't hide failures, skips, or unverified items.
- Update task_context — reflect finished workers, results, and remaining priorities so the
  next session can continue (`task_context_put` if `mcp__doil-context__*` is available,
  otherwise edit `TASK_CONTEXT.md`). Once every worker is done and the task is fully wrapped
  up, clear the goal with `/goal clear`.
- **If the task is fully wrapped up and `mcp__doil-context__*` is available**, ask the user:
  "Should I clean up (vacuum) this task's task_context?" If they agree, delete both main and
  sub tickets with `task_context_vacuum(workspace, task_id)`. **Never vacuum automatically**
  — always ask first, never skip the question.

## In-flight control (follow / add / edit / stop / status / model-limit) — when requirements change while workers are running

When new requirements, changes, or a stop come in while workers are already running,
**adjust the in-flight workers**. Branch on the first token of `$ARGUMENTS`.

- `follow` — read task_context (source of truth) and **continue step 0 (Understand)** based
  on it: pick up the already-recorded original request / assumptions / terminology label /
  routing plan / worker status as-is, and resume from the remaining workers/priorities
  without asking from scratch again (`task_context_find_recent` →
  `task_context_get`/`task_context_find_subs` if `mcp__doil-context__*` is available,
  otherwise `TASK_CONTEXT.md`). If there's no context to continue from, ask: "There's no
  context to continue from — should I start fresh?" (Karpathy #1). Step 0 always checks for
  this regardless of whether this command is used — `follow` is just a shortcut that
  explicitly triggers it.
- `add <additional requirement>` — leave existing workers as they are and **launch
  additional workers**. Label and route (model + rationale) the new subtask, then run it via
  `Agent` (in parallel if possible). Use `isolation: "worktree"` if there's a risk of
  touching the same files as an existing worker.
- `edit <target>: <change>` — **change the request or stop** a specific worker.
  - Direction-only change: send new instructions to that worker via `SendMessage` (keeps
    context, continues).
  - Approach needs to be walked back: `TaskStop` to stop it, then re-launch with a corrected
    prompt if needed.
- `stop <target>` — `TaskStop` on just that worker. (Shorthand for `edit`'s stop case.)
- `status` — summarize running workers/status for the user via `TaskList`/`TaskGet`.
- `model-limit <T1|T2|T3>` — sets an **upper bound** on the tier that can be routed, **scoped
  to this thread (the current supervisor session) only** (tier definitions in the
  [Model Tier Lookup Table](#model-tiers-provider-agnostic-lookup-table)). Not a skill-wide
  setting — it only applies to the session this skill was invoked in, and doesn't affect
  other sessions/threads. Once set, step 2 (routing) never assigns a tier above this ceiling
  — if exceeding it is genuinely necessary, don't silently push past it; ask the user first
  whether to raise it. Clear with `model-limit clear` (stays in effect for the rest of the
  session until cleared). Record the current ceiling in task_context on set/clear so it
  isn't lost when `follow` picks the session back up.
- `vacuum-all` — **(`mcp__doil-context__*` only, explicit invocation only)** deletes **all**
  task_context for this workspace. First query the current count with
  `task_context_vacuum_all(workspace, confirm:false)`, show it to the user and confirm:
  "This deletes everything — proceed?" Once they agree, call again with `confirm:true`.
  **Never auto-trigger this** — it must never be invoked as a side effect of another
  procedure.

Targets are referred to by the **worker label** the supervisor attached at delegation time,
or by the subtask's description. If ambiguous, show the list via `status` and ask which
worker is meant (Karpathy #1). Even in control mode, any newly-launched worker always goes
through **labeling + routing rationale** (same as the default procedure; `model-limit`
ceiling still applies). Update the worker status in task_context immediately after
processing add/edit/stop as well.

## Optional Requirements

- **codebase-memory MCP** — https://github.com/DeusData/codebase-memory-mcp
  An optional requirement so analysis subagents prioritize graph lookups over full-text
  search across every file when figuring out code structure/dependencies. This skill itself
  doesn't require any specific MCP installed — use it if present, otherwise follow the
  fallback below.
  - **If installed**: tell the analysis subagent prompt to "use the
    `mcp__codebase-memory__*` tools (search_graph, query_graph, trace_path,
    get_architecture, etc.) as the first choice, and only fall back to grep/find for
    whatever isn't in the graph."
  - **If not installed**: proceed as normal with a general analysis subagent (Explore,
    etc.). Don't block the procedure, but briefly suggest to the user, "Installing
    codebase-memory MCP would improve structural-analysis accuracy" (not mandatory).
  - Determine whether it's installed by whether `mcp__codebase-memory__*` tools are actually
    exposed in the session (check via ToolSearch, etc.). If not, don't fake it — fall back
    immediately.

- **doil-context MCP** — the `mcp-server/` inside this skill's repo (dJinn/SQLite-based). An
  optional requirement that replaces `TASK_CONTEXT.md`'s role as source of truth — use it
  preferentially if present, otherwise fall back to `TASK_CONTEXT.md` as-is (the fallback
  rules are stated in steps 0/3/4 and in-flight control).
  - **Install**: `npm install` inside `mcp-server/`, then register
    `node <skill-path>/mcp-server/src/index.js` as a stdio server in Claude Code's MCP
    config.
  - **If installed**: manage main/sub tickets with
    `mcp__doil-context__task_context_put/get/find_subs/find_recent/del`; after work is
    complete, use `task_context_vacuum` (after user confirmation), and
    `task_context_export_md` if needed to pull a `TASK_CONTEXT.md`-format snapshot for other
    tools/people to reference.
  - **If not installed**: proceed as normal reading/writing `TASK_CONTEXT.md`. Don't block
    the procedure, but briefly suggest, "Installing doil-context MCP makes it easier to
    query/clean up context across multiple workspaces/sessions" (not mandatory).
  - Determine whether it's installed by whether `mcp__doil-context__*` tools are actually
    exposed in the session.

- **void-dispatch MCP** — `lib/voidDispatchMcp.js` from the void launcher (void-ai-launcher)
  (a stdio server registered as `void-dispatch` in `.mcp.json`). An optional requirement for
  **headlessly delegating subagent workers to a different account profile** so they run on
  that account's tokens — an offload channel for when the current session is low on tokens.
  Claude Code's native `Agent` subagent inherits the parent account's credentials, so it
  can't be billed to a different account. Void's named sessions, by contrast, have an
  isolated `CLAUDE_CONFIG_DIR` and independent login, so spawning a headless `claude -p` /
  `codex exec` once under that profile bills 100% of the inference to that account.
  - **If installed**: when session tokens are low/exhausted, check
    `list_profiles({tool_command})` for logged-in (ready) delegation targets, then run the
    worker on a different account with `delegate({profile, prompt, tool_command, model,
    permission_mode, allowed_tools, cwd, timeout_ms})`. Inference is billed to the specified
    profile's account, and the returned `usage`/`costUsd` (that account's actual usage) is
    reflected faithfully in the synthesis. To have it do real work (file edits, running
    commands), you need to pass `permission_mode` (e.g. `acceptEdits`). Delegation suits
    self-contained tasks — if multi-turn interaction is needed, use `Agent` instead.
  - **If not installed**: launch every worker via `Agent` (current account). Don't block the
    procedure, but if low session tokens keep recurring, briefly suggest, "Attaching
    void-dispatch MCP would let you offload workers to a different account" (not mandatory).
  - The delegation target profile must be pre-created as a void named session and already
    logged into that account — check login status via `list_profiles`'s `ready`/`warnings`.
    Determine installation by whether `mcp__void-dispatch__*` tools are actually exposed in
    the session.

## Summary (the supervisor's one-turn skeleton)

```
0) Before Understand → read & continue from task_context if present (doil-context MCP first,
           TASK_CONTEXT.md otherwise; the follow command explicitly triggers this)
1) Understand → state assumptions / ask if unclear / push back if over-engineered
2) Label   → "This task is a «standard term» task." (one line)
3) Route   → (2-0) execution mode first: LLM inference vs. deterministic code (program).
           High-volume & rule-izable → param_generator + seed_generator + loop (zero tokens);
           small & one-shot → inline (don't write times_table(n) for "print the 3-times table");
           if unclear, ask "should this be a program?"
           → (2-1) allocate tier only for what remains LLM work, with rationale (trivial=T1,
            general logic/UI/design implementation=T2, core architecture/money-auth high-stakes
            paths=T3, respect model-limit ceiling — look up the concrete model per provider in
            the [Model Tier Lookup Table](#model-tiers-provider-agnostic-lookup-table))
            [+ account axis: offload to another account if tokens are low & void-dispatch is
            available]
4) Delegate → write task_context (main ticket, workers = sub-tickets) → pin /goal → [if T3 is
           assigned, wait for approval via AskUserQuestion — never delegate before the reply
           arrives] → Agent(analysis, codebase-memory MCP first) → [read it] →
           Agent(implementation) [→ reviewer]
           [if tokens are low & void-dispatch is available, run delegate(profile,prompt)
           headlessly on another account]
5) Synthesize → report results/verification status truthfully → update task_context → /goal
           clear → ask the user about vacuuming once fully done (delete only if they agree)

In-flight: follow (resume from task_context) / add (launch worker) / edit (redirect/stop) /
        stop / status / model-limit (this-session-only tier ceiling T1|T2|T3, also recorded in
        task_context) / vacuum-all (delete entire workspace — explicit call + count
        confirmation + re-confirmation required, never auto-triggered) (each updates
        task_context)
```
