import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {docsSpeech,docsVoiceAvailable,docsVoiceOptions} from '../dist/docs_voice.js';
import {DocsAssistantPanel} from '../dist/docs_assistant.js';
assert.equal(docsVoiceAvailable(null),false);
assert.equal(docsVoiceAvailable({tts:{configured:false}}),false);
assert.equal(docsVoiceAvailable({tts:{configured:true,model:'voice-model'}}),true);
assert.equal(docsVoiceAvailable(null,{model:'custom-voice'}),true);
const calls=[];const controller=new AbortController();
const bytes=new Uint8Array([82,73,70,70]);
const fetchGateway=async(path,init={})=>{calls.push({path,init});return path.endsWith('/voice/tts') ? Response.json({audio_artifact:{$artifact:'audio/1'}}) : new Response(bytes);};
const audio=await docsSpeech(fetchGateway,{runId:'docs/run',content:'Read this reply.'},{provider:'speech',model:'voice',voice:'sisko',output_device:'speaker',reply_muted:true},controller.signal);
assert.deepEqual(new Uint8Array(audio),bytes);
assert.equal(calls[0].path,'api/gateway/runs/docs%2Frun/voice/tts');
assert.equal(calls[0].init.signal,controller.signal);
assert.deepEqual(JSON.parse(calls[0].init.body),{text:'Read this reply.',provider:'speech',model:'voice',voice:'sisko'});
assert.equal(calls[1].path,'api/gateway/runs/docs%2Frun/artifacts/audio%2F1/content');
assert.equal(calls[1].init.signal,controller.signal);
await assert.rejects(()=>docsSpeech(fetchGateway,{content:'Legacy without a run.'},{}),/no run/);
await assert.rejects(()=>docsSpeech(async()=>Response.json({detail:'Speech unavailable'},{status:503}),{runId:'r',content:'x'},{}),/Speech unavailable/);
await assert.rejects(()=>docsSpeech(async()=>Response.json({}),{runId:'r',content:'x'},{}),/no audio/);
await assert.rejects(()=>docsSpeech(async(path)=>path.endsWith('/voice/tts')?Response.json({audio_artifact:{$artifact:'a'}}):new Response('',{status:403}),{runId:'r',content:'x'},{}),/speech audio/);
for(const app of ['Code','Gateway','Observer','Continuum','Flow','Entity','Note','Assistant']) {
 const props={source:{app:app.toLowerCase(),name:app},messages:[{id:'u',role:'user',content:'Question'},{id:'a',role:'assistant',runId:'r',content:'Answer'}],draft:'',onDraftChange(){},onSend(){}};
 const withVoice=renderToStaticMarkup(React.createElement(DocsAssistantPanel,{...props,onSpeakToggle(){},getSpeakState:()=> 'playing'}));
 assert.equal((withVoice.match(/data-speak-state="playing"/g)||[]).length,1);
 const withoutVoice=renderToStaticMarkup(React.createElement(DocsAssistantPanel,props));
 assert.equal(withoutVoice.includes('data-speak-state'),false);
}
// Review 2026-11-08 R2: the Docs assistant keeps no Read aloud player, even with Read aloud on.
assert.equal(docsVoiceOptions({read_aloud:true}).unlock_on_gesture,false);
assert.equal(docsVoiceOptions({read_aloud:true,output_device:'spk'}).output_device_id,'spk');
console.log('check_docs_voice: Read aloud keeps no Docs player, availability, authenticated run/artifact transport, overrides, abort/error paths and shared speakers for8 app identities PASS');
