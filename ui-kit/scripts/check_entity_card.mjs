// EntityCard (gateway backlog 1012): the words and the markup, over the built dist (run after
// `npm run build`). The browser half (1440 / 400 px, drawn looks, sizes) is check_entity_card_browser.mjs.
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EntityCard,ENTITY_CARD_ACT_WORDS,entityAgeWords,entityCardActName,entityCardActs,entityCountsWords,entityDurationWords,entityFailuresWords,entityMomentWords,entityNowWords,entityTroubleWords,entityWhenWords} from '../dist/index.js';
const NOW=Date.parse('2026-11-07T12:00:00Z'),ago=ms=>new Date(NOW-ms).toISOString(),MIN=60000,H=60*MIN,D=24*H;

// Durations and ages in plain words.
// No abbreviated units (operator rule: plain words).
assert.equal(entityDurationWords(30*1000),'');
assert.equal(entityDurationWords(1*MIN),'1 minute');
assert.equal(entityDurationWords(5*MIN),'5 minutes');
assert.equal(entityDurationWords(1*H),'1 hour');
assert.equal(entityDurationWords(3*H),'3 hours');
assert.equal(entityWhenWords(ago(20*1000),NOW),'just now');
assert.equal(entityWhenWords(ago(12*MIN),NOW),'12 minutes ago');
assert.equal(entityWhenWords(ago(3*H),NOW),'3 hours ago');
assert.equal(entityWhenWords(ago(1.5*D),NOW),'yesterday');
assert.equal(entityWhenWords(ago(4*D),NOW),'4 days ago');
assert.equal(entityWhenWords('2026-08-02T10:00:00Z',NOW),'Aug 2');
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
assert.equal(entityNowWords({phase:'work',detail:null,busy:false,since:null,trouble:null},NOW).label,'Working');
// Awake with nothing running is the resting default (phase sleep): "Resting", never "Asleep".
assert.equal(entityNowWords({phase:'sleep',state:'awake',detail:'resting',busy:false,since:ago(20*1000),trouble:null},NOW).label,'Resting');
assert.equal(entityNowWords({phase:'sleep',state:'awake',detail:'resting',busy:false,since:ago(20*1000),trouble:null},NOW).since,'just now');
assert.equal(entityNowWords({phase:'sleep',state:'asleep',detail:'resting',busy:false,since:ago(2*H),trouble:null},NOW).label,'Asleep');
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
 'Latest lesson','Fix your own tools at once','Last moment','A visit ended','3 months old','Thinks with gpt-5.6-sol','33 lessons learned · 29 open problems · 78 open questions · 261 sleeps']) assert.ok(t.includes(want),want);
assert.ok(!t.includes('A fourth'),'at most three interests');
assert.ok(html.includes('data-trouble="true"')&&html.includes('data-phase="sleep"')&&html.includes('role="note"'));
assert.match(html,/<button type="button" class="af-entity-card__head"[^>]*aria-label="Ephemeral\. Asleep, for 3 months"/,'the head opens the entity: who and what it is doing now (the body is not repeated)');
assert.ok(html.indexOf('af-entity-card__actions')>html.indexOf('af-entity-card__facts'),'actions at the bottom');
assert.ok(html.trimEnd().endsWith('Wake</button></div></article>'),'actions are the last row');
assert.doesNotMatch(t,/\b[a-z]+_[a-z_]+\b|undefined|NaN|\bnull\b|\btk\b|ephemeral@|endpoint:/,'plain words only');

// Compact: who, now, trouble, one interest, last moment — nothing else.
const compact=text(render({tile,density:'compact',href:'/entity?entity=ephemeral',target:'_blank'}));
assert.ok(compact.includes('What sustained attention looks like')&&!compact.includes('The texture of continuity'));
assert.ok(!compact.includes('On its mind')&&!compact.includes('Latest lesson')&&!compact.includes('33 lessons learned'));
assert.ok(compact.includes('Its own time stopped after repeated failures'));
assert.match(render({tile,density:'compact',href:'/e',target:'_blank'}),/<a class="af-entity-card__head" href="\/e" target="_blank" rel="noreferrer"/);
// No last moment yet: words, never a bare dash (design review 2026-11-07); the head carries the phase dot.
const no_moment=render({tile:{...tile,last_moment:null},density:'compact'});
assert.match(no_moment,/data-field="moment"><span class="af-entity-card__label">Last moment<\/span><span class="af-entity-card__line af-entity-card__empty"[^>]*>None yet<\/span>/);
assert.ok(no_moment.includes('class="af-entity-card__dot"')&&no_moment.includes('data-now="sleep"'),'the phase dot and its key');

// Loading: the roster's name and look at once, placeholders in every row, no facts invented.
html=render({tile:null,name:'Castor',look:{style:'watch-halo',color:'#39a5d0'}});t=text(html);
assert.ok(html.includes('aria-busy="true"')&&html.includes('data-status="loading"')&&t.includes('Castor'));
assert.ok((html.match(/af-entity-card__sk/g)||[]).length>=6,'a placeholder per row');
assert.ok(!t.includes('Nothing yet')&&!t.includes('Asleep'),'loading claims nothing');

// Unavailable: says so in a few words, the reason only on hover.
html=render({tile:null,status:'unavailable',name:'Veya',reason:'HTTP 500: Internal Server Error'});t=text(html);
assert.ok(t.includes('Details unavailable right now')&&!t.includes('HTTP 500')&&html.includes('title="HTTP 500: Internal Server Error"'));
assert.ok(!t.includes('Into lately')&&!t.includes('Last moment'),'unavailable is one line, not empty sections');

// Stale: the last tile with since when.
t=text(render({tile,status:'stale',asOfMs:NOW-12*MIN}));
assert.ok(t.includes('Details from 12 minutes ago; newer ones could not be read'));
assert.ok(!text(render({tile})).includes('Details from'),'a fresh card never says how old it is');

// No look: a quiet disc with the initial, never a broken canvas.
html=render({tile:{...tile,look:null}});assert.ok(html.includes('is-plain')&&!html.includes('<canvas'));
// An unknown moment kind shows the empty mark, never the raw kind.
t=text(render({tile:{...tile,last_moment:{kind:'blueprint_edited',at:ago(H)}}}));assert.ok(!t.includes('blueprint'));
// attention="marker": no box, a mark on the now line whose tooltip and the head's name carry the sentence whole.
{
  const boxed=render({tile,density:'compact',href:'/e'});
  const marked=render({tile,density:'compact',href:'/e',attention:'marker'});
  assert.ok(boxed.includes('af-entity-card__trouble'));
  assert.ok(!marked.includes('af-entity-card__trouble'));
  assert.match(marked,/<span class="af-entity-card__attention" title="Its own time stopped after repeated failures[^"]*" aria-hidden="true"><\/span>/);
  assert.match(marked,/<a class="af-entity-card__head" href="\/e" aria-label="[^"]*\. Its own time stopped after repeated failures/);
  assert.ok(marked.includes('data-trouble="true"'));
  // No trouble, no marker; the default stays the note.
  const calm=render({tile:{...tile,now:{...tile.now,trouble:null}},density:'compact',attention:'marker'});
  assert.ok(!calm.includes('af-entity-card__attention')&&!calm.includes('af-entity-card__trouble'));
}

// The card's acts (operator 2026-11-10): Watch, Retry with the reason, Resume — from the served life state.
{
  const STOPPED={phase:'stopped',stopped:true,sentence:'Stopped. Nothing runs until you resume him.',blocked:null};
  const CRASHED={phase:'idle',stopped:false,sentence:'Awake and reachable; his own time stopped unexpectedly.',blocked:{code:'loop_crashed',sentence:'His own time stopped unexpectedly. Retry to start it again.',action:'retry'}};
  const IDLE={phase:'idle',stopped:false,sentence:'Awake and reachable; nothing of his own is running.',blocked:null};
  const FAILED_LOOP={running:false,stopped_by:'failures',updated_at:'2026-11-07T09:40:00Z'};
  // The view: Watch unless stopped; the box from the served sentences; the reason only for loop_crashed.
  assert.deepEqual(entityCardActs(null,null,null,NOW),{watch:true,box:null},'no life: Watch only');
  assert.deepEqual(entityCardActs(IDLE,null,null,NOW),{watch:true,box:null});
  assert.deepEqual(entityCardActs(STOPPED,FAILED_LOOP,null,NOW),{watch:false,box:{tone:'stopped',sentence:'Stopped. Nothing runs until you resume him.',reason:'',act:'resume'}},'stopped: Resume, never Watch');
  assert.deepEqual(entityCardActs(CRASHED,FAILED_LOOP,null,NOW),{watch:true,box:{tone:'blocked',sentence:'His own time stopped unexpectedly. Retry to start it again.',reason:'It stopped after repeated failures (Nov 7); its memory is intact.',act:'retry'}});
  assert.equal(entityFailuresWords(null,NOW),'It stopped after repeated failures; its memory is intact.');
  // The loop's served note is the reason when it carries one (the gateway's words win).
  assert.equal(entityCardActs(CRASHED,{running:false,note:'The provider did not answer within 75 seconds.'},null,NOW).box.reason,'The provider did not answer within 75 seconds.');
  // No loop given: the tile's own_time_failed trouble says the same.
  assert.equal(entityCardActs(CRASHED,null,{kind:'own_time_failed',at:'2026-11-06T10:00:00Z'},NOW).box.reason,'It stopped after repeated failures (Nov 6); its memory is intact.');
  // A loop that ended for another reason, or no fact at all: no reason invented.
  assert.equal(entityCardActs(CRASHED,{running:false,stopped_by:'operator-interrupt'},null,NOW).box.reason,'');
  assert.equal(entityCardActs(CRASHED,null,null,NOW).box.reason,'');
  // Another blocked code: its sentence and its act, no loop reason read.
  const START_FAILED={...IDLE,blocked:{code:'own_time_start_failed',sentence:'His own time could not start: no model is set.',action:'retry'}};
  assert.deepEqual(entityCardActs(START_FAILED,FAILED_LOOP,null,NOW).box,{tone:'blocked',sentence:'His own time could not start: no model is set.',reason:'',act:'retry'});
  const ARCHIVED={...IDLE,blocked:{code:'entity_archived',sentence:'He is archived; restore him from the roster first.',action:null}};
  assert.equal(entityCardActs(ARCHIVED,null,null,NOW).box.act,null,'a blocked state without an act offers none');
  assert.deepEqual(Object.fromEntries(Object.entries(ENTITY_CARD_ACT_WORDS).map(([k,v])=>[k,v.label])),{watch:'Watch',retry:'Retry',resume:'Resume'},'verbs on the buttons');
  assert.equal(entityCardActName('watch','Castor',false),'Watch Castor');
  assert.equal(entityCardActName('retry','Castor',true),"Retrying Castor's own time");
  assert.equal(entityCardActName('resume','Castor',false),'Resume Castor');

  // The markup. Watch: a primary button in the head band, beside the head (never inside its button).
  const calls=[];const cb={onWatch:()=>calls.push('watch'),onRetry:()=>calls.push('retry'),onResume:()=>calls.push('resume')};
  const ok=render({tile,onOpen(){},life:IDLE,...cb});
  assert.match(ok,/<div class="af-entity-card__top"><button type="button" class="af-entity-card__head"[^>]*>[\s\S]*?<\/button><button type="button" class="af-entity-card__act af-entity-card__watch is-primary" aria-label="Watch Ephemeral" title="Open its page: watch it and talk with it\.">[\s\S]*?<span>Watch<\/span>/);
  assert.ok(!ok.includes('af-entity-card__life')&&!ok.includes('af-entity-card__trouble'),'served and calm: no box (the tile\'s old warning steps aside)');
  assert.ok(!ok.includes('data-trouble'),'no warning frame when the served state is calm');
  // No life: Watch still offered; the tile's warning as before.
  const nolife=render({tile,onOpen(){},onWatch(){}});
  assert.ok(nolife.includes('af-entity-card__watch')&&nolife.includes('af-entity-card__trouble'));
  // No onWatch: no Watch.
  assert.ok(!render({tile,life:IDLE}).includes('af-entity-card__watch'));
  // Failure: the served sentence, the reason and Retry on the card; Watch stays.
  const crashed=render({tile,life:CRASHED,loop:FAILED_LOOP,...cb});
  assert.match(crashed,/<div class="af-entity-card__life" data-tone="blocked" role="note"><p class="af-entity-card__life-text"><span class="af-entity-card__life-sentence">His own time stopped unexpectedly\. Retry to start it again\.<\/span><span class="af-entity-card__life-reason">It stopped after repeated failures \(Nov 7\); its memory is intact\.<\/span><\/p><button type="button" class="af-entity-card__act af-entity-card__retry is-primary" aria-label="Retry Ephemeral&#x27;s own time"[^>]*>[\s\S]*?<span>Retry<\/span><\/button><\/div>/);
  assert.ok(crashed.includes('af-entity-card__watch')&&crashed.includes('data-trouble="true"')&&crashed.includes('data-life="blocked"'));
  assert.ok(!crashed.includes('af-entity-card__trouble'),'one warning: the served box, not the tile note too');
  assert.ok(!crashed.includes('Resume'),'no Resume while not stopped');
  // Without the host's onRetry the reason shows, no button.
  assert.ok(!render({tile,life:CRASHED,loop:FAILED_LOOP}).includes('af-entity-card__retry'));
  // Stopped: the served sentence and Resume; no Watch, no Retry.
  const stopped=render({tile:{...tile,now:{...tile.now,phase:'stopped',trouble:null}},life:STOPPED,...cb});
  assert.match(stopped,/<div class="af-entity-card__life" data-tone="stopped" role="note"><p class="af-entity-card__life-text"><span class="af-entity-card__life-sentence">Stopped\. Nothing runs until you resume him\.<\/span><\/p><button type="button" class="af-entity-card__act af-entity-card__resume is-primary" aria-label="Resume Ephemeral"[^>]*>[\s\S]*?<span>Resume<\/span><\/button><\/div>/);
  assert.ok(!stopped.includes('af-entity-card__watch')&&!stopped.includes('af-entity-card__retry'));
  assert.ok(stopped.includes('data-life="stopped"')&&!stopped.includes('data-trouble'),'stopped is a state, not a warning');
  // In flight: the act says so and every act waits; the answer is one sentence (a refusal as served).
  const busy=render({tile,life:CRASHED,loop:FAILED_LOOP,...cb,pending:'retry'});
  assert.match(busy,/class="af-entity-card__act af-entity-card__retry is-primary" disabled="" aria-busy="true" aria-label="Retrying Ephemeral&#x27;s own time"[^>]*>[\s\S]*?<span>Retrying…<\/span>/);
  assert.match(busy,/class="af-entity-card__act af-entity-card__watch is-primary" disabled=""/,'Watch waits while an act is in flight');
  const refused=render({tile,life:STOPPED,...cb,notice:{text:'Only an admin can grant his own time, stop or resume him.',refused:true}});
  assert.match(refused,/<p class="af-entity-card__notice" data-refused="true" role="alert">Only an admin can grant his own time, stop or resume him\.<\/p>/);
  assert.match(render({tile,life:IDLE,notice:{text:'Own time is off; he stays awake.'}}),/<p class="af-entity-card__notice" role="status">Own time is off; he stays awake\.<\/p>/);
  assert.ok(!render({tile,life:IDLE,notice:{text:''}}).includes('af-entity-card__notice'),'an empty answer shows nothing');
  // Compact (a strip tile): the same acts.
  const compactCrashed=render({tile,density:'compact',href:'/e',life:CRASHED,loop:FAILED_LOOP,...cb,attention:'marker'});
  assert.ok(compactCrashed.includes('af-entity-card__retry')&&compactCrashed.includes('af-entity-card__watch')&&!compactCrashed.includes('af-entity-card__attention'));
  // Plain words on every state.
  for(const h of [ok,crashed,stopped,busy,refused]) assert.doesNotMatch(text(h),/\b[a-z]+_[a-z_]+\b|undefined|NaN|\bnull\b/,'plain words');

  // The callbacks: each button calls its own host callback (the tree, expanded where it is ours).
  const expand=(el,out=[])=>{
    if(!el||typeof el!=='object')return out;
    if(Array.isArray(el)){for(const c of el)expand(c,out);return out;}
    if(typeof el.type==='function'&&el.props&&'act' in el.props){const b=el.type(el.props);out.push({act:el.props.act,button:b});return out;}
    expand(el.props?.children,out);return out;
  };
  const buttons=(props)=>expand(EntityCard({tile,nowMs:NOW,...props}));
  for(const b of buttons({life:CRASHED,loop:FAILED_LOOP,...cb})) b.button.props.onClick();
  for(const b of buttons({life:STOPPED,...cb})) b.button.props.onClick();
  assert.deepEqual(calls,['watch','retry','resume'],'Watch, Retry and Resume call onWatch, onRetry and onResume');
  assert.deepEqual(buttons({life:CRASHED,...cb,pending:'watch'}).map(b=>b.button.props.disabled),[true,true],'one act at a time');
  assert.deepEqual(buttons({life:CRASHED,...cb}).map(b=>b.button.props.disabled),[false,false]);
}
console.log('Entity card: durations, ages, now, trouble, moments, counts, full/compact markup, attention marker, loading, unavailable, stale, acts (Watch, Retry with the reason, Resume, in flight, answers, callbacks) and plain words passed');
