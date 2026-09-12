import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ku-fudo-chat');const modules=process.argv[2];if(!modules)throw Error('Pass the PHP WASM node_modules path');
const {PHP}=await import(pathToFileURL(modules+'/@php-wasm/universal/index.js'));const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(modules+'/@php-wasm/node/index.js'));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));const temp=fs.mkdtempSync(path.join(os.tmpdir(),'learning-test-'));const web=temp+'/public_html',app=web+'/ku-fudo-chat';fs.mkdirSync(web);fs.cpSync(source,app,{recursive:true});if(process.env.LEARNING_TEST_BOOTSTRAP)fs.copyFileSync(process.env.LEARNING_TEST_BOOTSTRAP,app+'/bootstrap.php');fs.mkdirSync(temp+'/ku-fudo-private');fs.writeFileSync(temp+'/ku-fudo-private/config.php',"<?php return []; ");
fs.writeFileSync(app+'/seed.php',`<?php require __DIR__.'/bootstrap.php'; $id=(int)$_GET['id']; query("INSERT OR IGNORE INTO users(id,login,name,password,role,created_at) VALUES(?,?,?,'unused','member',0)",[$id,'test'.$id.'@example.com','テスト'.$id]);if($id===3){query("UPDATE users SET role='admin' WHERE id=?",[$id]);}if($id===4){query("UPDATE users SET role='candidate' WHERE id=?",[$id]);}if($id===5){query("UPDATE users SET role='director' WHERE id=?",[$id]);}$u=query('SELECT * FROM users WHERE id=?',[$id])->fetch();signIn($u);output(['csrf'=>$_SESSION['csrf']]);`);
const lib=app+'/mail-center-lib.php';fs.writeFileSync(lib,fs.readFileSync(lib,'utf8').replace('function mcTransport(', 'function mcOriginalTransport(')+`\nfunction mcTransport(string $recipient,string $title,string $body):bool {file_put_contents(__DIR__.'/transport.log',json_encode([$recipient,$title,$body])."\\n",FILE_APPEND);return !str_contains($recipient,'test2@');}\n`);
fs.writeFileSync(app+'/inspect.php',`<?php require __DIR__.'/bootstrap.php'; require __DIR__.'/mail-center-lib.php';mcSchema();if(isset($_GET['sql'])){$db->exec($_GET['sql']);} output(['jobs'=>query('SELECT * FROM mail_bulletins')->fetchAll(),'outbox'=>query('SELECT * FROM mail_outbox')->fetchAll(),'messages'=>query('SELECT * FROM messages')->fetchAll()]);`);
await php.mount(temp,createNodeFsMountHandler(temp));const jars={};
async function run(who,file='learning.php',post=null){const jar=jars[who]??={cookie:''};let r=await php.run({scriptPath:app+'/'+file.split('?')[0],relativeUri:'/ku-fudo-chat/'+file,protocol:'https',method:post?'POST':'GET',headers:{Host:'test.invalid',Cookie:jar.cookie,...(post?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:post?new TextEncoder().encode(new URLSearchParams(post).toString()):undefined,$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.1'}});for(const c of r.headers['set-cookie']??[])if(c.startsWith('KU_FUDO_CHAT='))jar.cookie=c.split(';')[0];return r;}

async function inspect(sql=''){return JSON.parse((await run(3,'inspect.php'+(sql?'?sql='+encodeURIComponent(sql):''))).text);}
async function create(who,data){let r=await run(who,'mail-center.php');const nonce=r.text.match(/name="nonce" value="([^"]+)"/)[1];r=await run(who,'mail-center.php',{csrf:jars[who].csrf,action:'create',nonce,...data});return r;}
async function send(who,id,extra={}){let r=await run(who,'mail-center.php?id='+id);const hash=r.text.match(/name="recipients_hash" value="([^"]+)"/);return run(who,'mail-center.php',{csrf:jars[who].csrf,action:'send',id,recipients_hash:hash?.[1]||'',...extra});}
try{
for(const id of [1,2,3,4,5]){let r=await run(id,'seed.php?id='+id);jars[id].csrf=JSON.parse(r.text).csrf;}
let r=await run(1,'mail-center.php');assert.equal(r.httpStatusCode,403);
r=await run(3,'mail-center.php');assert.equal(r.httpStatusCode,200,r.text+r.errors);
const notice={kind:'notice',audience:'all',title:'Zoomテスト',body:'無料です <script>bad</script>',event_at:'2026-10-01T13:00',link:'https://example.com/meeting'};
r=await create(3,notice);assert.equal(r.httpStatusCode,303,r.text+r.errors);assert.equal((await inspect()).outbox.length,0);assert(!fs.existsSync(app+'/transport.log'));
r=await run(3,'mail-center.php?id=1');assert(r.text.includes('&lt;script&gt;'));assert(r.text.includes('5人'));assert(!r.text.includes('test1@example.com'));
r=await send(3,1,{csrf:'wrong'});assert.equal(r.httpStatusCode,403);assert.equal((await inspect()).outbox.length,0);
r=await send(3,1,{recipients_hash:'changed'});assert.equal(r.httpStatusCode,409);
r=await send(3,1);assert.equal(r.httpStatusCode,303,r.text+r.errors);let d=await inspect();assert.equal(d.outbox.length,5);assert.equal(d.outbox.filter(x=>x.status==='failed').length,1);assert.equal(d.messages.length,1);assert.equal(d.messages[0].event_at,notice.event_at);
const lines=()=>fs.readFileSync(app+'/transport.log','utf8').trim().split('\n').length;const n=lines();r=await send(3,1);assert.equal(lines(),n);assert.equal((await inspect()).messages.length,1);
r=await run(3,'mail-center.php',{action:'retry',id:'1',csrf:jars[3].csrf});assert.equal(lines(),n+1);
r=await create(4,notice);assert.equal(r.httpStatusCode,403);
await run(4,'operations.php');r=await run(4,'operations.php',{action:'minutes',csrf:jars[4].csrf,id:'0',revision:'0',title:'限定議事録',meeting_on:'2026-08-23','topics[0][title]':'議題','topics[0][content]':'内部限定',url:''});assert.equal(r.httpStatusCode,303);
r=await create(4,{kind:'minutes',audience:'all',source_id:'1'});assert.equal(r.httpStatusCode,303,r.text+r.errors);d=await inspect();const mid=d.jobs.at(-1).id;
r=await run(1,'mail-center.php?id='+mid);assert.equal(r.httpStatusCode,403);
r=await send(4,mid);assert.equal(r.httpStatusCode,303,r.text+r.errors);d=await inspect();assert.deepEqual(d.outbox.filter(x=>x.bulletin_id===mid).map(x=>x.user_id),[3,4,5]);
r=await create(5,{kind:'minutes',audience:'board',source_id:'1'});assert.equal((await inspect()).jobs.length,2);
await inspect("INSERT INTO notice_editors(user_id,area,enabled) VALUES(2,'福岡',1); INSERT INTO mail_regions(user_id,area) VALUES(1,'福岡'),(2,'福岡');");
r=await create(2,{...notice,audience:'region',area:'東京'});assert.equal(r.httpStatusCode,403);
r=await create(2,{...notice,audience:'region',area:'福岡'});assert.equal(r.httpStatusCode,303);d=await inspect();const rid=d.jobs.at(-1).id;
await inspect('UPDATE notice_editors SET enabled=0 WHERE user_id=2');r=await send(2,rid);assert.equal(r.httpStatusCode,403);await inspect('UPDATE notice_editors SET enabled=1 WHERE user_id=2');
r=await run(2,'mail-center.php?regions=1');assert.equal(r.httpStatusCode,403);
r=await run(1,'mail-center.php?preferences=1',{action:'preference',csrf:jars[1].csrf});assert.equal(r.httpStatusCode,303);
r=await send(2,rid);assert.equal(r.httpStatusCode,303,r.text+r.errors);assert.deepEqual((await inspect()).outbox.filter(x=>x.bulletin_id===rid).map(x=>x.user_id),[2]);
await inspect("INSERT INTO prayer_members(user_id,number,start_month,end_month,enabled) VALUES(1,1,'2026-08','',1),(2,2,'2026-09','',1)");
r=await run(1,'mail-center.php?preferences=1',{action:'preference',csrf:jars[1].csrf,enabled:'1'});assert.equal(r.httpStatusCode,303);
r=await create(3,{kind:'prayer',audience:'all',month:'2026-08',title:'8月の入力案内',body:'よろしくお願いします'});assert.equal(r.httpStatusCode,303,r.text+r.errors);const pid=(await inspect()).jobs.at(-1).id;r=await send(3,pid);assert.equal(r.httpStatusCode,303,r.text+r.errors);assert.deepEqual((await inspect()).outbox.filter(x=>x.bulletin_id===pid).map(x=>x.user_id),[1]);
r=await run(1,'prayer.php');assert(r.text.includes('8月の入力案内'));r=await run(2,'prayer.php');assert(!r.text.includes('8月の入力案内'));
r=await create(3,{...notice,link:'javascript:alert(1)'});assert.equal(r.httpStatusCode,400);
r=await create(3,{...notice,event_at:'2026-02-30T12:00'});assert.equal(r.httpStatusCode,400);

// Multiple batches, recipient changes, opt-out and uncertain deliveries.
for(let i=6;i<=17;i++)await inspect(`INSERT INTO users(id,login,name,password,role,created_at) VALUES(${i},'test${i}@example.com','追加${i}','unused','member',0)`);
r=await create(3,{...notice,title:'大量配信テスト'});const bid=(await inspect()).jobs.at(-1).id;r=await send(3,bid);assert.equal(r.httpStatusCode,303,r.text+r.errors);
d=await inspect();assert.equal(d.outbox.filter(x=>x.bulletin_id===bid&&x.status==='pending').length,7);
await inspect("UPDATE users SET active=0 WHERE id=11; UPDATE users SET login='changed@example.com' WHERE id=12; INSERT INTO mail_preferences(user_id,enabled) VALUES(13,0); UPDATE mail_outbox SET status='sending' WHERE bulletin_id="+bid+" AND user_id=14");
const oldN=lines();r=await run(4,'mail-center.php',{action:'batch',id:String(bid),csrf:jars[4].csrf});assert.equal(r.httpStatusCode,403);assert.equal(lines(),oldN);
r=await run(3,'mail-center.php',{action:'batch',id:String(bid),csrf:jars[3].csrf});assert.equal(r.httpStatusCode,303,r.text+r.errors);d=await inspect();assert.equal(d.outbox.filter(x=>x.bulletin_id===bid&&x.status==='skipped').length,3);assert.equal(d.outbox.find(x=>x.bulletin_id===bid&&x.user_id===14).status,'sending');assert.equal(lines(),oldN+3);
r=await create(3,{...notice,title:'取り下げ後の停止'});const hid=(await inspect()).jobs.at(-1).id;await send(3,hid);d=await inspect();const hidmsg=d.jobs.find(x=>x.id===hid).message_id;await inspect('UPDATE messages SET hidden=1 WHERE id='+hidmsg);const beforeHidden=lines();await run(3,'mail-center.php',{action:'batch',id:String(hid),csrf:jars[3].csrf});assert.equal(lines(),beforeHidden);
console.log('PASS: no send before confirmation; CSRF; recipient changes; individual mail; role and region scoping; revocation; opt-out; prayer month eligibility; duplicate prevention; failures-only retry; escaped preview; URL/date validation; chat schedule publication. All mail used a local stub.');
}finally{php.exit();fs.rmSync(temp,{recursive:true,force:true});}
