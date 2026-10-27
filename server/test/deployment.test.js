import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {config} from '../src/config.js';
import {createApp,errors} from '../src/app.js';
import {pingDatabase} from '../src/database-ping.js';
import {validateHostedApiOrigin} from '../../client/deployment-config.js';

test('hosting manifests use the workspace root, static-only artifact and SPA rewrites',()=>{
 const root=new URL('../../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('vercel.json',root),'utf8'));
 assert.equal(manifest.outputDirectory,'client/dist');assert.equal(manifest.buildCommand,'npm run build');assert.match(manifest.installCommand,/MONGOMS_DISABLE_POSTINSTALL=1/);
 assert.ok(manifest.rewrites.some(r=>r.source==='/(.*)'&&r.destination==='/index.html'));
 const blueprint=fs.readFileSync(new URL('render.yaml',root),'utf8');
 for(const line of ['rootDir: .','startCommand: npm run start -w server','healthCheckPath: /api/health','autoDeployTrigger: "off"','numInstances: 1'])assert.ok(blueprint.includes(line));
 const ignore=fs.readFileSync(new URL('.vercelignore',root),'utf8');
 for(const filename of ['**/.env','**/.env.*','**/DEMO_LOGIN_CREDENTIALS.txt','.local-mongodb/**'])assert.ok(ignore.includes(filename));
 const pkg=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8')),lock=JSON.parse(fs.readFileSync(new URL('package-lock.json',root),'utf8'));assert.equal(pkg.engines.node,'24.x');assert.equal(lock.packages[''].engines.node,'24.x');
});
test('Vercel API URL validation rejects localhost, insecure or ambiguous API bases',()=>{
 assert.equal(validateHostedApiOrigin('https://fictional-api.onrender.com'),'https://fictional-api.onrender.com');
 for(const value of [undefined,'','http://localhost:5000','https://localhost','https://fictional-api.onrender.com/','https://fictional-api.onrender.com/api','https://fictional-api.onrender.com?x=1'])assert.throws(()=>validateHostedApiOrigin(value));
});
test('production config uses explicit hosted environment and ignores private local selectors',()=>{
 const keys=['NODE_ENV','DATABASE_MODE','DEMO_MODE','APP_ENV','DEMO_MONGODB_URI','MONGODB_URI','JWT_SECRET','CLIENT_ORIGIN','PORT','TRUST_PROXY_HOPS'];const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
 Object.assign(process.env,{NODE_ENV:'production',DATABASE_MODE:'atlas',DEMO_MODE:'true',APP_ENV:'demo',DEMO_MONGODB_URI:'mongodb+srv://fictional.invalid/outpass_professor_demo',JWT_SECRET:randomBytes(48).toString('hex'),CLIENT_ORIGIN:'https://fictional-ui.vercel.app',PORT:'10000',TRUST_PROXY_HOPS:'1'});delete process.env.MONGODB_URI;
 const c=config();assert.equal(c.port,10000);assert.equal(c.origin,'https://fictional-ui.vercel.app');assert.equal(c.demoMode,true);assert.equal(c.trustProxyHops,1);assert.equal(c.productionUri,undefined);
 delete process.env.DEMO_MONGODB_URI;assert.throws(()=>config(),/dedicated DEMO_MONGODB_URI/);
 process.env.DEMO_MONGODB_URI='mongodb+srv://fictional.invalid/outpass_professor_demo';process.env.CLIENT_ORIGIN='http://localhost:5173';assert.throws(()=>config(),/HTTPS frontend origin/);
 process.env.CLIENT_ORIGIN='https://fictional-ui.vercel.app/';assert.throws(()=>config(),/HTTPS frontend origin/);
 process.env.CLIENT_ORIGIN='https://fictional-ui.vercel.app';process.env.PORT='invalid';assert.throws(()=>config(),/valid TCP port/);
 }finally{for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
});
test('cross-origin bearer preflight permits the exact configured frontend and no credential cookies',async()=>{
 const app=createApp({secret:randomBytes(48).toString('hex'),origin:'https://fictional-ui.vercel.app',trustProxyHops:1});errors(app);
 const allowed=await request(app).options('/api/auth/demo').set('Origin','https://fictional-ui.vercel.app').set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type');
 assert.equal(allowed.status,204);assert.equal(allowed.headers['access-control-allow-origin'],'https://fictional-ui.vercel.app');assert.match(allowed.headers['access-control-allow-headers'],/authorization/);assert.equal(allowed.headers['access-control-allow-credentials'],undefined);assert.equal(app.get('trust proxy'),1);
 const foreign=await request(app).options('/api/auth/demo').set('Origin','https://unrelated.example').set('Access-Control-Request-Method','POST');assert.notEqual(foreign.headers['access-control-allow-origin'],'https://unrelated.example');
});
test('database ping succeeds against isolated MongoDB and rejects an unsuccessful ping',async()=>{
 const password=randomBytes(24).toString('base64url');
 let mongo;try{mongo=await MongoMemoryServer.create({auth:{enable:true,customRootName:'isolated-ping-user',customRootPwd:password}});await mongoose.connect(mongo.getUri(),{user:'isolated-ping-user',pass:password,authSource:'admin'});await pingDatabase(mongoose.connection);}finally{await mongoose.disconnect();await mongo?.stop();}
 await assert.rejects(()=>pingDatabase({db:{command:async()=>({ok:0})}}),/Database ping failed/);
 await assert.rejects(()=>pingDatabase({db:{command:async()=>({ok:1}),admin:()=>({command:async()=>({ok:1,authInfo:{authenticatedUsers:[]}})})}}),/Authenticated database connection required/);
});
