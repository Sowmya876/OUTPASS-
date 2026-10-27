import mongoose from 'mongoose';
import {config} from './config.js';
import {createApp,errors} from './app.js';
import {setTimeout as delay} from 'node:timers/promises';
import {prepareProfessorDemo} from './professor-demo.js';
import {pingDatabase} from './database-ping.js';
const settings=config();
console.log('Database mode: '+settings.databaseMode+(settings.databaseMode==='local'?' (development/demo only)':''));
const app=createApp(settings);errors(app);
const server=app.listen(settings.port,'0.0.0.0',()=>console.log('OutPass API listening on port '+settings.port+'; /api/health reports database readiness'));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
 stopping=true;
 server.close(async()=>{await mongoose.disconnect();process.exit(0);});
});
server.on('error',()=>{console.error('API listener failed. Check whether PORT is already in use.');process.exit(1);});
// Keep the HTTP service available during an initial Atlas outage, but deny DB-backed
// requests until connected. Mongoose handles reconnection after initial success.
while(!stopping){
 try{
 await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:10000,connectTimeoutMS:5000});
 await pingDatabase(mongoose.connection);
 console.log('MongoDB authenticated connection and ping succeeded');
 if(settings.demoMode)await prepareProfessorDemo(settings);
 app.locals.demoReady=true;
 console.log('MongoDB connected; OutPass is ready');
 break;
 }catch(error){
 const tlsFailure=[...(error.reason?.servers?.values?.()||[])].some(s=>s.error?.cause?.code==='ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR');
 console.error(tlsFailure?'Atlas TLS handshake rejected. Check Atlas Network Access for the current public IP and network TLS policy. Retrying in 5 seconds.':'MongoDB connection unavailable. Check database access and DNS. Retrying in 5 seconds.');
 if(!stopping)await delay(5000);
 }
}
