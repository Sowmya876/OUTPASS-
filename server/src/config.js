import dotenv from 'dotenv';
import dns from 'node:dns';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
if(process.env.NODE_ENV!=='production')dotenv.config({path:fileURLToPath(new URL('../.env', import.meta.url)),quiet:true});
const readLocal=name=>{if(process.env.NODE_ENV==='production')return {};const path=new URL('../'+name,import.meta.url);return fs.existsSync(path)?dotenv.parse(fs.readFileSync(path)):{};};
export function config() {
 const { MONGODB_URI, JWT_SECRET }=process.env;
 const demoLocal=readLocal('.env.professor-demo');
 const demoMode=(process.env.DEMO_MODE||demoLocal.DEMO_MODE)==='true';
 const deploymentEnvironment=process.env.APP_ENV||demoLocal.APP_ENV;
 const databaseMode=process.env.DATABASE_MODE||readLocal('.env.database-mode').DATABASE_MODE||'atlas';
 if(!['atlas','local'].includes(databaseMode))throw new Error('DATABASE_MODE must be atlas or local');
 if(databaseMode==='local'&&process.env.NODE_ENV==='production')throw new Error('Local database mode is for development/demo only');
 const localUri=databaseMode==='local'?(process.env.LOCAL_MONGODB_URI||readLocal('.env.local-mongodb').LOCAL_MONGODB_URI):undefined;
 if(databaseMode==='local'){
 let local;try{local=new URL(localUri);}catch{throw new Error('Run npm run db:local to prepare local MongoDB');}
 if(local.protocol!=='mongodb:'||!['127.0.0.1','localhost','[::1]'].includes(local.hostname))throw new Error('Local MongoDB must use a loopback mongodb:// address');
 }
 const resolvers=(process.env.MONGODB_DNS_SERVERS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(resolvers.some(ip=>!isIP(ip))) throw new Error('MONGODB_DNS_SERVERS must contain comma-separated DNS server IP addresses');
 if(resolvers.length) dns.setServers(resolvers);
 if(!demoMode&&databaseMode==='atlas'&&!MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env');
 const trustProxyHops=Number(process.env.TRUST_PROXY_HOPS||0);
 if(!Number.isInteger(trustProxyHops)||trustProxyHops<0||trustProxyHops>2)throw new Error('TRUST_PROXY_HOPS must be 0, 1 or 2 for the actual hosting proxy topology');
 if(!JWT_SECRET || JWT_SECRET.length<32 || JWT_SECRET.startsWith('replace-')) throw new Error('Set a random JWT_SECRET of at least 32 characters in server/.env');
 const origin=process.env.CLIENT_ORIGIN||'http://localhost:5173';
 if(process.env.NODE_ENV==='production'){
 let parsed;try{parsed=new URL(origin);}catch{throw new Error('CLIENT_ORIGIN must be the exact HTTPS frontend origin');}
 if(parsed.protocol!=='https:'||parsed.origin!==origin)throw new Error('CLIENT_ORIGIN must be the exact HTTPS frontend origin without a trailing slash or path');
 }
 const port=process.env.PORT?Number(process.env.PORT):5000;
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid TCP port');
 const productionUri=databaseMode==='local'?localUri:MONGODB_URI;
 const demoUri=process.env.DEMO_MONGODB_URI||demoLocal.DEMO_MONGODB_URI;
 if(demoMode&&!demoUri)throw new Error('Set a dedicated DEMO_MONGODB_URI');
 return {uri:demoMode?demoUri:productionUri,productionUri,demoMode,deploymentEnvironment,trustProxyHops,databaseMode,secret:JWT_SECRET,port,origin,
 allowedStudentEmailDomain:process.env.ALLOWED_STUDENT_EMAIL_DOMAIN||'sst.scaler.com',
 emailDeliveryEnabled:!demoMode&&process.env.EMAIL_DELIVERY_ENABLED==='true',
 authorizedRecipients:(process.env.EMAIL_AUTHORIZED_RECIPIENTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),
 supportEmail:process.env.SUPPORT_EMAIL||'support@your-college.example',mailFrom:process.env.MAIL_FROM,
 smtp:{host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||587,secure:process.env.SMTP_SECURE==='true',requireTLS:true,connectionTimeout:10000,socketTimeout:15000,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}};
}
