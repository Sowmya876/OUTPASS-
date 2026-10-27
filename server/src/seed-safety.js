export function assertNormalSeedTarget(settings){
 let database;try{database=new URL(settings.uri).pathname;}catch{throw Error('Normal seed refused: invalid database configuration');}
 if(settings.demoMode||/^\/outpass_professor_demo(?:_[a-z0-9]+)?$/i.test(database))throw Error('Normal seed refused: Professor Demo Mode and professor-demo databases require their dedicated setup');
}
