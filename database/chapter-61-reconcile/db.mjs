import pg from 'pg';
import { demand, integer, now, safeError } from './lib.mjs';
export function databaseConfig(expected, value) {
  const u=URL.parse(value??'');demand(u&&['postgresql:','postgres:'].includes(u.protocol)&&expected&&decodeURIComponent(u.pathname.slice(1))===expected&&u.hostname);
  return {connectionString:value,connectionTimeoutMillis:5000,query_timeout:16000,application_name:'chapter61-readonly'};
}
export async function scanDatabase(client, expected, pageSize=100, maxPages=10000, maxRows=1000000) {
  integer(pageSize,100,1000);const m={format:'epp-avatar-db/v1',source:null,startedAt:now(),endedAt:null,databaseClock:null,complete:false,terminal:{users:false,attempts:false},pages:{users:[],attempts:[]},users:[],attempts:[],error:null};
  try{
    await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
    const {rows:[identity]}=await client.query('SELECT current_database() AS database, current_user AS role, inet_server_addr()::text AS host, inet_server_port() AS port, clock_timestamp() AS clock');
    demand(identity.database===expected);m.source={host:identity.host??'local-socket',port:identity.port??5432,database:identity.database,role:identity.role};m.databaseClock=new Date(identity.clock).toISOString();
    for(const [kind,table,columns] of [['users','users','id, avatar_id'],['attempts','avatar_writes','id, user_id, state, created_at, check_after']]){
      let after=null;
      for(let n=0;n<maxPages;n++){
        const startedAt=now();const {rows}=await client.query(`SELECT ${columns} FROM public.${table} WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT $2`,[after,pageSize]);
        m[kind].push(...rows);m.pages[kind].push({number:n+1,startedAt,endedAt:now(),count:rows.length,terminal:rows.length<pageSize});
        if(m.users.length+m.attempts.length>maxRows)throw {code:'ROW_LIMIT'};
        if(rows.length<pageSize){m.terminal[kind]=true;break;}
        after=rows.at(-1).id;
      }
      if(!m.terminal[kind])throw {code:'PAGE_LIMIT'};
    }
    await client.query('COMMIT');m.complete=true;
  }catch(e){m.error=safeError(e);try{await client.query('ROLLBACK');}catch{ /* connection may never have opened */ }}
  finally{try{await client.end();}catch{}m.endedAt=now();}
  return m;
}
export const createDatabaseClient=config=>new pg.Client(config);
