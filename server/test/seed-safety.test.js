import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import mongoose from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {User,Leave,MailPreview} from '../src/models.js';
import {assertNormalSeedTarget} from '../src/seed-safety.js';
let mongo,uri;
before(async()=>{mongo=await MongoMemoryServer.create();uri=mongo.getUri('outpass_professor_demo_seed');await mongoose.connect(uri);});
after(async()=>{await mongoose.disconnect();await mongo?.stop();});
test('ordinary seed target guard rejects professor mode and database names before connection',()=>{
 assert.throws(()=>assertNormalSeedTarget({demoMode:true,uri:'mongodb://127.0.0.1/ordinary'}),/Normal seed refused/);
 assert.throws(()=>assertNormalSeedTarget({demoMode:false,uri:'mongodb://127.0.0.1/outpass_professor_demo'}),/Normal seed refused/);
 assert.throws(()=>assertNormalSeedTarget({demoMode:false,uri:'mongodb://127.0.0.1/outpass_professor_demo_review1'}),/Normal seed refused/);
 assert.doesNotThrow(()=>assertNormalSeedTarget({demoMode:false,uri:'mongodb://127.0.0.1/outpass_local_demo'}));
});
test('student/warden/guard seed and admin seed/recovery leave an isolated professor database unchanged',async()=>{
 await User.create({name:'Preserved fictional fixture',email:'preserved@fixture.example',role:'student',isDemo:true,password:'fixture-not-for-login'});
 const snapshot=JSON.stringify(await User.find().lean());
 for(const demoMode of ['true','false'])for(const [script,args]of [['seed.js',[]],['seed-admin.js',[]],['seed-admin.js',['--recover']]]){
 const env={...process.env,DATABASE_MODE:'atlas',DEMO_MODE:demoMode,APP_ENV:'demo',MONGODB_URI:uri,DEMO_MONGODB_URI:uri,JWT_SECRET:randomBytes(48).toString('hex'),EMAIL_DELIVERY_ENABLED:'false'};
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../src/'+script,import.meta.url)),...args],{env,encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);assert.match(result.stderr,/Normal seed refused/);assert.equal(result.stdout,'');
 assert.equal(JSON.stringify(await User.find().lean()),snapshot);assert.equal(await Leave.countDocuments(),0);assert.equal(await MailPreview.countDocuments(),0);
 }
});
