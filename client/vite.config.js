import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {validateHostedApiOrigin} from './deployment-config.js';
const config=defineConfig({plugins:[react(),tailwindcss()],server:{fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/DEMO_LOGIN_CREDENTIALS.txt']},proxy:{'/api':'http://127.0.0.1:5000'}}});
export default {
 ...config,
 plugins:[...config.plugins,{name:'verify-vercel-api-origin',configResolved(resolved){
 if(process.env.VERCEL==='1'&&resolved.command==='build')validateHostedApiOrigin(loadEnv(resolved.mode,resolved.envDir,'VITE_').VITE_API_URL);
 }}]
};
