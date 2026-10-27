import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
if(process.env.NODE_ENV==='production')throw Error('This helper provisions local development only; use deployment environment variables for a hosted demo');
const file=new URL('../.env.professor-demo',import.meta.url);
if(process.argv.includes('--off')){
 if(fs.existsSync(file))fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/^DEMO_MODE=.*$/m,'DEMO_MODE=false'),{mode:0o600});
 console.log('Professor demo disabled. Restart the API to return to the original database.');
}else{
 const local=dotenv.parse(fs.readFileSync(new URL('../.env.local-mongodb',import.meta.url)));
 const setupUri=new URL(local.LOCAL_MONGODB_SETUP_URI);
 if(!['127.0.0.1','localhost','[::1]'].includes(setupUri.hostname))throw Error('Local loopback setup credentials required');
 const existing=fs.existsSync(file)?dotenv.parse(fs.readFileSync(file)):{};
 const client=new mongoose.mongo.MongoClient(local.LOCAL_MONGODB_SETUP_URI,{serverSelectionTimeoutMS:5000});
 try{
 await client.connect();
 let uri=existing.DEMO_MONGODB_URI;
 if(!uri){
 const info=await client.db('admin').command({usersInfo:'outpass_professor'});
 if(info.users.length)throw Error('Dedicated demo database user already exists; restore its private demo configuration before proceeding');
 const password=randomBytes(32).toString('base64url');
 await client.db('admin').command({createUser:'outpass_professor',pwd:password,roles:[{role:'readWrite',db:'outpass_professor_demo'}]});
 const target=new URL(local.LOCAL_MONGODB_URI);target.username='outpass_professor';target.password=password;target.pathname='/outpass_professor_demo';uri=target.toString();
 }
 fs.writeFileSync(file,'DEMO_MODE=true\nAPP_ENV=demo\nDEMO_MONGODB_URI='+uri+'\n',{mode:0o600});
 if(process.platform==='win32'){const account=process.env.USERDOMAIN+'\\'+process.env.USERNAME;execFileSync('icacls.exe',[fileURLToPath(file),'/inheritance:r','/grant:r',account+':(F)'],{stdio:'ignore',windowsHide:true});}
 console.log('Isolated professor demo selected. Dedicated database credentials saved privately; no normal database or secret changed. Restart the backend.');
 }catch{console.error('Professor demo setup failed; no credentials logged.');process.exitCode=1;}finally{await client.close();}
}
