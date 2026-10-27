import React,{useContext,useEffect,useState,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {GraduationCap,ShieldCheck,ScanLine,Users,ArrowRight} from 'lucide-react';
import {api} from './api';
import {Auth} from './auth-context';
export const demoCards=[{role:'student',title:'Student',detail:'Follow your leave request and view its QR pass.',icon:GraduationCap},{role:'warden',title:'Warden',detail:'Review and approve the same fictional request.',icon:ShieldCheck},{role:'guard',title:'Guard',detail:'Verify the QR pass, check out and record return.',icon:ScanLine},{role:'admin',title:'Admin',detail:'Explore fictional student accounts in a read-only view.',icon:Users}];
export const requestDemoRole=(role,token)=>api('/auth/demo',{token,method:'POST',body:JSON.stringify({role})});
export function DemoRoleCards({onChoose,busy}){return <div className="demo-role-grid">{demoCards.map(({role,title,detail,icon:Icon})=><button key={role} type="button" className="demo-role-card" disabled={Boolean(busy)} onClick={()=>onChoose(role)} aria-label={'Explore '+title+' demo'}><Icon size={23}/><strong>{title}</strong><span>{detail}</span><small>{busy===role?'Opening dashboard...':'Explore dashboard'} <ArrowRight size={13}/></small></button>)}</div>;}
export function ExploreDemo({switcher=false,onPrepared}){
 const {user,token,login}=useContext(Auth),navigate=useNavigate();
 const [enabled,setEnabled]=useState(switcher),[open,setOpen]=useState(!switcher),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [capacity,setCapacity]=useState(''),prepared=useRef(onPrepared);prepared.current=onPrepared;
 useEffect(()=>{if(!switcher)api('/demo/info').then(r=>setEnabled(r.enabled)).catch(()=>setEnabled(false));},[switcher]);
 useEffect(()=>{
 if(!switcher)return;let active=true;
 async function prepare(){
 setCapacity('');
 if(user?.role==='student')try{const r=await api('/demo/request',{token,method:'POST'});if(active&&r.created)prepared.current?.();}catch(e){if(active)setError(e.message);}
 try{const r=await api('/demo/status',{token});if(active)setCapacity(r.message||'');}catch(e){if(active)setError(e.message);}
 }
 prepare();return()=>{active=false;};
 },[switcher,token,user?.role]);
 async function choose(role){setBusy(role);setError('');try{login(await requestDemoRole(role,user?.isDemo?token:undefined));setOpen(!switcher);navigate('/',{replace:true});}catch(e){setError(e.message);}finally{setBusy('');}}
 if(!enabled)return null;
 return <section className={switcher?'demo-switcher':'explore-demo'} aria-label={switcher?'Switch Demo Role':'Explore Demo'}>{switcher?<div className="demo-banner"><span><strong>Professor demo</strong> · Fictional data only · {user.role}</span><button className="secondary" onClick={()=>setOpen(!open)}>Switch Demo Role</button></div>:<><span className="eyebrow">TRY OUTPASS</span><h2>Explore Demo</h2><p className="muted small">No password needed. Explore Student → Warden → Guard using the same fictional request.</p></>}{capacity&&<div className="alert" role="status">{capacity}</div>}{error&&error!==capacity&&<div className="alert" role="alert">{error}</div>}{open&&<DemoRoleCards busy={busy} onChoose={choose}/>}</section>;
}
export function DemoAdmin(){
 const {token}=useContext(Auth),[students,setStudents]=useState([]),[error,setError]=useState('');
 useEffect(()=>{api('/admin/students',{token}).then(r=>setStudents(r.students)).catch(e=>setError(e.message));},[token]);
 return <><div className="page-heading"><div><span className="eyebrow">ADMIN DEMO</span><h1>A clear view of fictional student accounts.</h1><p className="muted">Read-only access. Account provisioning, invitations and security changes are disabled.</p></div></div>{error&&<div className="alert" role="alert">{error}</div>}<section className="panel"><div className="section-head"><h2>Fictional students</h2><ShieldCheck/></div><div className="table-scroll"><table><thead><tr><th>Student</th><th>Student ID</th><th>Status</th></tr></thead><tbody>{students.map(s=><tr key={s.id}><td><strong>{s.name}</strong><small>{s.email}</small></td><td>{s.rollNumber}</td><td><span className="badge approved">Activated demo</span></td></tr>)}</tbody></table></div></section></>;
}
