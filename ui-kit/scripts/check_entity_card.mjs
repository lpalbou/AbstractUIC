// EntityCard (gateway backlog 1012): the words and the markup, over the built dist (run after
// `npm run build`). The browser half (1440 / 400 px, drawn looks, sizes) is check_entity_card_browser.mjs.
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EntityCard,entityAgeWords,entityCountsWords,entityDurationWords,entityMomentWords,entityNowWords,entityTroubleWords} from '../dist/index.js';
const NOW=Date.parse('2026-11-07T12:00:00Z'),ago=ms=>new Date(NOW-ms).toISOString(),MIN=60000,H=60*MIN,D=24*H;

// Durations and ages in plain words.
assert.equal(entityDurationWords(30*1000),'a moment');
assert.equal(entityDurationWords(5*MIN),'5 min');
assert.equal(entityDurationWords(3*H),'3 h');
assert.equal(entityDurationWords(1*D),'1 day');
assert.equal(entityDurationWords(45*D),'45 days');
assert.equal(entityDurationWords(97*D),'3 months');
assert.equal(entityDurationWords(800*D),'2 years');
assert.equal(entityAgeWords(0),'Born today');assert.equal(entityAgeWords(1),'1 day old');assert.equal(entityAgeWords(119),'3 months old');assert.equal(entityAgeWords(null),'');

// Now: the ruled phases in words, busy, for how long; stopped is never busy.
assert.deepEqual(entityNowWords({phase:'sleep',detail:'resting',busy:false,since:ago(97*D),trouble:null},NOW).label,'Asleep');
assert.equal(entityNowWords({phase:'sleep',detail:'resting',busy:false,since:ago(97*D),trouble:null},NOW).since,'for 3 months');
assert.equal(entityNowWords({phase:'sleep',detail:'dreaming',busy:false,since:null,trouble:null},NOW).label,'Asleep, dreaming');
assert.equal(entityNowWords({phase:'visit',detail:null,busy:true,since:ago(12*MIN),trouble:null},NOW).label,'In a visit');
assert.equal(entityNowWords({phase:'personal',detail:null,busy:true,since:null,trouble:null},NOW).busy,true);
assert.equal(entityNowWords({phase:'work',detail:null,busy:false,since:null,trouble:null},NOW).label,'Working on a task');
assert.equal(entityNowWords({phase:'stopped',detail:null,busy:true,since:null,trouble:null},NOW).busy,false);
assert.equal(entityNowWords({phase:'personal',detail:null,busy:false,since:null,trouble:null},NOW).since,'','no since, no words');

// The trouble: own time stopped after failures; an unknown trouble kind is not shown.
assert.equal(entityTroubleWords({kind:'own_time_failed',at:'2026-08-01T11:39:22Z'},NOW),'Its own time stopped after repeated failures (Aug 1)');
assert.equal(entityTroubleWords({kind:'something_new',at:null},NOW),'');

// Moments: plain words, never the event name; an unknown kind is not shown.
const words={summon:'A visit began',session_closed:'A visit ended',sleep:'Fell asleep',wake:'Woke up',pause:'Was stopped',personal_started:'Began its own time',
 personal_stop_requested:'Was asked to end its own time',personal_frozen:'Its own time was cut off',substrate_changed:'Its mind changed to another model',night_voice:'Told a dream',
 task_inbox_changed:'Its tasks changed',identity_changed:'Its look or voice changed'};
for(const [kind,w] of Object.entries(words)) assert.equal(entityMomentWords({kind,at:ago(H)}),w,kind);
assert.equal(entityMomentWords({kind:'phase_changed',at:null,to:'personal'}),'Moved to its own time');
assert.equal(entityMomentWords({kind:'phase_changed',at:null,to:'elsewhere'}),'');
assert.equal(entityMomentWords({kind:'work_order_changed',at:null,change:'set'}),'Was given a mission');
assert.equal(entityMomentWords({kind:'work_order_changed',at:null,change:'cleared'}),'Its mission ended');
assert.equal(entityMomentWords({kind:'diary_read',at:null}),'');
assert.equal(entityMomentWords({kind:'queue_enqueued',at:null}),'');

// Counts: non-zero only, in words.
assert.deepEqual(entityCountsWords({open_questions:78,open_problems:29,lessons:33,interests:61,sleeps:261}),['33 lessons learned','29 open problems','78 open questions','261 sleeps']);
assert.deepEqual(entityCountsWords({open_questions:1,open_problems:0,lessons:1,sleeps:null}),['1 lesson learned','1 open question']);
assert.deepEqual(entityCountsWords(null),[]);

// Markup.
const tile={tile_version:1,name:'Ephemeral',slug:'ephemeral',look:{style:'watch-halo',color:'#398fd0'},born:ago(119*D),age_days:119,mind:{model:'gpt-5.6-sol',source:'entity'},
 now:{phase:'sleep',detail:'resting',busy:false,since:ago(97*D),trouble:{kind:'own_time_failed',at:'2026-08-01T11:39:22Z'}},
 into_lately:[{text:'What sustained attention looks like',at:ago(110*D)},{text:'The texture of continuity',at:ago(111*D)},{text:'Decentralized clinical trials',at:ago(111*D)},{text:'A fourth',at:ago(112*D)}],
 on_its_mind:{kind:'problem',text:'The coherence tests were never run',at:ago(109*D)},latest_lesson:{text:'Fix your own tools at once',at:ago(110*D)},
 last_moment:{kind:'session_closed',at:ago(97*D)},counts:{open_questions:78,open_problems:29,lessons:33,interests:61,sleeps:261},as_of_seq:544669,read_at:ago(0)};
const render=p=>renderToStaticMarkup(React.createElement(EntityCard,{nowMs:NOW,...p}));
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/&#x27;/g,"'").replace(/\s+/g,' ');
let html=render({tile,onOpen(){},actions:React.createElement('button',{type:'button','data-x':'act'},'Wake')});
let t=text(html);
for(const want of ['Ephemeral','Asleep','for 3 months','Its own time stopped after repeated failures (Aug 1)','Into lately','What sustained attention looks like','On its mind','A problem: The coherence tests were never run',
 'Latest lesson','Fix your own tools at once','Last moment','A visit ended','3 months old','gpt-5.6-sol','33 lessons learned · 29 open problems · 78 open questions · 261 sleeps']) assert.ok(t.includes(want),want);
assert.ok(!t.includes('A fourth'),'at most three interests');
assert.ok(html.includes('data-trouble="true"')&&html.includes('data-phase="sleep"')&&html.includes('role="note"'));
assert.match(html,/<button type="button" class="af-entity-card__head"[^>]*aria-label="Ephemeral\. Asleep, for 3 months\./,'the head opens the entity and says it in one sentence');
assert.ok(html.indexOf('af-entity-card__actions')>html.indexOf('af-entity-card__facts'),'actions at the bottom');
assert.ok(html.trimEnd().endsWith('Wake</button></div></article>'),'actions are the last row');
assert.doesNotMatch(t,/\b[a-z]+_[a-z_]+\b|undefined|NaN|\bnull\b|\btk\b|ephemeral@|endpoint:/,'plain words only');

// Compact: who, now, trouble, one interest, last moment — nothing else.
const compact=text(render({tile,density:'compact',href:'/entity?entity=ephemeral',target:'_blank'}));
assert.ok(compact.includes('What sustained attention looks like')&&!compact.includes('The texture of continuity'));
assert.ok(!compact.includes('On its mind')&&!compact.includes('Latest lesson')&&!compact.includes('33 lessons learned'));
assert.ok(compact.includes('Its own time stopped after repeated failures'));
assert.match(render({tile,density:'compact',href:'/e',target:'_blank'}),/<a class="af-entity-card__head" href="\/e" target="_blank" rel="noreferrer"/);

// Loading: the roster's name and look at once, placeholders in every row, no facts invented.
html=render({tile:null,name:'Castor',look:{style:'watch-halo',color:'#39a5d0'}});t=text(html);
assert.ok(html.includes('aria-busy="true"')&&html.includes('data-status="loading"')&&t.includes('Castor'));
assert.ok((html.match(/af-entity-card__sk/g)||[]).length>=6,'a placeholder per row');
assert.ok(!t.includes('Nothing yet')&&!t.includes('Asleep'),'loading claims nothing');

// Unavailable: says so in a few words, the reason only on hover.
html=render({tile:null,status:'unavailable',name:'Veya',reason:'HTTP 500: Internal Server Error'});t=text(html);
assert.ok(t.includes('Details unavailable right now')&&!t.includes('HTTP 500')&&html.includes('title="HTTP 500: Internal Server Error"'));

// Stale: the last tile with since when.
t=text(render({tile,status:'stale',asOfMs:NOW-12*MIN}));
assert.ok(t.includes('As of 12 min ago — newer details could not be read'));
assert.ok(!text(render({tile})).includes('As of'),'a fresh card never says "as of"');

// No look: a quiet disc with the initial, never a broken canvas.
html=render({tile:{...tile,look:null}});assert.ok(html.includes('is-plain')&&!html.includes('<canvas'));
// An unknown moment kind shows the empty mark, never the raw kind.
t=text(render({tile:{...tile,last_moment:{kind:'blueprint_edited',at:ago(H)}}}));assert.ok(!t.includes('blueprint'));
console.log('Entity card: durations, ages, now, trouble, moments, counts, full/compact markup, loading, unavailable, stale and plain words passed');
