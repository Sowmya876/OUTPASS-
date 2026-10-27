export function validateHostedApiOrigin(value){
 let url;try{url=new URL(value);}catch{throw Error('Set VITE_API_URL to the deployed HTTPS Render origin before building on Vercel');}
 if(url.protocol!=='https:'||url.origin!==value||['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.localhost'))throw Error('VITE_API_URL must be a public HTTPS API origin without credentials, a path or trailing slash');
 return value;
}
