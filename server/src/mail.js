import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import nodemailer from 'nodemailer';
import {MailPreview} from './models.js';
const key=secret=>createHash('sha256').update('outpass-mail-preview:'+secret).digest();
export function seal(value,secret){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64')).join('.');
}
export function unseal(value,secret){
 const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64'));
 const decipher=createDecipheriv('aes-256-gcm',key(secret),iv);decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invitationTemplate(user,link,kind,support){
 const action=kind==='activation'?'Activate your OutPass account':'Reset your OutPass password';
 const intro=kind==='activation'?'Your college administrator has invited you to OutPass, the campus platform for leave requests, approvals and safe gate movement.':'A password reset was requested for your OutPass account.';
 const text='OutPass\n\nHello '+user.name+',\n\n'+intro+'\n\n'+action+': '+link+'\n\nChoose your own password using this single-use link. '+(kind==='activation'?'It expires in 24 hours. You must set a password before accessing leave requests.':'It expires in 30 minutes. If you did not request this, ignore this email.')+'\n\nAfter setting your password, sign in with your college email. Never share this link.\nSupport: '+support;
 const html='<div style="font-family:system-ui;max-width:560px;margin:auto;color:#24362f;padding:32px"><h1 style="color:#204d3d">OutPass</h1><p>Hello '+escape(user.name)+',</p><p>'+escape(intro)+'</p><p><a style="background:#204d3d;color:white;padding:12px 20px;display:inline-block;border-radius:6px" href="'+escape(link)+'">'+escape(action)+'</a></p><p>Choose your own password. This single-use link expires '+(kind==='activation'?'in 24 hours. You must set your password before accessing leave requests.':'in 30 minutes. Ignore this email if you did not request a reset.')+'</p><p>After setting your password, sign in with your college email. Keep this link private.</p><p>Support: '+escape(support)+'</p></div>';
 return {to:user.email,subject:action,text,html};
}
export async function deliverInvitation(user,token,kind,settings){
 const origin=(settings.origin||'http://localhost:5173').replace(/\/$/,'');
 const link=origin+'/activate#token='+encodeURIComponent(token);
 const mail=invitationTemplate(user,link,kind,settings.supportEmail||'support@your-college.example');
 // Preview content includes a bearer link: encrypt it at rest, never log it.
 const preview=await MailPreview.create({user:user._id,kind,status:'preview',expiresAt:user.accessTokenExpires,encrypted:seal(mail,settings.secret)});
 const allow=(settings.authorizedRecipients||[]).map(x=>x.toLowerCase());
 if(settings.emailDeliveryEnabled===true&&allow.includes(user.email.toLowerCase())){
 try{
 if(!settings.smtp?.host||!settings.mailFrom)throw new Error('SMTP configuration missing');
 const transporter=nodemailer.createTransport({...settings.smtp,logger:false,debug:false});
 await transporter.sendMail({from:settings.mailFrom,...mail});
 preview.status='sent';
 }catch{preview.status='failed';}
 await preview.save();
 }
 return preview;
}
