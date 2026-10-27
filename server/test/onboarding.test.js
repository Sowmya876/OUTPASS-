import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {createApp,errors} from '../src/app.js';
import {User,MailPreview} from '../src/models.js';
import {unseal,deliverInvitation} from '../src/mail.js';
let mongo,app,settings,password,tokens={};
const digest=t=>createHash('sha256').update(t).digest('hex');
const input=(name='Aarav Fictional',email='aarav@sst.scaler.com')=>({name,email,rollNumber:'SST-TEST-42',hostel:'Maple',room:'B-204'});
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri());
 settings={secret:randomBytes(48).toString('hex'),origin:'http://localhost:5173',allowedStudentEmailDomain:'sst.scaler.com',emailDeliveryEnabled:false};
 app=createApp(settings);errors(app);password=randomBytes(18).toString('hex');
 for(const role of ['admin','student','warden','guard']){
 await User.create({name:'Test '+role,email:role+'@test.example',role,password:await bcrypt.hash(password,4)});
 tokens[role]=(await request(app).post('/api/auth/login').send({email:role+'@test.example',password})).body.token;
 }
 await User.init();await MailPreview.init();
});
after(async()=>{await mongoose.disconnect();await mongo?.stop();});
const call=(method,path,role='admin')=>request(app)[method]('/api'+path).set('Authorization','Bearer '+tokens[role]);
async function provision(email){const r=await call('post','/admin/students').send(input('Fictional Student',email));assert.equal(r.status,201);return r.body.student;}
async function link(id){
 const r=await call('get','/admin/students/'+id+'/invitation');assert.equal(r.status,200);
 const token=r.body.mail.text.match(/activate#token=([A-Za-z0-9_-]+)/)?.[1];assert.ok(Boolean(token));
 return {token,preview:r.body};
}
async function login(email,pw){return request(app).post('/api/auth/login').send({email,password:pw});}
test('only admins can provision; college domain and duplicates are validated; roles cannot be injected',async()=>{
 assert.equal((await request(app).post('/api/admin/students').send(input())).status,401);
 for(const role of ['student','warden','guard'])assert.equal((await call('post','/admin/students',role).send(input())).status,403);
 assert.equal((await call('post','/admin/students').send(input('Name','wrong@example.com'))).status,400);
 assert.equal((await call('post','/admin/students').send(input('Name','user@evil.sst.scaler.com'))).status,400);
 assert.equal((await call('post','/admin/students').send(input('Name','user@sst.scaler.com.evil.example'))).status,400);
 assert.equal((await call('post','/admin/students').send({...input(),role:'admin'})).status,201);
 assert.equal((await User.findOne({email:input().email})).role,'student');
 assert.equal((await call('post','/admin/students').send({...input(),email:'AARAV@SST.SCALER.COM'})).status,409);
 const students=(await call('get','/admin/students')).body.students;
 assert.ok(students.every(s=>!s.password&&!s.accessTokenHash&&!s.encrypted));
 assert.equal((await request(app).get('/api/onboarding/info')).body.allowedDomain,'sst.scaler.com');
});
test('invitation is a test preview with encrypted storage, no password, escaped greeting and one-time activation',async()=>{
 const student=await provision('activation@sst.scaler.com');
 const {token,preview}=await link(student.id);
 assert.equal(preview.status,'preview');assert.equal(preview.kind,'activation');assert.ok(!preview.mail.text.includes('temporary password'));
 const stored=await MailPreview.findOne({user:student.id}).select('+encrypted');
 assert.ok(!stored.encrypted.includes(token));assert.ok(!stored.encrypted.includes(student.email));
 assert.equal(unseal(stored.encrypted,settings.secret).subject,'Activate your OutPass account');
 assert.equal((await call('get','/admin/students/'+student.id+'/invitation','warden')).status,403);
 assert.equal((await request(app).post('/api/auth/activate').send({token,password:'short'})).status,400);
 const finished=await request(app).post('/api/auth/activate').send({token,password});assert.equal(finished.status,200);
 assert.equal((await request(app).post('/api/auth/activate').send({token,password})).status,400);
 const signed=await login(student.email,password);assert.equal(signed.status,200);assert.equal(signed.body.user.requiresPasswordChange,false);
 const history=await request(app).get('/api/leaves').set('Authorization','Bearer '+signed.body.token);assert.equal(history.status,200);
 const user=await User.findById(student.id).select('+password +accessTokenHash');
 assert.equal(user.accessTokenHash,undefined);assert.ok(await bcrypt.compare(password,user.password));
 assert.equal((await call('get','/admin/students/'+student.id+'/invitation')).status,404);
});
test('restricted first login cannot bypass password setup and change rotates existing sessions',async()=>{
 const student=await provision('temporary@sst.scaler.com');
 // Simulate a bootstrap credential that was communicated through an approved channel.
 // The plaintext only exists in this test process; the DB receives a hash.
 await User.updateOne({_id:student.id},{$set:{password:await bcrypt.hash(password,4)}});
 const first=await login(student.email,password);assert.equal(first.status,200);assert.equal(first.body.user.requiresPasswordChange,true);
 const t=first.body.token;
 assert.equal((await request(app).get('/api/auth/me').set('Authorization','Bearer '+t)).status,200);
 for(const [method,path,body] of [['get','/leaves'],['post','/leaves',{}],['get','/admin/students'],['post','/gate/validate',{token:randomBytes(32).toString('base64url')}]])
 assert.equal((await request(app)[method]('/api'+path).set('Authorization','Bearer '+t).send(body)).status,403);
 const next=randomBytes(18).toString('hex');
 assert.equal((await request(app).post('/api/auth/change-password').set('Authorization','Bearer '+t).send({currentPassword:'wrong',password:next})).status,400);
 const changed=await request(app).post('/api/auth/change-password').set('Authorization','Bearer '+t).send({currentPassword:password,password:next});
 assert.equal(changed.status,200);assert.equal(changed.body.user.requiresPasswordChange,false);
 assert.equal((await request(app).get('/api/leaves').set('Authorization','Bearer '+t)).status,401);
 assert.equal((await request(app).get('/api/leaves').set('Authorization','Bearer '+changed.body.token)).status,200);
 assert.equal((await login(student.email,password)).status,401);assert.equal((await login(student.email,next)).status,200);
});
test('expired, superseded and concurrently reused activation links cannot be consumed',async()=>{
 const student=await provision('expiry@sst.scaler.com');
 const old=(await link(student.id)).token;
 await User.updateOne({_id:student.id},{$set:{accessTokenExpires:new Date(Date.now()-1000)}});
 assert.equal((await request(app).post('/api/auth/activate').send({token:old,password})).status,400);
 assert.equal((await call('post','/admin/students/'+student.id+'/invitation').send({})).status,200);
 const current=(await link(student.id)).token;assert.ok(current!==old);
 assert.equal((await request(app).post('/api/auth/activate').send({token:old,password})).status,400);
 const concurrent=await Promise.all([1,2].map(()=>request(app).post('/api/auth/activate').send({token:current,password})));
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,400]);
});
test('safe recovery uses generic responses, a short-lived link, and revokes old JWTs',async()=>{
 const student=await provision('recovery@sst.scaler.com');let token=(await link(student.id)).token;
 assert.equal((await request(app).post('/api/auth/activate').send({token,password})).status,200);
 const session=(await login(student.email,password)).body.token;
 const known=await request(app).post('/api/auth/forgot-password').send({email:student.email});
 const missing=await request(app).post('/api/auth/forgot-password').send({email:'not-existing@sst.scaler.com'});
 assert.equal(known.status,200);assert.deepEqual(known.body,missing.body);
 let user;
 for(let i=0;i<100;i++){user=await User.findById(student.id).select('+accessTokenHash +accessTokenKind');if(user.accessTokenKind==='reset'&&await MailPreview.exists({user:student.id,kind:'reset'}))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(user.accessTokenKind,'reset');assert.ok(user.accessTokenExpires-Date.now()<=30*60000);
 token=(await link(student.id)).token;
 const next=randomBytes(20).toString('hex');
 assert.equal((await request(app).post('/api/auth/activate').send({token,password:next})).status,200);
 assert.equal((await request(app).get('/api/auth/me').set('Authorization','Bearer '+session)).status,401);
 assert.equal((await login(student.email,next)).status,200);
 assert.equal((await request(app).post('/api/auth/activate').send({token,password})).status,400);
});
test('CSV supports quoted fields and rejects wrong domains, duplicate rows, malformed or oversized imports',async()=>{
 const valid='name,email,rollNumber,hostel,room\n"CSV, Fictional",csv-one@sst.scaler.com,CSV1,Maple,A1\nCSV Two,csv-two@sst.scaler.com,CSV2,Maple,A2';
 const r=await call('post','/admin/students/import').send({csv:valid});assert.equal(r.status,201);assert.equal(r.body.created,2);
 assert.equal((await User.findOne({email:'csv-one@sst.scaler.com'})).name,'CSV, Fictional');
 assert.equal((await call('post','/admin/students/import').send({csv:valid})).status,400);
 const count=await User.countDocuments();
 const duplicate='name,email,rollNumber,hostel,room\nOne,dup@sst.scaler.com,D1,H,A\nTwo,dup@sst.scaler.com,D2,H,B';
 assert.equal((await call('post','/admin/students/import').send({csv:duplicate})).status,400);
 const wrong='name,email,rollNumber,hostel,room\nOne,ok-not-created@sst.scaler.com,D1,H,A\nTwo,no@example.com,D2,H,B';
 const invalid=await call('post','/admin/students/import').send({csv:wrong});assert.equal(invalid.status,400);assert.ok(invalid.body.issues.length);
 assert.equal(await User.countDocuments(),count);
 assert.equal((await call('post','/admin/students/import').send({csv:'name,email\n"broken'})).status,400);
 assert.equal((await call('post','/admin/students/import','student').send({csv:valid})).status,403);
 const tooMany='name,email,rollNumber,hostel,room\n'+Array.from({length:51},(_,i)=>'Student '+i+',limit'+i+'@sst.scaler.com,S'+i+',H,A').join('\n');
 assert.equal((await call('post','/admin/students/import').send({csv:tooMany})).status,400);
});
test('domain is configurable and enabling email alone never authorizes delivery',async()=>{
 const other=createApp({...settings,allowedStudentEmailDomain:'college.example'});errors(other);
 const r=await request(other).post('/api/admin/students').set('Authorization','Bearer '+tokens.admin).send(input('<script>unsafe()</script>','configured@college.example'));
 assert.equal(r.status,201);
 const user=await User.findById(r.body.student.id);user.accessTokenExpires=new Date(Date.now()+60000);
 const preview=await deliverInvitation(user,randomBytes(32).toString('base64url'),'activation',{...settings,emailDeliveryEnabled:true,authorizedRecipients:[],smtp:{host:'127.0.0.1',port:1},mailFrom:'no-reply@college.example'});
 assert.equal(preview.status,'preview');
 const saved=await MailPreview.findById(preview._id).select('+encrypted');
 const mail=unseal(saved.encrypted,settings.secret);assert.ok(!mail.html.includes('<script>'));assert.ok(mail.html.includes('&lt;script&gt;'));
});
test('password recovery is rate limited without revealing account existence',async()=>{
 let last;
 for(let i=0;i<4;i++)last=await request(app).post('/api/auth/forgot-password').send({email:'missing'+i+'@sst.scaler.com'});
 assert.equal(last.status,429);
});

test('legacy accounts without new fields can change passwords and persisted activation survives reconnect',async()=>{
 const email='legacy@test.example',pw=randomBytes(18).toString('hex');
 const legacy=await User.create({name:'Legacy Fictional',email,role:'student',password:await bcrypt.hash(pw,4)});
 await User.collection.updateOne({_id:legacy._id},{$unset:{tokenVersion:1,requiresPasswordChange:1}});
 const signed=await login(email,pw);assert.equal(signed.status,200);assert.equal(signed.body.user.requiresPasswordChange,false);
 const updated=await request(app).post('/api/auth/change-password').set('Authorization','Bearer '+signed.body.token).send({currentPassword:pw,password:randomBytes(18).toString('hex')});
 assert.equal(updated.status,200);
 await mongoose.disconnect();await mongoose.connect(mongo.getUri());
 const active=await User.findOne({email:'activation@sst.scaler.com'}).select('+password');
 assert.equal(active.requiresPasswordChange,false);assert.equal(active.invitationStatus,'activated');assert.ok(active.activatedAt);
 assert.ok(await bcrypt.compare(password,active.password));
});
test('login attempts are rate limited with a clear JSON error',async()=>{
 let result;
 for(let i=0;i<31;i++)result=await request(app).post('/api/auth/login').send({email:'unknown@test.example',password:'incorrect'});
 assert.equal(result.status,429);assert.match(result.body.message,/login attempts/i);
});
