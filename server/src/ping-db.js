import mongoose from 'mongoose';
import {config} from './config.js';
import {pingDatabase} from './database-ping.js';
try{
 const settings=config();
 await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:10000,connectTimeoutMS:5000});
 await pingDatabase(mongoose.connection);
 console.log('MongoDB authenticated connection and ping succeeded. No database records changed.');
}catch{console.error('Database ping failed. Check server environment, Atlas network access, TLS and database-user permissions. No credentials logged.');process.exitCode=1;}
finally{await mongoose.disconnect();}
