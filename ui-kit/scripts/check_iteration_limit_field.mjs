// IterationLimitField (0.9.26): the gateway default descriptor, the sendable value, the empty
// state's label, validation and warning text, the reset action, the applied receipt line.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const kit = await import('../dist/index.js');
const { IterationLimitField, iterationLimitDefaultFrom, iterationLimitFromInput, iterationLimitProblem, iterationLimitDefaultLabel } = kit;
for (const [name, v] of Object.entries({ IterationLimitField, iterationLimitDefaultFrom, iterationLimitFromInput, iterationLimitProblem, iterationLimitDefaultLabel }))
  assert.equal(typeof v, 'function', `kit exports ${name}`);
const stored = { capabilities: { agent_limits: { max_iterations: { default: 12, source: 'stored', run_field: '_limits.max_iterations', min: 1, warn_above: 200 } } } };
assert.deepEqual(iterationLimitDefaultFrom(stored), { value: 12, source: 'stored', warnAbove: 200 });
assert.deepEqual(iterationLimitDefaultFrom(stored.capabilities), { value: 12, source: 'stored', warnAbove: 200 });
assert.deepEqual(iterationLimitDefaultFrom({ capabilities: { agent_limits: { max_iterations: { default: null, source: 'default' } } } }), { value: null, source: 'default', warnAbove: 200 });
assert.equal(iterationLimitDefaultFrom({ capabilities: {} }), null, 'an older gateway serves nothing');
assert.equal(iterationLimitDefaultFrom({ capabilities: { agent_limits: { max_iterations: { default: 2.5 } } } }), null);
assert.equal(iterationLimitFromInput(''), undefined);
assert.equal(iterationLimitFromInput(' 30 '), 30);
for (const bad of ['0', '1.5', '-2', 'abc']) {
  assert.equal(iterationLimitFromInput(bad), undefined, bad);
  assert.match(iterationLimitProblem(bad), /whole number of 1 or more/, bad);
}
assert.equal(iterationLimitProblem(''), null);
assert.equal(iterationLimitDefaultLabel(iterationLimitDefaultFrom(stored)), 'Gateway default (12)');
assert.equal(iterationLimitDefaultLabel({ value: null, source: 'default', warnAbove: 200 }), 'Workflow default');
assert.equal(iterationLimitDefaultLabel(null), 'Gateway default');
const render = (props) => renderToStaticMarkup(React.createElement(IterationLimitField, { onChange: () => {}, ...props }));
const unset = render({ value: '', gatewayDefault: iterationLimitDefaultFrom(stored) });
assert.match(unset, /type="number"/); assert.match(unset, /min="1"/);
assert.match(unset, /placeholder="Gateway default \(12\)"/);
assert.match(unset, />Iteration limit</);
assert.doesNotMatch(unset, /Use default/, 'no reset while unset');
const set = render({ value: '30', gatewayDefault: iterationLimitDefaultFrom(stored), className: 'code-field' });
assert.match(set, /value="30"/); assert.match(set, /Use default/); assert.match(set, /class="af-limit-field code-field"/);
const bad = render({ value: '1.5' });
assert.match(bad, /aria-invalid="true"/); assert.match(bad, /role="alert"/); assert.match(bad, /whole number of 1 or more/);
const big = render({ value: '300', gatewayDefault: iterationLimitDefaultFrom(stored) });
assert.match(big, /300 iterations is a lot/); assert.match(big, /af-limit-field__msg--warn/); assert.doesNotMatch(big, /aria-invalid/);
const applied = render({ value: '', gatewayDefault: iterationLimitDefaultFrom(stored), applied: { max_iterations: 12, source: 'gateway_default' } });
assert.match(applied, /Last run: 12 iterations \(gateway default\)\./);
assert.match(render({ value: '', applied: { max_iterations: null, source: 'builtin' } }), /Last run: the workflow&#x27;s own limit\./);
// Gateways since 2026-11-08 report the framework default (50) on a start without a value.
assert.match(render({ value: '', applied: { max_iterations: 50, source: 'builtin' } }), /Last run: 50 iterations \(default\)\./);
assert.equal(iterationLimitDefaultLabel({ value: 50, source: 'default', warnAbove: 200 }), 'Gateway default (50)');
assert.match(render({ value: '5', disabled: true }), /disabled=""/);
console.log('iteration limit field: passed');
