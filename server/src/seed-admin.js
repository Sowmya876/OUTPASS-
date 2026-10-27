import fs from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {config} from './config.js';
import {User,MailPreview} from './models.js';
import {sendLink} from './onboarding.js';
import {unseal} from './mail.js';
import {assertNormalSeedTarget} from './seed-safety.js';
const settings=config();
assertNormalSeedTarget(settings);
try{
 await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:10000});
 const email=(process.env.ADMIN_EMAIL||'admin@outpass.demo').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Invalid admin email');
 let admin=await User.findOne({email});
 if(admin&&admin.role!=='admin')throw Error('Email belongs to another role');
 const recovery=process.argv.includes('--recover');
 if(admin&&!admin.requiresPasswordChange&&!recovery){console.log('Admin already active; unchanged. To prepare a private reset preview, run npm run seed:admin -- --recover.');}
 else{
 if(!admin)admin=await User.create({name:'OutPass Administrator',email,role:'admin',password:await bcrypt.hash(randomBytes(32).toString('base64url'),12),requiresPasswordChange:true,invitationStatus:'pending'});
 // Bootstrap is local/test only: never transmit an admin invitation automatically.
 const preview=await sendLink(admin,admin.requiresPasswordChange?'activation':'reset',{...settings,emailDeliveryEnabled:false});
 const stored=await MailPreview.findById(preview._id).select('+encrypted');
 const mail=unseal(stored.encrypted,settings.secret);
 fs.writeFileSync(new URL('../.env.admin-activation.html',import.meta.url),mail.html,{mode:0o600});
 console.log('Private admin activation preview saved to server/.env.admin-activation.html (gitignored). Open locally and follow the activation link. No password was stored or logged.');
 }
}catch{console.error('Admin setup failed. Check configuration and database access.');process.exitCode=1;}
finally{await mongoose.disconnect();}
