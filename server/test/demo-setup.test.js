import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {User,Leave,MailPreview} from '../src/models.js';
import {prepareLocalDemo} from '../src/prepare-local-demo.js';
import {createApp,errors} from '../src/app.js';
let mongo,folder,settings;
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri(),{dbName:'outpass_local_demo'});
 folder=await fs.mkdtemp(path.join(os.tmpdir(),'outpass-private-demo-'));
 settings={databaseMode:'local',uri:mongo.getUri('outpass_local_demo'),secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173'};
 await User.init();await Leave.init();
});
after(async()=>{await mongoose.disconnect();await mongo?.stop();await fs.rm(folder,{recursive:true,force:true});});
test('local repair activates all roles, writes private credentials, preserves history and invalidates old sessions and links',async()=>{
 const file=path.join(folder,'DEMO_LOGIN_CREDENTIALS.txt');
 const first=await prepareLocalDemo(settings,file),app=createApp(settings);errors(app);
 assert.equal(first.length,4);assert.equal(new Set(first.map(x=>x.password)).size,4);
 const sessions={};
 for(const entry of first){
 assert.ok(entry.password.length>=32);
 const user=await User.findById(entry.id).select('+password');assert.equal(user.role,entry.role);assert.equal(user.requiresPasswordChange,false);assert.ok(user.activatedAt);assert.ok(await bcrypt.compare(entry.password,user.password));
 const login=await request(app).post('/api/auth/login').send({email:entry.email,password:entry.password});assert.equal(login.status,200);assert.equal(login.body.user.role,entry.role);sessions[entry.role]=login.body.token;
 }
 const student=first.find(x=>x.role==='student');
 const leave=await Leave.create({student:student.id,destination:'Fictional demo',reason:'Preserve existing history',departure:new Date(Date.now()+60000),returnBy:new Date(Date.now()+3600000)});
 await User.updateOne({_id:student.id},{$set:{accessTokenHash:randomBytes(32).toString('hex'),accessTokenKind:'reset',accessTokenExpires:new Date(Date.now()+600000)}});
 await MailPreview.create({user:student.id,kind:'reset',status:'preview',expiresAt:new Date(Date.now()+600000),encrypted:'test-only-fixture'});
 const second=await prepareLocalDemo(settings,file),text=await fs.readFile(file,'utf8');
 for(const entry of second){assert.ok(first.some(x=>x.id===entry.id));assert.ok(!first.some(x=>x.password===entry.password));assert.ok(text.includes(entry.email)&&text.includes(entry.password));}
 assert.ok(await Leave.exists({_id:leave.id,student:student.id}));assert.equal(await User.countDocuments(),4);
 const repaired=await User.findById(student.id).select('+accessTokenHash +accessTokenKind');assert.equal(repaired.accessTokenHash,undefined);assert.equal(repaired.accessTokenKind,undefined);
 assert.ok((await MailPreview.findOne({user:student.id})).expiresAt<=new Date());
 assert.equal((await request(app).get('/api/auth/me').set('Authorization','Bearer '+sessions.student)).status,401);
 for(const entry of second){const login=await request(app).post('/api/auth/login').send({email:entry.email,password:entry.password});assert.equal(login.status,200);assert.equal(login.body.user.requiresPasswordChange,false);}
});
test('demo repair refuses Atlas, external hosts, wrong databases and production',async()=>{
 const file=path.join(folder,'refused.txt');
 for(const candidate of [{...settings,databaseMode:'atlas'},{...settings,uri:'mongodb://outside.example/outpass_local_demo'},{...settings,uri:'mongodb://127.0.0.1/other_db'}])await assert.rejects(()=>prepareLocalDemo(candidate,file),/requires development local mode/);
 const saved=process.env.NODE_ENV;try{process.env.NODE_ENV='production';await assert.rejects(()=>prepareLocalDemo(settings,file),/requires development local mode/);}finally{if(saved===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=saved;}
 await assert.rejects(()=>fs.access(file));
});
