// No network/storage: acceptance is atomic and scoped to one identity/filter epoch.
export const sameIds = (a, b) => a.length === b.length && a.every((item, i) => item.id === b[i].id);
export function validItem(item) {
 return item && typeof item.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
  && typeof item.originalText === 'string' && /\S/.test(item.originalText) && item.originalText.length <= 2000 && (item.chineseIntent === null || typeof item.chineseIntent === 'string')
  && typeof item.createdAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.createdAt) && Number.isFinite(Date.parse(item.createdAt)) && new Date(item.createdAt).toISOString() === item.createdAt;
}
export class Pager {
 constructor({limit=20}={}) { if(!Number.isInteger(limit)||limit<1||limit>100) throw Error('Invalid limit'); this.limit=limit; this.epoch=0; this.reset(null,''); }
 reset(owner,q) { this.epoch++; this.owner=owner; this.q=q; this.items=[]; this.pages=[]; this.cursor=null; this.done=false; this.requiresRestart=false; this.active=null; this.error=null; this.seenCursors=new Set(); }
 begin() { if(!this.owner||this.active||this.done||this.requiresRestart) return null; const ticket=Object.freeze({epoch:this.epoch,cursor:this.cursor}); this.active=ticket; this.error=null; return ticket; }
 current(ticket) { return this.active===ticket && ticket.epoch===this.epoch; }
 fail(ticket) { if(!this.current(ticket)) return false; this.active=null; this.error='failed'; return true; }
 invalidate(ticket) { if(!this.current(ticket))return false; this.reset(this.owner,this.q); this.requiresRestart=true; this.error='invalid-cursor'; return true; }
 accept(ticket,result) {
  if(!this.current(ticket)) return false;
  if(!result||!Array.isArray(result.items)||result.limit!==this.limit||typeof result.hasMore!=='boolean'
   ||result.items.length>this.limit||!result.items.every(validItem)
   ||(result.hasMore ? typeof result.nextCursor!=='string'||!result.nextCursor||result.nextCursor.length>2048||this.seenCursors.has(result.nextCursor)||result.items.length!==this.limit : result.nextCursor!==null)) throw Error('Invalid page');
  const ids=new Set(this.items.map(item=>item.id));
  for(const item of result.items) { if(ids.has(item.id)) throw Error('Duplicate ID'); ids.add(item.id); }
  // Mutate only after every field and every ID has passed validation.
  this.items=[...this.items,...result.items]; this.pages=[...this.pages,{count:result.items.length,ids:result.items.map(i=>i.id)}];
  if(result.nextCursor!==null)this.seenCursors.add(result.nextCursor);
  this.cursor=result.nextCursor; this.done=!result.hasMore; this.active=null; this.error=null; return true;
 }
}

// Shared by both page controls. Capture owner/session before issuing the request;
// never publish a response until identity has been rechecked after its arrival.
export async function readForOwner({owner,sessionId,path,request,identify,isCurrent,clearIdentity,accept}) {
 const headers=sessionId?{'X-Expected-Session':sessionId}:{};
 const result=await request(path,{headers});
 if(!isCurrent())return false;
 const confirmedOwner=await identify();
 if(!isCurrent())return false;
 if(confirmedOwner!==owner){clearIdentity();return false;}
 accept(result);return true;
}
