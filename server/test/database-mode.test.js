import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../src/config.js';
test('explicit local mode is loopback-only, forbidden in production, and preserves Atlas settings',()=>{
 const keys=['DATABASE_MODE','LOCAL_MONGODB_URI','NODE_ENV','MONGODB_URI','JWT_SECRET','DEMO_MODE'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
 process.env.DEMO_MODE='false';
 process.env.MONGODB_URI='mongodb+srv://fictional.invalid/example';process.env.JWT_SECRET='test-only-secret-with-at-least-thirty-two-characters';
 process.env.DATABASE_MODE='atlas';assert.equal(config().uri,process.env.MONGODB_URI);
 process.env.DATABASE_MODE='local';process.env.NODE_ENV='development';process.env.LOCAL_MONGODB_URI='mongodb://127.0.0.1:27017/fictional_demo';
 assert.equal(config().databaseMode,'local');assert.equal(config().uri,process.env.LOCAL_MONGODB_URI);assert.equal(process.env.MONGODB_URI,'mongodb+srv://fictional.invalid/example');assert.equal(config().secret,process.env.JWT_SECRET);
 process.env.LOCAL_MONGODB_URI='mongodb://external.example/demo';assert.throws(()=>config(),/loopback/);
 process.env.LOCAL_MONGODB_URI='mongodb://127.0.0.1:27017/demo';process.env.NODE_ENV='production';assert.throws(()=>config(),/development\/demo/);
 process.env.NODE_ENV='development';process.env.DATABASE_MODE='automatic';assert.throws(()=>config(),/atlas or local/);
 }finally{for(const k of keys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
});
