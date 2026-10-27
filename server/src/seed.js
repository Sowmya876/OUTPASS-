import fs from 'node:fs';
import path from 'node:path';
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
try {
 await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:10000});
 for(const [role,name] of [['student','Ananya Rao'],['warden','Meera Iyer'],['guard','Ravi Kumar']]){
 const email=role+'@outpass.demo';
 if(await User.exists({email})){console.log(role+' demo account already exists; unchanged');continue;}
 const user=await User.create({name,email,role,password:await bcrypt.hash(randomBytes(32).toString('base64url'),12),requiresPasswordChange:true,invitationStatus:'pending',...(role==='student'?{rollNumber:'CSE2026042',hostel:'Maple Hostel',room:'B-204'}:{})});
 const preview=await sendLink(user,'activation',{...settings,emailDeliveryEnabled:false});
 const stored=await MailPreview.findById(preview._id).select('+encrypted');
 const mail=unseal(stored.encrypted,settings.secret);
 const folder=process.env.SEED_PREVIEW_DIR||new URL('../',import.meta.url);
 const file=folder instanceof URL?new URL('.env.'+role+'-activation.html',folder):path.join(folder,'.env.'+role+'-activation.html');
 fs.writeFileSync(file,mail.html,{mode:0o600});
 console.log(role+' demo account created; private activation preview saved locally. No password stored or logged.');
 }
} catch {console.error('Seed failed. Check MongoDB configuration.');process.exitCode=1;}
finally {await mongoose.disconnect();}
