export async function pingDatabase(connection){
 const result=await connection.db.command({ping:1});
 if(result.ok!==1)throw Error('Database ping failed');
 const status=await connection.db.admin().command({connectionStatus:1,showPrivileges:false});
 if(status.ok!==1||!status.authInfo?.authenticatedUsers?.length)throw Error('Authenticated database connection required');
}
