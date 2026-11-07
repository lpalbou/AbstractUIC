import assert from 'node:assert/strict';
import { speculationCapability, normalizeSpeculationValue, speculationFromSelection, speculationSelection } from '../dist/speculation_control.js';
import { SpeculationSelect } from '../dist/speculation_select.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
assert.equal(normalizeSpeculationValue(false), false);
assert.equal(normalizeSpeculationValue({mode:'off'}), false);
assert.equal(speculationFromSelection(''), undefined);
assert.equal(speculationSelection(false), 'off');
assert.deepEqual(speculationFromSelection('3'), {mode:'native_mtp',num_draft_tokens:3,require_acceleration:true});
for (const value of [true, 'native_mtp', {mode:'native_mtp',num_draft_tokens:true}, {mode:'native_mtp',num_draft_tokens:2.5}]) assert.equal(normalizeSpeculationValue(value), undefined);
assert.equal(speculationCapability({capabilities:{speculation:{native_mtp:true}}}), null);
const payload = {execution:{speculation:{supported:true,ready:false,reason:'head_not_loaded',supported_depths:[2,3,4,5,true,2.5,2],default:{mode:'native_mtp',num_draft_tokens:2},requires_reload:true}}};
assert.deepEqual(speculationCapability(payload).supported_depths, [2,3,4,5]);
const markup = renderToStaticMarkup(React.createElement(SpeculationSelect, {capabilities:payload,onChange:()=>{}}));
assert.match(markup, /depth 2/);
assert.match(markup, /head_not_loaded/);
const unknown = renderToStaticMarkup(React.createElement(SpeculationSelect, {onChange:()=>{}}));
assert.match(unknown, /MTP is offered when the gateway confirms this model supports it\./);
assert.doesNotMatch(unknown, /Depth [2345]/);
// Operator rule 2026-11-07 (replaces the "(saved)" depth): a saved depth the model no longer
// advertises is never offered or sent.
const saved = renderToStaticMarkup(React.createElement(SpeculationSelect, {value:{mode:'native_mtp',num_draft_tokens:7,require_acceleration:true},capabilities:payload,onChange:()=>{}}));
assert.doesNotMatch(saved, /Depth 7/);
console.log('speculation controls: passed');

// Operator rule 2026-11-07: MTP only for MTP-capable models; a model change resets reasoning and
// MTP to the gateway default; a saved value the current model cannot use is never sent.
{
  const kit = await import('../dist/index.js');
  const { usableSpeculation, usableReasoning, sendableModelOptions, resolveSendableModelOptions, resetModelOptions } = kit;
  for (const [name, fn] of Object.entries({ usableSpeculation, usableReasoning, sendableModelOptions, resolveSendableModelOptions, resetModelOptions }))
    assert.equal(typeof fn, 'function', `kit exports ${name}`);
  const depth2 = {mode:'native_mtp',num_draft_tokens:2,require_acceleration:true};
  const supported = {execution:{speculation:{supported:true,ready:true,reason:null,supported_depths:[2,3]}}};
  const unsupported = {execution:{speculation:{supported:false,ready:false,reason:'native_mtp_backend_unavailable',message:null,supported_depths:[]}},capabilities:{reasoning_levels:['low','high']}};
  // MTP: kept only when the card says supported AND lists the depth; Off only when supported.
  assert.deepEqual(usableSpeculation(depth2, supported), depth2);
  assert.equal(usableSpeculation({...depth2,num_draft_tokens:7}, supported), undefined, 'a depth the card does not list is dropped');
  assert.equal(usableSpeculation(false, supported), false);
  assert.equal(usableSpeculation(depth2, unsupported), undefined, 'the incident: depth 2 on a model without MTP');
  assert.equal(usableSpeculation(false, unsupported), undefined, 'Off is not sent to a model without MTP either');
  assert.equal(usableSpeculation(depth2, undefined), undefined, 'no card = no MTP');
  // Reasoning: dropped when the served facts say the model cannot use it; unknown facts keep it.
  assert.equal(usableReasoning('high', unsupported), 'high');
  assert.equal(usableReasoning('ultra', unsupported), '', 'a level the model does not advertise is dropped');
  assert.equal(usableReasoning('high', {capabilities:{thinking_support:false}}), '', 'a model that does not reason gets none');
  assert.equal(usableReasoning('high', {capabilities:{}}), 'high', 'unknown facts: kept (the gateway decides)');
  assert.deepEqual(sendableModelOptions({reasoning:'ultra',speculation:depth2}, unsupported), {});
  assert.deepEqual(sendableModelOptions({reasoning:'low',speculation:depth2}, {...unsupported,execution:supported.execution}), {reasoning:'low',speculation:depth2});
  // At send time: nothing chosen = no discovery call; a failed card read never sends MTP.
  let reads = 0;
  assert.deepEqual(await resolveSendableModelOptions({reasoning:'',speculation:undefined}, async () => { reads += 1; return supported; }), {});
  assert.equal(reads, 0, 'the default path costs no request');
  assert.deepEqual(await resolveSendableModelOptions({reasoning:'high',speculation:depth2}, async () => unsupported), {reasoning:'high'});
  assert.deepEqual(await resolveSendableModelOptions({reasoning:'high',speculation:depth2}, async () => { throw new Error('down'); }), {reasoning:'high'});
  assert.deepEqual(await resolveSendableModelOptions({reasoning:'high',speculation:depth2}, async () => ({error:'unknown model'})), {reasoning:'high'});
  assert.deepEqual(await resolveSendableModelOptions({speculation:depth2}, undefined), {}, 'no capability transport = no MTP');
  // The reset every model dropdown applies.
  assert.deepEqual(resetModelOptions({provider:'a',model:'b',reasoning:'high',speculation:depth2,other:1}), {provider:'a',model:'b',reasoning:'',speculation:undefined,other:1});

  // The control: depths only for a supported card; otherwise disabled, only the default, the
  // gateway's reason said (its message in words, the slug under Technical details).
  const select = (tree) => [...(function* w(n) { if (n == null || typeof n !== 'object') return; if (Array.isArray(n)) { for (const x of n) yield* w(x); return; } if (n.props) { yield n; yield* w(n.props.children); } })(tree)];
  const afSelect = (props) => select(SpeculationSelect({onChange:()=>{}, ...props})).find((n) => n.props.ariaLabel === 'MTP depth');
  const off = afSelect({capabilities:unsupported, value:depth2});
  assert.equal(off.props.disabled, true, 'unsupported: the MTP control is disabled');
  assert.deepEqual(off.props.options.map((o) => o.value), [''], 'unsupported: no Off, no depth, only the default');
  assert.equal(off.props.value, '', 'unsupported: a saved depth is not shown as chosen');
  const offHtml = renderToStaticMarkup(React.createElement(SpeculationSelect, {capabilities:unsupported, value:depth2, onChange:()=>{}}));
  assert.match(offHtml, /This model does not support MTP\./);
  assert.match(offHtml, /native_mtp_backend_unavailable/, 'the gateway reason stays readable');
  const worded = renderToStaticMarkup(React.createElement(SpeculationSelect, {capabilities:{execution:{speculation:{...unsupported.execution.speculation,message:'MTP acceleration off: companion x not downloaded'}}}, onChange:()=>{}}));
  assert.match(worded, /companion x not downloaded/, 'the gateway message is the sentence when it gives one');
  const unknownSel = afSelect({value:depth2});
  assert.equal(unknownSel.props.disabled, true, 'no card: disabled');
  assert.deepEqual(unknownSel.props.options.map((o) => o.value), ['']);
  const on = afSelect({capabilities:supported, value:{...depth2,num_draft_tokens:7}});
  assert.equal(on.props.disabled, false);
  assert.deepEqual(on.props.options.map((o) => o.value), ['', 'off', '2', '3'], 'supported: Off and the listed depths, no stale saved depth');
  assert.equal(on.props.value, '', 'a saved depth the card does not list shows the default');
  assert.equal(afSelect({capabilities:supported, value:depth2}).props.value, '2');
  console.log('model controls rule: passed');
}
