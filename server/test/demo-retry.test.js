import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import viteConfig from '../../client/vite.config.js';

// Cold-start readiness of the login-page demo cards, using scripted fetch responses only.
const fast={baseMs:5,maxMs:20,attempts:3};
const keys=['window','document','sessionStorage','IS_REACT_ACT_ENVIRONMENT','fetch'];
let vite,ExploreDemo,Auth,saved;
before(async()=>{
 saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 vite=await createServer({...viteConfig,configFile:false,root:fileURLToPath(new URL('../../client',import.meta.url)),appType:'custom',server:{middlewareMode:true,hmr:false}});
 ({ExploreDemo}=await vite.ssrLoadModule('/src/ProfessorDemo.jsx'));({Auth}=await vite.ssrLoadModule('/src/auth-context.js'));
});
after(async()=>{for(const key of keys)if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];await vite?.close();});

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function mount(script,retry=fast){
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'http://127.0.0.1/login'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),method:options.method||'GET',signal:options.signal});const step=script(calls.length);if(step instanceof Error)throw step;return step;};
 const root=createRoot(document.getElementById('app'));
 const auth={user:null,token:null,login:()=>assert.fail('Readiness checks must not log in')};
 await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(Auth.Provider,{value:auth},React.createElement(ExploreDemo,{retry})))));
 return {calls,root};
}
async function waitFor(predicate,message){for(let i=0;i<150;i++){if(predicate())return;await act(async()=>{await new Promise(r=>setTimeout(r,10));});}assert.fail(message);}
const roleButtons=()=>[...document.querySelectorAll('button[aria-label^="Explore "]')].map(b=>b.getAttribute('aria-label'));
const text=()=>document.body.textContent;
const onlyReadiness=calls=>calls.every(c=>c.url==='/api/demo/info'&&c.method==='GET');

test('temporary 503 and network failures show a connecting state, then the four role cards',async()=>{
 const {calls,root}=await mount(n=>n===1?new TypeError('fetch failed'):n===2?json({message:'Database connection unavailable. Please try again shortly.'},503):json({enabled:true,roles:['student','warden','guard','admin']}));
 await waitFor(()=>text().includes('Connecting to demo server...'),'Connecting state did not appear');
 await waitFor(()=>roleButtons().length===4,'Role cards did not recover');
 assert.deepEqual(roleButtons(),['Explore Student demo','Explore Warden demo','Explore Guard demo','Explore Admin demo']);
 assert.equal(calls.length,3);assert.ok(onlyReadiness(calls));assert.ok(!text().includes('Connecting to demo server'));
 await act(async()=>root.unmount());
});

test('Render HTML 502 gateway pages are retried rather than treated as demo disabled',async()=>{
 const {calls,root}=await mount(n=>n===1?new Response('<html>Bad gateway</html>',{status:502,headers:{'Content-Type':'text/html'}}):json({enabled:true,roles:[]}));
 await waitFor(()=>roleButtons().length===4,'Role cards did not recover after a 502 page');
 assert.equal(calls.length,2);
 await act(async()=>root.unmount());
});

test('an explicit demo-disabled response hides the demo without retrying',async()=>{
 const {calls,root}=await mount(()=>json({enabled:false,roles:[]}));
 await waitFor(()=>calls.length===1,'Readiness was not checked');
 await act(async()=>{await new Promise(r=>setTimeout(r,500));});
 assert.equal(calls.length,1);assert.equal(document.getElementById('app').innerHTML,'');
 await act(async()=>root.unmount());
});

test('non-temporary client errors are not retried',async()=>{
 const {calls,root}=await mount(()=>json({message:'Route not found'},404));
 await act(async()=>{await new Promise(r=>setTimeout(r,200));});
 assert.equal(calls.length,1);assert.equal(roleButtons().length,0);assert.ok(!text().includes('Retry'));
 await act(async()=>root.unmount());
});

test('retries stop at the limit and a Retry button restarts the readiness check',async()=>{
 let recovered=false;
 const {calls,root}=await mount(()=>recovered?json({enabled:true,roles:[]}):json({message:'Database connection unavailable. Please try again shortly.'},503));
 await waitFor(()=>text().includes('The demo server is not responding yet.'),'Retry exhaustion message did not appear');
 assert.equal(calls.length,fast.attempts);
 await act(async()=>{await new Promise(r=>setTimeout(r,200));});
 assert.equal(calls.length,fast.attempts,'Retries must be bounded');
 const retry=[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry');assert.ok(retry);
 recovered=true;await act(async()=>retry.click());
 await waitFor(()=>roleButtons().length===4,'Role cards did not appear after manual retry');
 assert.equal(calls.length,fast.attempts+1);assert.ok(onlyReadiness(calls));
 await act(async()=>root.unmount());
});

test('unmounting cancels the in-flight request and any scheduled retry',async()=>{
 const {calls,root}=await mount(()=>json({message:'Starting'},503),{baseMs:150,maxMs:150,attempts:5});
 await waitFor(()=>calls.length===1,'Readiness was not checked');
 await act(async()=>root.unmount());
 assert.equal(calls[0].signal.aborted,true);
 await new Promise(r=>setTimeout(r,400));
 assert.equal(calls.length,1);
});

test('default backoff is bounded and covers a typical free-tier wake-up',async()=>{
 const {demoInfoRetry}=await vite.ssrLoadModule('/src/ProfessorDemo.jsx');
 let total=0;for(let attempt=1;attempt<demoInfoRetry.attempts;attempt++)total+=Math.min(demoInfoRetry.maxMs,demoInfoRetry.baseMs*2**(attempt-1));
 assert.ok(demoInfoRetry.attempts<=12,'Retry count must stay bounded');
 assert.ok(total>=60000&&total<=120000,'Backoff should wait roughly one to two minutes in total, got '+total+'ms');
});
