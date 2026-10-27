import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import viteConfig from '../../client/vite.config.js';
import {createApp,errors} from '../src/app.js';
import {prepareProfessorDemo} from '../src/professor-demo.js';
import {User,Leave} from '../src/models.js';

test('React role cards, sample preparation, capacity notice and role switching work before and at capacity',async()=>{
 let mongo,backend,vite,root;
 const nativeFetch=globalThis.fetch,keys=['window','document','sessionStorage','IS_REACT_ACT_ENVIRONMENT'];
 const saved=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 try{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri(),{dbName:'outpass_professor_demo_ui'});
 const settings={demoMode:true,deploymentEnvironment:'demo',uri:mongo.getUri('outpass_professor_demo_ui'),secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173'};
 await prepareProfessorDemo(settings);const app=createApp(settings);app.locals.demoReady=true;errors(app);
 backend=app.listen(0,'127.0.0.1');await new Promise(r=>backend.once('listening',r));
 vite=await createServer({...viteConfig,configFile:false,root:fileURLToPath(new URL('../../client',import.meta.url)),server:{...viteConfig.server,host:'127.0.0.1',port:0,open:false,proxy:{'/api':'http://127.0.0.1:'+backend.address().port}}});await vite.listen();
 const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 const dom=new JSDOM('<!doctype html><div id="test-app"></div>',{url:origin+'/login'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.sessionStorage=dom.window.sessionStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.fetch=(url,options)=>nativeFetch(new URL(url,origin),options);
 const {App}=await vite.ssrLoadModule('/src/main.jsx');
 root=createRoot(document.getElementById('test-app'));
 await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/login']},React.createElement(App))));
 async function waitFor(predicate){for(let i=0;i<100;i++){if(predicate())return;await act(async()=>{await new Promise(r=>setTimeout(r,20));});}assert.fail('Expected dashboard UI did not appear');}
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent===label);
 await waitFor(()=>button('Explore Student demo'));
 const headings={Student:'Make room for your plans.',Warden:'A clear view of campus.',Guard:'Safe exits. Welcome returns.',Admin:'A clear view of fictional student accounts.'};
 async function exerciseRoles(atCapacity=false){let previous;
 for(const role of ['Student','Warden','Guard','Admin']){
 if(previous){await act(async()=>button('Switch Demo Role').click());await waitFor(()=>button('Explore '+role+' demo'));}
 await act(async()=>button('Explore '+role+' demo').click());
 await waitFor(()=>document.querySelector('h1')?.textContent===headings[role]);
 if(atCapacity)await waitFor(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent.includes('Demo request limit reached')));
 else if(role==='Student')await waitFor(()=>document.querySelector('tbody')?.textContent.includes('Campus library demonstration'));
 assert.ok(button('Switch Demo Role'));
 const token=sessionStorage.getItem('outpass-token');assert.ok(Boolean(token));
 if(previous)await act(async()=>{const old=await nativeFetch(origin+'/api/auth/me',{headers:{Authorization:'Bearer '+previous}});assert.equal(old.status,401);});
 previous=token;
 if(role==='Admin'){assert.ok(!document.querySelector('a[href="/onboarding"]'));assert.ok(!document.querySelector('a[href="/change-password"]'));}
 }
 }
 await exerciseRoles();
 await act(async()=>document.querySelector('button[aria-label="Log out"]').click());
 await waitFor(()=>button('Explore Student demo'));assert.equal(sessionStorage.getItem('outpass-token'),null);
 // Capacity fixtures are created only in this test's temporary database.
 const student=await User.findOne({role:'student',isDemo:true});
 await Leave.updateMany({isDemo:true},{$unset:{demoActiveKey:1}});
 const remaining=200-await Leave.countDocuments();
 await Leave.insertMany(Array.from({length:remaining},()=>({student:student._id,isDemo:true,destination:'Quota history fixture',reason:'Isolated UI capacity test',status:'returned',departure:new Date(Date.now()-60000),returnBy:new Date(Date.now()+3600000)})));
 await exerciseRoles(true);assert.equal(await Leave.countDocuments(),200);
 }finally{
 if(root)await act(async()=>root.unmount());globalThis.fetch=nativeFetch;
 for(const key of keys)if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];
 await vite?.close();if(backend)await new Promise(r=>backend.close(r));await mongoose.disconnect();await mongo?.stop();
 }
});
