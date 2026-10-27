import mongoose from 'mongoose';
const {Schema}=mongoose;
const userSchema=new Schema({
 name:{type:String,required:true},email:{type:String,required:true,unique:true,lowercase:true},
 password:{type:String,required:true,select:false},role:{type:String,enum:['student','warden','guard','admin'],required:true},
 rollNumber:String,hostel:String,room:String,isDemo:{type:Boolean,default:false,index:true},
 requiresPasswordChange:{type:Boolean,default:false},tokenVersion:{type:Number,default:0},
 invitationStatus:{type:String,enum:['not_required','pending','preview','sent','failed','activated'],default:'not_required'},
 invitedAt:Date,activatedAt:Date,
 accessTokenHash:{type:String,select:false,index:true,sparse:true,unique:true},accessTokenExpires:Date,accessTokenKind:{type:String,enum:['activation','reset'],select:false}
},{timestamps:true});
export const User=mongoose.model('User',userSchema);
const leaveSchema=new Schema({
 student:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
 destination:{type:String,required:true,maxlength:160},reason:{type:String,required:true,maxlength:1000},isDemo:{type:Boolean,default:false,index:true},
 departure:{type:Date,required:true},returnBy:{type:Date,required:true},
 status:{type:String,enum:['pending','approved','rejected','checked_out','returned'],default:'pending',index:true},demoActiveKey:{type:String,unique:true,sparse:true,select:false},demoQuotaSlot:{type:Number,min:0,max:199,unique:true,sparse:true,select:false},
 decisionNote:{type:String,default:''},decidedBy:{type:Schema.Types.ObjectId,ref:'User'},decidedAt:Date,
 passToken:{type:String,select:false},passHash:{type:String,select:false,index:true,sparse:true,unique:true},
 checkedOutAt:Date,returnedAt:Date,checkoutGuard:{type:Schema.Types.ObjectId,ref:'User'},returnGuard:{type:Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
export const Leave=mongoose.model('Leave',leaveSchema);

const mailSchema=new Schema({user:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},kind:{type:String,enum:['activation','reset'],required:true},status:{type:String,enum:['preview','sent','failed'],required:true},expiresAt:{type:Date,required:true,index:{expires:0}},encrypted:{type:String,select:false,required:true}},{timestamps:true});
export const MailPreview=mongoose.model('MailPreview',mailSchema);
export const DemoSession=mongoose.model('DemoSession',new Schema({user:{type:Schema.Types.ObjectId,ref:'User',required:true},version:{type:Number,default:0},expiresAt:{type:Date,required:true,index:{expires:0}}}));
