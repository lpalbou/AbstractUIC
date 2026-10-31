import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SessionCard,SessionReadStore,sessionContentRevision,sessionActivityFromRuns,sessionReadScope,sessionReadTarget} from '../dist/session_cards.js';
const data=new Map();const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const now=Date.parse('2026-10-31T12:00:00Z'),at=n=>new Date(now+n).toISOString();
const store=new SessionReadStore('gateway/tenant/alice',storage,now),receipt=(status,time=1)=>({sessionId:'s',revision:sessionContentRevision('r',status),updatedAt:at(time)});
assert.equal(store.isUnread(receipt('running')),true);store.markRead(receipt('running'));assert.equal(store.isUnread(receipt('completed')),true,'Completion of an opened request is new');
store.markRead(receipt('completed'));assert.equal(store.isUnread(receipt('completed',9999)),false,'Metadata does not create new content');
const b={...receipt('completed'),revision:sessionContentRevision('r2','completed')};store.markRead(b);store.markRead(receipt('running'));assert.equal(store.isUnread(b),false,'Late A cannot overwrite B');
const c={...b,revision:sessionContentRevision('r3','completed')};assert.equal(store.isUnread(c),true);
const twin=new SessionReadStore('gateway/tenant/alice',storage,now);assert.equal(twin.isUnread(b),false,'Other client on same browser sees receipt');
assert.equal(new SessionReadStore('gateway/tenant/bob',storage,now).isUnread(b),true,'Account isolation');
const old={sessionId:'old',revision:'old-final',updatedAt:at(-1)};store.observe(old);assert.equal(store.isUnread({...old,updatedAt:at(1000)}),false,'Baselined history remains old after metadata edits');
const broken=new SessionReadStore('broken',{...storage,getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},now);broken.markRead(c);assert.equal(broken.isUnread(c),false);assert.ok(broken.error);
assert.equal(sessionReadScope({gateway_url:'https://name:secret@example.com/gateway/?token=secret#secret',gateway:{principal:{tenant_id:'t',user_id:'u',token_fingerprint:'secret'}}}).includes('secret'),false);
assert.equal(sessionReadScope({gateway_url:'https://example.com'}),'');
const rows={items:[{run_id:'r',session_id:'s',status:'waiting',waiting:{reason:'timer'},created_at:at(1),tool_calls:2}]};assert.equal(sessionActivityFromRuns(rows).s.needsAttention,false);rows.items[0].waiting.reason='user';assert.equal(sessionActivityFromRuns(rows).s.needsAttention,true);
const concurrent={items:[{run_id:'a',session_id:'race',status:'running',created_at:at(1),updated_at:at(1)},{run_id:'b',session_id:'race',status:'completed',created_at:at(2),updated_at:at(2)}]};
let activity=sessionActivityFromRuns(concurrent).race;
for(const r of activity.content) store.markRead(r);
concurrent.items[0].status='completed';concurrent.items[0].updated_at=at(3);
activity=sessionActivityFromRuns(concurrent).race;
assert.equal(activity.content.some(r=>store.isUnread(r)),true,'Late older answer stays new');
const ties=sessionActivityFromRuns({items:[{run_id:'a',session_id:'tie',status:'completed',created_at:at(1)},{run_id:'z',session_id:'tie',status:'completed',created_at:at(1)}]}).tie;
assert.equal(ties.revision,sessionContentRevision('a','completed'),'Page order wins ties');
const base={sessionId:'s',title:'A full title',nowMs:now+60000,updatedAt:at(0),turnCount:2,toolCount:7,onOpen(){},onArchive(){}};
const html=renderToStaticMarkup(React.createElement(SessionCard,{...base,unread:true,needsAttention:true,selected:true,countsPartial:true}));
assert.ok(html.includes('data-unread="true"')&&html.includes('data-attention="true"')&&html.includes('data-selected="true"'));
assert.ok(html.includes('At least 2 turns')&&html.includes('At least 7 tool calls')&&html.includes('Needs you'));
assert.equal((html.match(/<button/g)||[]).length,2);assert.doesNotMatch(html,/<button[^>]*>[\s\S]*<button[\s\S]*<\/button>[\s\S]*<\/button>/);
const missing=renderToStaticMarkup(React.createElement(SessionCard,{...base,turnCount:null,toolCount:undefined}));assert.doesNotMatch(missing,/0 tools|undefined|NaN/);
console.log('Session cards: receipt revisions, late acknowledgements, accounts, baseline, storage failure, wait kinds, counts, accessibility and sibling controls passed');

const history=[{runId:"old",role:"user",content:"Earlier prompt"},{runId:"new",role:"assistant",content:"New answer"}];
for(const status of ["failed","cancelled"]){const target=sessionReadTarget(history,"old",status);assert.equal(target.message,history[0]);assert.equal(target.outcome,status==="failed"?"Request failed.":"Request cancelled.");}
assert.equal(sessionReadTarget(history,"absent","failed").message,undefined,"Unloaded history cannot be consumed");

// Automation cards share the same shell but keep Watch-specific facts and amber new-run badges.
const {AutomationCard,automationCardSchedule,automationCardNext}=await import('../dist/session_cards.js');
const automation={automation_id:'auto',title:'Consolidate my notes',status:'active',trigger:{source_id:'schedule',source_version:2,config:{kind:'every',every:'120m'}},
  occurrence_count:44,next_run_at:at(6*3600000),schedule_rule_text:'Every 2 hours (UTC)',attention:{unseen_count:3,pending_waits:0,unread:true}};
const renderAuto=over=>renderToStaticMarkup(React.createElement(AutomationCard,{summary:{...automation,...over},nowMs:now,onOpen(){},onArchive(){}}));
assert.equal(automationCardSchedule(automation),'2h');
for(const [input,expected] of [['60s','1m'],['90m','90m'],['24h','1d'],['48h','2d'],['30s','30s']])
  assert.equal(automationCardSchedule({...automation,trigger:{...automation.trigger,config:{every:input}}}),expected);
for(const kind of ['daily','weekly','monthly','once']) assert.equal(automationCardSchedule({...automation,trigger:{...automation.trigger,config:{kind}}}),kind[0].toUpperCase()+kind.slice(1));
assert.equal(automationCardSchedule({...automation,trigger:{source_id:'email.received',source_version:1,config:{}}}),'Email');
assert.equal(automationCardNext(at(6*3600000),now),'6h');
assert.equal(automationCardNext(at(-60000),now),'now');
assert.equal(automationCardNext('invalid',now),'');
let row=renderAuto({});assert.ok(row.includes('af-session-card af-automation-card')&&row.includes('data-unread="true"'));
assert.ok(row.includes('44 runs')&&row.includes('Next run in 6h')&&row.includes('3 new results'));
assert.doesNotMatch(row,/<strong|role="switch"|undefined|NaN/);
row=renderAuto({status:'paused'});assert.ok(row.includes('Paused'));assert.ok(!row.includes('data-field="next"'));
row=renderAuto({attention:{...automation.attention,pending_waits:1},current_occurrence:{status:'running'}});
assert.ok(row.includes('data-attention="true"')&&row.includes('Needs you'));assert.ok(!row.includes('data-working="true"'));
assert.ok(renderAuto({current_occurrence:{status:'running'}}).includes('data-working="true"'));
assert.ok(renderAuto({last_occurrence:{status:'failed'}}).includes('is-failed'));
assert.ok(!renderAuto({attention:{unseen_count:0,pending_waits:0,unread:false}}).includes('data-unread="true"'));
console.log('Automation cards: Watch cadence/countdown, paused/ended states, waits, failure, new results and sibling controls passed');
