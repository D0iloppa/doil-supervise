'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { djinn, makeId } = require('./db');

const COLLECTION = 'task_context';

function json(text) {
  return { content: [{ type: 'text', text: JSON.stringify(text, null, 2) }] };
}

function exportMarkdown(main, subs) {
  const lines = [];
  lines.push(`# TASK_CONTEXT (${main.task_id})`);
  lines.push('');
  lines.push(`- workspace: ${main.workspace}`);
  lines.push(`- created_at: ${main.created_at}`);
  lines.push(`- modified_at: ${main.modified_at}`);
  lines.push('');
  lines.push('## 요청');
  lines.push('');
  lines.push(main.task || '(없음)');
  lines.push('');
  lines.push('## 컨텍스트');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(main.context ?? {}, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## 워커');
  lines.push('');
  if (!subs.length) {
    lines.push('(워커 없음)');
  } else {
    for (const s of subs) {
      lines.push(`### ${s.sub_id}`);
      lines.push('');
      lines.push(s.task || '(없음)');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(s.context ?? {}, null, 2));
      lines.push('```');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function createServer() {
  const server = new McpServer({ name: 'doil-context', version: '0.1.0' });

  server.tool(
    'task_context_put',
    "메인 티켓(sub_id 생략) 또는 서브 티켓(sub_id 지정)을 upsert 한다. task_id/sub_id는 감독(LLM)이 의미있는 slug로 직접 짓는다.",
    {
      workspace: z.string().describe('저장소 루트 절대경로'),
      task_id: z.string().describe('감독이 지정한 티켓 slug (예: 2026-07-17-auth-refactor)'),
      sub_id: z.string().optional().describe('서브 티켓(워커) slug — 생략 시 메인 티켓'),
      task: z.string().optional().describe('원본 요청 또는 워커 설명'),
      context: z.record(z.any()).optional().describe('가정/라우팅계획/워커상태/goal/model-limit 등 자유 형식 JSON'),
    },
    async ({ workspace, task_id, sub_id, task, context }) => {
      const id = makeId(workspace, task_id, sub_id);
      const existing = djinn.get(COLLECTION, id);
      const now = new Date().toISOString();
      const doc = {
        workspace,
        task_id,
        sub_id: sub_id ?? null,
        type: sub_id ? 'sub' : 'main',
        task: task ?? existing?.task ?? '',
        context: context ?? existing?.context ?? {},
        created_at: existing?.created_at ?? now,
        modified_at: now,
      };
      djinn.put(COLLECTION, id, doc);
      return json({ ok: true, id });
    }
  );

  server.tool(
    'task_context_get',
    '메인 또는 서브 티켓 하나를 조회한다.',
    {
      workspace: z.string(),
      task_id: z.string(),
      sub_id: z.string().optional(),
    },
    async ({ workspace, task_id, sub_id }) => {
      const doc = djinn.get(COLLECTION, makeId(workspace, task_id, sub_id));
      return json(doc);
    }
  );

  server.tool(
    'task_context_find_subs',
    '특정 메인 티켓에 속한 모든 서브 티켓(워커)을 조회한다.',
    {
      workspace: z.string(),
      task_id: z.string(),
    },
    async ({ workspace, task_id }) => {
      const subs = djinn.find(
        COLLECTION,
        { workspace, task_id, type: 'sub' },
        { orderBy: 'created_at', orderDir: 'asc' }
      );
      return json(subs);
    }
  );

  server.tool(
    'task_context_find_recent',
    "workspace 안의 최근 메인 티켓을 조회한다 — 'follow'로 이어받을 대상을 찾을 때 사용.",
    {
      workspace: z.string(),
      limit: z.number().int().positive().max(50).optional().default(5),
    },
    async ({ workspace, limit }) => {
      const mains = djinn.find(
        COLLECTION,
        { workspace, type: 'main' },
        { orderBy: 'modified_at', orderDir: 'desc', limit }
      );
      return json(mains);
    }
  );

  server.tool(
    'task_context_del',
    '메인 또는 서브 티켓 하나만 삭제한다(연쇄 삭제 없음).',
    {
      workspace: z.string(),
      task_id: z.string(),
      sub_id: z.string().optional(),
    },
    async ({ workspace, task_id, sub_id }) => {
      djinn.del(COLLECTION, makeId(workspace, task_id, sub_id));
      return json({ ok: true });
    }
  );

  server.tool(
    'task_context_vacuum',
    '특정 task_id의 메인 티켓 + 모든 서브 티켓을 삭제한다. 작업 완료 후 사용자에게 먼저 확인받고 호출할 것.',
    {
      workspace: z.string(),
      task_id: z.string(),
    },
    async ({ workspace, task_id }) => {
      const rows = djinn.find(COLLECTION, { workspace, task_id });
      djinn.transaction(() => {
        for (const row of rows) djinn.del(COLLECTION, row.id);
      });
      return json({ ok: true, deleted: rows.length });
    }
  );

  server.tool(
    'task_context_vacuum_all',
    "workspace의 모든 task_context를 삭제한다. confirm:false(기본)로 호출하면 삭제 없이 현재 개수만 반환한다 — " +
      '사용자에게 개수를 보여주고 명시적 재확인을 받은 뒤에만 confirm:true로 다시 호출할 것. 자동 트리거 금지.',
    {
      workspace: z.string(),
      confirm: z.boolean().optional().default(false),
    },
    async ({ workspace, confirm }) => {
      const rows = djinn.find(COLLECTION, { workspace });
      if (!confirm) {
        return json({
          ok: false,
          count: rows.length,
          message: `workspace에 ${rows.length}개의 task_context row가 있습니다. 모두 삭제하려면 confirm:true로 재호출하세요.`,
        });
      }
      djinn.transaction(() => {
        for (const row of rows) djinn.del(COLLECTION, row.id);
      });
      return json({ ok: true, deleted: rows.length });
    }
  );

  server.tool(
    'task_context_export_md',
    '특정 task_id의 메인+서브 티켓을 TASK_CONTEXT.md 형식의 마크다운 문자열로 합성해 반환한다 (파일 저장은 호출자가 Write 툴로 수행).',
    {
      workspace: z.string(),
      task_id: z.string(),
    },
    async ({ workspace, task_id }) => {
      const main = djinn.get(COLLECTION, makeId(workspace, task_id));
      if (!main) return json({ ok: false, message: `task_id '${task_id}' 를 찾을 수 없습니다.` });
      const subs = djinn.find(
        COLLECTION,
        { workspace, task_id, type: 'sub' },
        { orderBy: 'created_at', orderDir: 'asc' }
      );
      const markdown = exportMarkdown(main, subs);
      return { content: [{ type: 'text', text: markdown }] };
    }
  );

  return server;
}

async function serve() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

module.exports = { createServer, serve };
