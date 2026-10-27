import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createApp,errors} from '../src/app.js';
import {User,Leave} from '../src/models.js';
let mongo,app,tokens={},password,studentId;
before(async()=>{
 mongo=await MongoMemoryServer.create();
 await mongoose.connect(mongo.getUri());
 const settings={secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173'};
 app=createApp(settings);errors(app);
 password=randomBytes(16).toString('hex');
 for(const role of ['student','warden','guard']){
 const user=await User.create({name:'Test '+role,email:role+'@test.example',role,password:await bcrypt.hash(password,4)});
 if(role==='student')studentId=user._id;
 const login=await request(app).post('/api/auth/login').send({email:user.email,password});
 assert.equal(login.status,200);tokens[role]=login.body.token;
 }
 await User.init();await Leave.init();
});
after(async()=>{await mongoose.disconnect();await mongo?.stop();});
const api=(method,path,role)=>request(app)[method]('/api'+path).set('Authorization','Bearer '+tokens[role]);
async function leave(){const r=await api('post','/leaves','student').send({destination:'Mysuru family home',reason:'Family gathering this weekend',departure:new Date(Date.now()+60000).toISOString(),returnBy:new Date(Date.now()+3600000).toISOString()});assert.equal(r.status,201);return r.body.leave;}
async function approved(){const l=await leave();const r=await api('patch','/leaves/'+l._id+'/decision','warden').send({decision:'approved',note:'Travel safely'});assert.equal(r.status,200);await Leave.updateOne({_id:l._id},{$set:{departure:new Date(Date.now()-60000)}});return l;}
test('health, login, JWT validation, role restrictions',async()=>{
 assert.equal((await request(app).get('/api/health')).status,200);
 assert.equal((await request(app).get('/api/auth/me')).status,401);
 assert.equal((await request(app).get('/api/auth/me').set('Authorization','Bearer invalid')).status,401);
 assert.equal((await api('get','/auth/me','student')).body.user.role,'student');
 const me=(await api('get','/auth/me','student')).body.user;assert.equal(me.password,undefined);
 assert.equal((await request(app).post('/api/auth/login').send({email:'student@test.example',password:'wrong'})).status,401);
 assert.equal((await request(app).post('/api/auth/login').send({email:{$ne:null},password})).status,400);
 assert.equal((await api('get','/leaves','guard')).status,403);
 assert.equal((await api('get','/stats','student')).status,403);
});
test('validates dates, text, ownership and student visibility',async()=>{
 assert.equal((await api('post','/leaves','student').send({destination:'x',reason:'x',departure:'bad',returnBy:'bad'})).status,400);
 const l=await leave();
 assert.equal((await api('patch','/leaves/'+l._id+'/decision','student').send({decision:'approved'})).status,403);
 assert.equal((await api('get','/leaves/'+l._id+'/pass','student')).status,409);
 assert.equal((await api('get','/leaves/bad/pass','student')).status,400);
 const second=await User.create({name:'Other student',email:'other@test.example',role:'student',password:await bcrypt.hash(password,4)});
 const login=await request(app).post('/api/auth/login').send({email:second.email,password});tokens.other=login.body.token;
 assert.equal((await api('get','/leaves','other')).body.leaves.length,0);
 assert.equal((await api('get','/leaves/'+l._id+'/pass','other')).status,404);
});
test('rejection requires note and decisions cannot be repeated',async()=>{
 const l=await leave();
 assert.equal((await api('patch','/leaves/'+l._id+'/decision','warden').send({decision:'rejected'})).status,400);
 assert.equal((await api('patch','/leaves/'+l._id+'/decision','warden').send({decision:'rejected',note:'Please revise your dates'})).status,200);
 assert.equal((await api('patch','/leaves/'+l._id+'/decision','warden').send({decision:'approved'})).status,409);
 assert.equal((await api('get','/leaves/'+l._id+'/pass','student')).status,409);
});
test('complete workflow: approval, QR, validation, checkout, return, duplicate prevention',async()=>{
 const l=await approved();
 const pass=await api('get','/leaves/'+l._id+'/pass','student');assert.equal(pass.status,200);
 const token=pass.body.token;assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.match(pass.body.qr,/^data:image\/png;base64,/);
 const list=await api('get','/leaves','warden');assert.ok(list.body.leaves.every(x=>!x.passToken&&!x.passHash));
 assert.equal((await api('post','/gate/validate','student').send({token})).status,403);
 const validation=await api('post','/gate/validate','guard').send({token});assert.equal(validation.body.nextAction,'checkout');
 assert.equal(validation.body.leave.passToken,undefined);
 assert.equal((await api('post','/gate/record','guard').send({token,action:'return'})).status,409);
 const parallel=await Promise.all([1,2].map(()=>api('post','/gate/record','guard').send({token,action:'checkout'})));
 assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);
 assert.equal((await api('post','/gate/validate','guard').send({token})).body.nextAction,'return');
 const returns=await Promise.all([1,2].map(()=>api('post','/gate/record','guard').send({token,action:'return'})));
 assert.deepEqual(returns.map(x=>x.status).sort(),[200,409]);
 assert.equal((await api('post','/gate/validate','guard').send({token})).status,409);
 assert.equal((await api('get','/leaves/'+l._id+'/pass','student')).status,409);
 const record=await Leave.findById(l._id);assert.ok(record.checkedOutAt&&record.returnedAt&&record.checkoutGuard&&record.returnGuard);
 assert.ok((await api('get','/gate/history','guard')).body.leaves.length>=1);
 assert.ok((await api('get','/stats','warden')).body.stats.returned>=1);
});
test('invalid tokens, checkout window, overdue returns and expired approvals',async()=>{
 assert.equal((await api('post','/gate/validate','guard').send({token:'bad'})).status,400);
 assert.equal((await api('post','/gate/validate','guard').send({token:randomBytes(32).toString('base64url')})).status,404);
 const l=await approved();const token=(await api('get','/leaves/'+l._id+'/pass','student')).body.token;
 await Leave.updateOne({_id:l._id},{$set:{departure:new Date(Date.now()+600000)}});
 assert.equal((await api('post','/gate/validate','guard').send({token})).status,409);
 assert.equal((await api('post','/gate/record','guard').send({token,action:'checkout'})).status,409);
 await Leave.updateOne({_id:l._id},{$set:{departure:new Date(Date.now()-600000),returnBy:new Date(Date.now()-1000),status:'checked_out'}});
 assert.equal((await api('post','/gate/validate','guard').send({token})).body.overdue,true);
 assert.equal((await api('post','/gate/record','guard').send({token,action:'return'})).status,200);
 const expired=await leave();await Leave.updateOne({_id:expired._id},{$set:{returnBy:new Date(Date.now()-1000)}});
 assert.equal((await api('patch','/leaves/'+expired._id+'/decision','warden').send({decision:'approved'})).status,409);
});


test('demo seed creates activatable accounts without plaintext passwords and preserves existing accounts',async()=>{
 const {spawnSync}=await import('node:child_process');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'outpass-seed-test-'));
 try{
 const env={...process.env,DEMO_MODE:'false',DATABASE_MODE:'atlas',MONGODB_URI:mongo.getUri(),JWT_SECRET:randomBytes(48).toString('hex'),SEED_PREVIEW_DIR:directory,EMAIL_DELIVERY_ENABLED:'false'};
 const run=()=>spawnSync(process.execPath,['src/seed.js'],{env,encoding:'utf8',timeout:30000});
 const first=run();assert.equal(first.status,0,'Seed process failed');assert.ok(!first.stdout.includes('temporary password:'));
 for(const role of ['student','warden','guard']){
 const html=await fs.readFile(path.join(directory,'.env.'+role+'-activation.html'),'utf8');
 const token=html.match(/activate#token=([A-Za-z0-9_-]+)/)?.[1];assert.ok(Boolean(token));
 const completed=await request(app).post('/api/auth/activate').send({token,password});assert.equal(completed.status,200);
 const login=await request(app).post('/api/auth/login').send({email:role+'@outpass.demo',password});
 assert.equal(login.status,200);assert.equal(login.body.user.role,role);assert.equal(login.body.user.requiresPasswordChange,false);
 }
 const hashes=await User.find({email:/@outpass\.demo$/}).select('+password').lean();
 const second=run();assert.equal(second.status,0);assert.ok(!second.stdout.includes('temporary password:'));
 for(const user of hashes)assert.equal((await User.findById(user._id).select('+password')).password,user.password);
 assert.equal(await User.countDocuments({email:/@outpass\.demo$/}),3);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('guard privacy, student-visible movement history, inactive passes and authorization',async()=>{
 const l=await approved(),token=(await api('get','/leaves/'+l._id+'/pass','student')).body.token;
 const valid=await api('post','/gate/validate','guard').send({token});
 assert.equal(valid.body.leave.reason,undefined);assert.equal(valid.body.leave.student.email,undefined);
 for(const role of ['student','warden']){
 assert.equal((await api('post','/gate/validate',role).send({token})).status,403);
 assert.equal((await api('post','/gate/record',role).send({token,action:'checkout'})).status,403);
 assert.equal((await api('get','/gate/history',role)).status,403);
 }
 assert.equal((await api('post','/gate/record','guard').send({token,action:'return'})).status,409);
 await api('post','/gate/record','guard').send({token,action:'checkout'});
 let own=(await api('get','/leaves','student')).body.leaves.find(x=>x._id===l._id);
 assert.equal(own.status,'checked_out');assert.ok(own.checkedOutAt);
 await api('post','/gate/record','guard').send({token,action:'return'});
 own=(await api('get','/leaves','student')).body.leaves.find(x=>x._id===l._id);
 assert.equal(own.status,'returned');assert.ok(own.returnedAt);assert.ok(own.checkedOutAt);
 for(const status of ['rejected','cancelled']){
 const inactive=await approved(),inactiveToken=(await api('get','/leaves/'+inactive._id+'/pass','student')).body.token;
 await Leave.collection.updateOne({_id:new mongoose.Types.ObjectId(inactive._id)},{$set:{status}});
 assert.equal((await api('post','/gate/validate','guard').send({token:inactiveToken})).status,409);
 assert.equal((await api('post','/gate/record','guard').send({token:inactiveToken,action:'checkout'})).status,409);
 }
});
