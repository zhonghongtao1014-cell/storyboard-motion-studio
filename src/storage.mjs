let connection;
function db(){
  if(!connection)connection=new Promise((resolve,reject)=>{const r=indexedDB.open('storyboard-motion-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  return connection;
}
export async function readDraft(){const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction('projects').objectStore('projects').get('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function saveDraft(project){const database=await db();return new Promise((resolve,reject)=>{const t=database.transaction('projects','readwrite');t.objectStore('projects').put(project,'draft');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}
