// Explicit persistent Community Server, not mongodb-memory-server.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import net from 'node:net';
const root=fileURLToPath(new URL('../../',import.meta.url));
const folder=path.join(root,'.local-mongodb'),privateFile=new URL('../.env.local-mongodb',import.meta.url);
const cached=path.join(root,'node_modules/.cache/mongodb-memory-server/mongod-x64-win32-7.0.24.exe');
const binary=process.env.MONGOD_PATH||cached;
if(!fs.existsSync(binary))throw Error('Set MONGOD_PATH to the installed MongoDB Community mongod.exe. See LOCAL_DEMO.md for Windows installation.');
fs.mkdirSync(path.join(folder,'data'),{recursive:true});
let values=fs.existsSync(privateFile)?dotenv.parse(fs.readFileSync(privateFile)):null;
if(!values){
 const password=randomBytes(32).toString('base64url');
 values={LOCAL_MONGODB_URI:'mongodb://outpass_local:'+password+'@127.0.0.1:27017/outpass_local_demo?authSource=admin'};
 fs.writeFileSync(privateFile,'LOCAL_MONGODB_URI='+values.LOCAL_MONGODB_URI+'\n',{mode:0o600,flag:'wx'});
}
if(!values.LOCAL_MONGODB_SETUP_URI){
 values.LOCAL_MONGODB_SETUP_URI='mongodb://outpass_local_setup:'+randomBytes(32).toString('base64url')+'@127.0.0.1:27017/admin';
 fs.writeFileSync(privateFile,Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600});
}
const {MongoClient}=mongoose.mongo;
async function ping(){const client=new MongoClient(values.LOCAL_MONGODB_URI,{serverSelectionTimeoutMS:700});try{await client.connect();await client.db().command({ping:1});return true;}catch{return false;}finally{await client.close();}}
if(await ping()){console.log('Authenticated local MongoDB is already running.');process.exit(0);}
const occupied=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:27017});socket.setTimeout(700);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});
if(occupied)throw Error('Port 27017 is already occupied by a server that does not accept the saved local credentials. No existing server was modified.');
const child=spawn(binary,['--dbpath',path.join(folder,'data'),'--bind_ip','127.0.0.1','--port','27017','--auth','--logpath',path.join(folder,'mongod.log'),'--logappend'],{stdio:'ignore',windowsHide:true});
let exited=false;child.on('exit',code=>{exited=true;console.log('Local MongoDB stopped. Persistent data retained.');process.exitCode=process.exitCode||code||0;});
child.on('error',()=>{exited=true;console.error('Cannot start mongod. Check MONGOD_PATH and LOCAL_DEMO.md.');process.exitCode=1;});
let ready=false;
for(let attempt=0;attempt<25&&!exited;attempt++){
 if(await ping()){ready=true;break;}
 // MongoDB's localhost exception permits creating the first user only on an
 // empty authenticated server. Existing users/data are never reset or deleted.
 const bootstrap=new MongoClient('mongodb://127.0.0.1:27017/admin',{serverSelectionTimeoutMS:700});
 try{await bootstrap.connect();const uri=new URL(values.LOCAL_MONGODB_SETUP_URI);await bootstrap.db('admin').command({createUser:decodeURIComponent(uri.username),pwd:decodeURIComponent(uri.password),roles:[{role:'userAdminAnyDatabase',db:'admin'}]});}catch{}finally{await bootstrap.close();}
 const setup=new MongoClient(values.LOCAL_MONGODB_SETUP_URI,{serverSelectionTimeoutMS:700});
 try{await setup.connect();const uri=new URL(values.LOCAL_MONGODB_URI);await setup.db('admin').command({createUser:decodeURIComponent(uri.username),pwd:decodeURIComponent(uri.password),roles:[{role:'readWrite',db:'outpass_local_demo'}]});}catch{}finally{await setup.close();}
 await delay(400);
}
if(!ready){console.error('Local MongoDB was not ready. Inspect .local-mongodb/mongod.log; no Atlas fallback was attempted.');child.kill();process.exitCode=1;}
else console.log('Persistent authenticated MongoDB ready on 127.0.0.1:27017. Data: .local-mongodb/data. Keep this process running.');
