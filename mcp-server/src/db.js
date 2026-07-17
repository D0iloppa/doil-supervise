'use strict';

const path = require('path');
const { DJinn } = require('@d0iloppa/djinn');

const DB_PATH = path.join(__dirname, '..', 'data', 'task_context.db');

const djinn = new DJinn(DB_PATH);

djinn.define('task_context', {
  indexes: ['workspace', 'task_id', 'type', 'modified_at'],
});

// 메인 티켓: sub_id 없음. 서브 티켓: sub_id 있음 — 같은 task_id로 그룹핑된다.
function makeId(workspace, task_id, sub_id) {
  return sub_id ? `${workspace}|${task_id}|${sub_id}` : `${workspace}|${task_id}`;
}

module.exports = { djinn, makeId, DB_PATH };
