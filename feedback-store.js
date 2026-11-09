// Один запрос на отзыв; потерянный ответ повторяется с прежним request_id.
export class FeedbackStore {
 constructor({send, storage, pendingStorage, uuid = () => crypto.randomUUID()}) {
  this.send=send; this.storage=storage; this.pendingStorage=pendingStorage; this.uuid=uuid; this.running=new Map();
 }
 async save(key, fields, revision) {
  if(this.running.has(key)) return this.running.get(key);
  const task=this.commit(key,fields,revision).finally(()=>this.running.delete(key));
  this.running.set(key,task);return task;
 }
 async commit(key, fields, revision) {
  const pendingKey=key+':pending';
  const pending=await this.pendingStorage?.read(pendingKey).catch(()=>null) ?? JSON.parse(this.storage.getItem(pendingKey)||'null');
  const clear=async payload=>{
   if(payload.p_images)await this.pendingStorage?.remove(pendingKey);
   this.storage.removeItem(pendingKey);
  };
  const send=async payload=>{
   if(payload.p_images && this.pendingStorage)await this.pendingStorage.write(pendingKey,payload);
   else this.storage.setItem(pendingKey,JSON.stringify(payload));
   try {const result=await this.send(payload);await clear(payload);return result;}
   catch(error){if(['40001','22023','22P02','23505'].includes(error.code))await clear(payload);throw error;}
  };
  if(pending){
   const result=await send(pending);
   const comparable=(payload,key)=>key==='p_images'?payload[key]?.map(image=>image.id):payload[key];
   if(Object.keys(fields).every(key=>JSON.stringify(comparable(fields,key))===JSON.stringify(comparable(pending,key))))return result;
   if(fields.p_images&&pending.p_images){
    const savedIds=new Set(pending.p_images.map(image=>image.id));
    fields={...fields,p_images:fields.p_images.map(image=>savedIds.has(image.id)?{id:image.id}:image)};
   }
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
