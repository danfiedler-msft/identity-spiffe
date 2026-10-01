const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const start = html.indexOf('function updateRiskSignalBadge()');
const end = html.indexOf('function updateHealthDots()', start);

for (const status of ['on', 'off', 'unavailable']) {
  test(`sidebar displays risk signal ${status} separately from backend health`, () => {
    const badge = {};
    const context = {
      state: { riskSettings: { signal: { status, detail: 'Risk status detail' } } },
      document: { getElementById: id => id === 'risk-signal-status' ? badge : null },
    };
    vm.createContext(context);
    vm.runInContext(html.slice(start, end), context);
    context.updateRiskSignalBadge();
    assert.equal(badge.textContent, `AGENT RISK SIGNAL ${status.toUpperCase()}`);
    assert.equal(badge.title, 'Risk status detail');
    assert.equal(badge.className, `sidebar-mode ${status === 'on' ? 'live' : 'degraded'}`);
  });
}

test('both static demo presets explicitly disable local risk prerequisites', () => {
  const context = {};
  vm.createContext(context);
  const begin = html.indexOf('var PRESET_POLICIES =');
  const finish = html.indexOf('\n};', begin) + 3;
  vm.runInContext(html.slice(begin, finish), context);
  for (const preset of ['hardened', 'permissive']) {
    assert.match(context.PRESET_POLICIES[preset], /risk_enforcement: "off"/);
    assert.doesNotMatch(context.PRESET_POLICIES[preset], /blocked_risk_levels/);
  }
});

test('Settings displays loading failures even before a settings response exists', () => {
  const node = () => ({ children: [], style: {}, appendChild(child) { this.children.push(child); } });
  const root = node();
  const context = {
    state: { riskSettings: null, riskSettingsError: 'Stored settings could not be read' },
    document: { createElement: node },
  };
  vm.createContext(context);
  const begin = html.indexOf('function renderSettings(root)');
  const finish = html.indexOf('\n}', begin) + 2;
  vm.runInContext(html.slice(begin, finish), context);
  context.renderSettings(root);
  assert.ok(root.children[0].children.some(child => child.textContent === context.state.riskSettingsError));
});
