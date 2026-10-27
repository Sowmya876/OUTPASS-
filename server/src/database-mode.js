import fs from 'node:fs';
const mode=process.argv[2];
if(!['local','atlas'].includes(mode))throw Error('Choose local or atlas');
if(mode==='local'&&!fs.existsSync(new URL('../.env.local-mongodb',import.meta.url)))throw Error('Run npm run db:local first');
fs.writeFileSync(new URL('../.env.database-mode',import.meta.url),'DATABASE_MODE='+mode+'\n',{mode:0o600});
console.log('Selected '+mode+' database mode. Restart the backend. Atlas URI and JWT secret were not changed.');
