import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {publicApprovalRequest, presentInteraction, WorkflowInteractionPanel} from '../dist/index.js';
const toolCalls=[{call_id:'c1',name:'fetch_url',arguments:{url:'https://aibriefs.news/ai-news-today'}},{call_id:'c2',name:'fetch_url',arguments:{url:'https://dailyaithead.com/en'}}];
const context={run_id:'r',update_id:'brief:3',iteration:3,call_ids:['c1','c2'],text:'I want to compare these two news sources so I can separate repeated stories from new announcements.'};
const request=publicApprovalRequest(toolCalls,context,'r');
for (const arguments_ of [{url:'https://example.com',method:'POST',data:{name:'private'}},{url:'https://example.com',method:'PUT'},{url:'https://example.com',method:'DELETE'},{url:'https://example.com',method:17},{url:'https://example.com',method:null},{url:'https://example.com',data:'secret'},{url:'https://example.com',headers:{Authorization:'secret'}}]) {
  const sensitive=publicApprovalRequest([{name:'fetch_url',arguments:arguments_}],null,'r');assert.equal(sensitive.reviewRequired,true,'Sending/mutating/unsupported requests are never described as reading');assert.notEqual(sensitive.actions[0].kind,'page');
}
assert.equal(publicApprovalRequest([{name:'fetch_url',arguments:{url:'https://example.com',method:'head'}}],null,'r').reviewRequired,false);
assert.equal(request.question,'May I read these 2 webpages?');assert.equal(request.explanation.text,context.text);assert.equal(request.reviewRequired,false);
for(const invalid of [undefined,{...context,run_id:'other'},{...context,call_ids:['c1']},{...context,call_ids:['c1','other']},{...context,call_ids:['c1','c1']},{...context,text:''},{...context,text:'x'.repeat(601)},{...context,iteration:0},{...context,text:'```diary\nprivate notes\n```'},{...context,text:'<think>private</think>'}])assert.equal(publicApprovalRequest(toolCalls,invalid,'r').explanation,undefined,'No stale/partial/cross-run/bad rationale');
assert.equal(publicApprovalRequest([{...toolCalls[0],call_id:''}],context,'r').explanation,undefined);
const controller={approve:async()=>{},resume:async()=>{},emitEvent:async()=>{}};
const interaction=presentInteraction({runId:'r',wait:{wait_key:'approval:1',details:{kind:'tool_approval',tool_calls:toolCalls,public_action:context}}},controller);
const markup=renderToStaticMarkup(React.createElement(WorkflowInteractionPanel,{interaction,variant:'conversation',onReviewTechnical:()=>{}}));
assert.match(markup,/May I read these 2 webpages/);assert.match(markup,/Why I’m asking/);assert.ok(markup.includes(context.text));assert.match(markup,/aibriefs.news/);assert.match(markup,/<\/svg>Allow<\/button>/);assert.ok(!markup.includes('Allow once'));assert.match(markup,/Deny/);assert.match(markup,/Review details/);
for(const term of ['fetch_url','JSON','Tool calls','summary only','Allow all enabled tools','Allow for this chat','covers only what is shown'])assert.ok(!markup.includes(term),'No technical permission panel in Avatar: '+term);
assert.equal((markup.match(/<svg/g)||[]).length,6,'Header, two destinations and labeled choices use shared icons');
// Operator ruling 2026-11-07: the same three decisions in the Avatar view when the session keeps them.
const sessionController={...controller,sessionPolicyStatus:()=>({mode:'gateway',clamped:[],policy:null}),approveToolsForSession:async()=>null,approveAllForSession:async()=>null};
const session=presentInteraction({runId:'r',wait:{wait_key:'approval:1',details:{kind:'tool_approval',tool_calls:toolCalls,public_action:context}}},sessionController,{sessionPolicy:true});
const sessionMarkup=renderToStaticMarkup(React.createElement(WorkflowInteractionPanel,{interaction:session,variant:'conversation',onReviewTechnical:()=>{}}));
assert.deepEqual([...sessionMarkup.matchAll(/data-decision="([^"]+)"/g)].map(m=>m[1]),['deny','approve','approve-all'],'Avatar: Deny, Allow, Allow All');
assert.match(sessionMarkup,/<\/svg>Allow All<\/button>/);assert.ok(!sessionMarkup.includes('pc-public-approval__note'),'no explanatory note when the session keeps the choice');
const technical=renderToStaticMarkup(React.createElement(WorkflowInteractionPanel,{interaction}));assert.match(technical,/fetch_url/);assert.match(technical,/JSON/);
const unknown={...interaction,publicRequest:publicApprovalRequest([{call_id:'u',name:'mcp::server::secret_tool',arguments:{command:'private syntax'}}],null,'r')};
const review=renderToStaticMarkup(React.createElement(WorkflowInteractionPanel,{interaction:unknown,variant:'conversation'}));assert.ok(!review.includes('data-decision="approve"'));assert.ok(!review.includes('secret_tool'));assert.match(review,/Review the details before allowing/);assert.match(review,/isn’t available here/);
const write=publicApprovalRequest([{name:'write_file',arguments:{path:'report.md'}}],null,'r');assert.match(write.actions[0].label,/replace its contents/);
console.log('check_public_approval: human actions, exact public context, no technical leakage, truthful unknown/mutation handling');
