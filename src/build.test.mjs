import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml } from './build.mjs';

test('buildHtml injecte data, echarts et app, sans marqueurs restants', () => {
  const html = buildHtml({
    players: [{ uid: 'u', name: 'X', pseudo: 'x', color: '#fff' }],
    history: { J1: { u: 10 } },
    matches: [],
    forecasts: {},
    echarts: 'ECHARTS_STUB',
    appJs: 'function initApp(){}',
  });
  assert.match(html, /ECHARTS_STUB/);
  assert.match(html, /"name":"X"/);
  assert.match(html, /function initApp/);
  assert.doesNotMatch(html, /__DATA__|__ECHARTS__|__APP__/);
});
