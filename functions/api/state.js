// Cloudflare Pages Function. Binding D1 named DB (configure in Cloudflare dashboard).
const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
async function ensure(db){await db.prepare('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();await db.prepare("INSERT OR IGNORE INTO app_state(id,revision,payload,updated_at) VALUES(1,0,'{\"beneficiaries\":[],\"requests\":[]}',CURRENT_TIMESTAMP)").run();}
export async function onRequest(context){
 const db=context.env.DB;
 if(!db)return reply({ok:false,error:'Chưa cấu hình D1 binding tên DB trong Pages Settings > Bindings.'},503);
 try {
  await ensure(db);
  if(context.request.method==='GET'){
   const record=await db.prepare('SELECT revision,payload,updated_at FROM app_state WHERE id=1').first();
   return reply({ok:true,revision:record.revision,updated_at:record.updated_at,data:JSON.parse(record.payload)});
  }
  if(context.request.method!=='PUT')return reply({ok:false,error:'Method not allowed'},405);
  const raw=await context.request.text();
  if(raw.length>1500000)return reply({ok:false,error:'Dữ liệu vượt giới hạn 1.5 MB'},413);
  let body;try{body=JSON.parse(raw)}catch{return reply({ok:false,error:'JSON không hợp lệ'},400)}
  const data=body?.data;
  if(!Number.isSafeInteger(body?.revision)||body.revision<0||!data||!Array.isArray(data.requests)||!Array.isArray(data.beneficiaries))return reply({ok:false,error:'Sai cấu trúc dữ liệu'},400);
  const current=await db.prepare('UPDATE app_state SET payload=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(data),body.revision).run();
  if(current.meta.changes!==1)return reply({ok:false,error:'Dữ liệu đã được thay đổi trên phiên khác. Tải lại trước khi sửa.'},409);
  return reply({ok:true,revision:body.revision+1});
 }catch(e){return reply({ok:false,error:'D1: '+String(e.message||e)},500)}
}
