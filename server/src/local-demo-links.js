import fs from 'node:fs';
import mongoose from 'mongoose';
import {config} from './config.js';
import {User,MailPreview} from './models.js';
import {sendLink} from './onboarding.js';
import {unseal} from './mail.js';
const settings=config();
if(settings.databaseMode!=='local')throw Error('Local mode required');
try{
 await mongoose.connect(settings.uri,{serverSelectionTimeoutMS:5000});
 const links=[];
 for(const role of ['student','warden','guard','admin']){
 const user=await User.findOne({email:role+'@outpass.demo',role});if(!user)continue;
 const p=await sendLink(user,user.requiresPasswordChange?'activation':'reset',{...settings,emailDeliveryEnabled:false});
 const saved=await MailPreview.findById(p._id).select('+encrypted');
 const link=unseal(saved.encrypted,settings.secret).text.match(/https?:\/\/\S+\/activate#token=[A-Za-z0-9_-]+/)?.[0];
 if(link)links.push('<li><a href="'+link+'">Set '+role+' password</a> ('+role+'@outpass.demo)</li>');
 }
 fs.writeFileSync(new URL('../.env.local-demo.html',import.meta.url),'<!doctype html><html><title>Private local OutPass setup</title><h1>Local fictional demo accounts</h1><p>Private single-use password setup links; reset links expire in 30 minutes. No email was sent.</p><ul>'+links.join('')+'</ul></html>',{mode:0o600});
 console.log('Private links renewed in server/.env.local-demo.html. Existing passwords unchanged until a link is consumed.');
}catch{console.error('Local link preparation failed. No credentials logged.');process.exitCode=1;}finally{await mongoose.disconnect();}
