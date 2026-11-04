// Один запрос на отзыв; потерянный ответ повторяется с прежним request_id.
export class FeedbackStore {
 constructor({send, storage, uuid = () => crypto.randomUUID()}) {
  this.send=send; this.storage=storage; this.uuid=uuid; this.running=new Map();
 }
 async save(key, fields, revision) {
  if(this.running.has(key)) return this.running.get(key);
  const task=this.commit(key,fields,revision).finally(()=>this.running.delete(key));
  this.running.set(key,task);return task;
 }
 async commit(key, fields, revision) {
  const pendingKey=key+':pending';
  let pending=JSON.parse(this.storage.getItem(pendingKey)||'null');
  const send=async payload=>{
   this.storage.setItem(pendingKey,JSON.stringify(payload));
   try {const result=await this.send(payload);this.storage.removeItem(pendingKey);return result;}
   catch(error){if(error.code==='40001')this.storage.removeItem(pendingKey);throw error;}
  };
  if(pending){
   const result=await send(pending);
   if(Object.keys(fields).every(k=>fields[k]===pending[k]))return result;
   revision=result.revision;
  }
  return send({...fields,p_revision:revision,p_request_id:this.uuid()});
 }
}

export function csvCell(value){
 let text=String(value??'');
 if(/^[\s\uFEFF]*[=+\-@]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
