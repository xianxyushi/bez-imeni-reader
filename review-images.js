const formats = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const imageLimit = 3;
const byteLimit = 750 * 1024;
let database;

function openDatabase() {
 if (!database) database = new Promise((resolve, reject) => {
  const request = indexedDB.open('bez-imeni-feedback', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
 }).catch(error => { database = null; throw error; });
 return database;
}

async function draftOperation(mode, operation) {
 const db = await openDatabase();
 return new Promise((resolve, reject) => {
  const transaction = db.transaction('drafts', mode);
  const request = operation(transaction.objectStore('drafts'));
  transaction.oncomplete = () => resolve(request.result);
  transaction.onabort = () => reject(transaction.error);
 });
}

export const imageDrafts = {
 read: key => draftOperation('readonly', store => store.get(key)),
 write: (key, value) => draftOperation('readwrite', store => store.put(value, key)),
 remove: key => draftOperation('readwrite', store => store.delete(key)),
};

export function imageSource(image) {
 if (!formats.has(image.mime) || !image.data) throw Error('Изображение недоступно.');
 return 'data:' + image.mime + ';base64,' + image.data;
}

export function imageFields(images) {
 return images.map(image => image.saved ? {id: image.id} : {id: image.id, mime: image.mime, data: image.data});
}

function asDataUrl(blob) {
 return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
 });
}

export async function prepareImage(file) {
 if (!formats.has(file.type)) throw Error('Выбери файл JPEG, PNG или WebP.');
 if (file.size > 25 * 1024 * 1024) throw Error('Исходное изображение должно быть меньше 25 МБ.');
 const url = URL.createObjectURL(file);
 try {
  const source = new Image();
  source.src = url;
  await source.decode();
  const longest = Math.max(source.naturalWidth, source.naturalHeight);
  if (!longest) throw Error('У изображения нулевой размер.');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let scale = Math.min(1, 1600 / longest);
  for (let attempt = 0; attempt < 6; attempt++) {
   canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
   canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
   ctx.fillStyle = '#fff';
   ctx.fillRect(0, 0, canvas.width, canvas.height);
   ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
   const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9 - attempt * 0.08));
   if (blob?.size <= byteLimit) {
    const dataUrl = await asDataUrl(blob);
    return {id: crypto.randomUUID(), mime: blob.type, data: dataUrl.split(',')[1]};
   }
   scale *= 0.8;
  }
  throw Error('Не удалось уменьшить изображение. Выбери файл поменьше.');
 } finally {
  URL.revokeObjectURL(url);
 }
}
