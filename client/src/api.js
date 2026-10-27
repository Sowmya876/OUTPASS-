const base=(import.meta.env.VITE_API_URL||'').replace(/\/+$/,'');
export async function api(path,{token,...options}={}){
 let response;try {response=await fetch(base+'/api'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});}catch {throw new Error('Cannot reach the API. Make sure the backend is running.');}
 let body;
 try {body=await response.json();}catch {
 const error=new Error('The API returned an invalid response. Check the backend connection and API proxy.');
 error.status=response.status;throw error;
 }
 if(!response.ok){const error=new Error(body.message||'Request failed');error.status=response.status;throw error;}
 return body;
}
