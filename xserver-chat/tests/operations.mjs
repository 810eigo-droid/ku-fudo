import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ku-fudo-chat');const modules=process.argv[2];if(!modules)throw Error('Pass the PHP WASM node_modules path');
const {PHP}=await import(pathToFileURL(modules+'/@php-wasm/universal/index.js'));const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(modules+'/@php-wasm/node/index.js'));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));const temp=fs.mkdtempSync(path.join(os.tmpdir(),'learning-test-'));const web=temp+'/public_html',app=web+'/ku-fudo-chat';fs.mkdirSync(web);fs.cpSync(source,app,{recursive:true});if(process.env.LEARNING_TEST_BOOTSTRAP)fs.copyFileSync(process.env.LEARNING_TEST_BOOTSTRAP,app+'/bootstrap.php');fs.mkdirSync(temp+'/ku-fudo-private');fs.writeFileSync(temp+'/ku-fudo-private/config.php',"<?php return []; ");
fs.writeFileSync(app+'/seed.php',`<?php require __DIR__.'/bootstrap.php'; $id=(int)$_GET['id']; query("INSERT OR IGNORE INTO users(id,login,name,password,role,created_at) VALUES(?,?,?,'unused','member',0)",[$id,'test'.$id.'@example.com','テスト'.$id]);if($id===3){query("UPDATE users SET role='admin' WHERE id=?",[$id]);}if($id===4){query("UPDATE users SET role='candidate' WHERE id=?",[$id]);}if($id===5){query("UPDATE users SET role='director' WHERE id=?",[$id]);}$u=query('SELECT * FROM users WHERE id=?',[$id])->fetch();signIn($u);output(['csrf'=>$_SESSION['csrf']]);`);
await php.mount(temp,createNodeFsMountHandler(temp));const jars={};
async function run(who,file='learning.php',post=null){const jar=jars[who]??={cookie:''};let r=await php.run({scriptPath:app+'/'+file.split('?')[0],relativeUri:'/ku-fudo-chat/'+file,protocol:'https',method:post?'POST':'GET',headers:{Host:'test.invalid',Cookie:jar.cookie,...(post?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:post?new TextEncoder().encode(new URLSearchParams(post).toString()):undefined,$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.1'}});for(const c of r.headers['set-cookie']??[])if(c.startsWith('KU_FUDO_CHAT='))jar.cookie=c.split(';')[0];return r;}
try{
for(const id of [1,2,3,4,5]){const r=await run(id,'seed.php?id='+id);assert.equal(r.httpStatusCode,200,r.text+r.errors);jars[id].csrf=JSON.parse(r.text).csrf;}
let r=await run('anon','operations.php');assert(r.text.includes('ログインしてください'));
r=await run(1,'operations.php?access=1');assert.deepEqual(JSON.parse(r.text),{board:false,notice:false,admin:false});
r=await run(1,'operations.php');assert.equal(r.httpStatusCode,403);
r=await run(4,'operations.php');assert.equal(r.httpStatusCode,200,r.text+r.errors);
const minutes={action:'minutes',csrf:jars[4].csrf,id:'0',revision:'0',title:'月例会テスト',meeting_on:'2026-08-23','topics[0][title]':'議題テスト','topics[0][content]':'限定の議事録 <script>test</script>',participants:'参加者テスト',start_time:'13:00',end_time:'16:30',chair:'司会テスト',url:'',publish:'0'};
r=await run(4,'operations.php',minutes);assert.equal(r.httpStatusCode,303,r.text+r.errors);
r=await run(1,'operations.php?id=1');assert.equal(r.httpStatusCode,403);assert(!r.text.includes('限定の議事録'));
r=await run(5,'operations.php?id=1');assert.equal(r.httpStatusCode,200);assert(r.text.includes('下書き'));assert(r.text.includes('&lt;script&gt;'));
r=await run(5,'operations.php',{...minutes,csrf:jars[5].csrf,id:'1',revision:'1',publish:'1'});assert.equal(r.httpStatusCode,303);
r=await run(5,'operations.php',{action:'publish_minutes',csrf:jars[5].csrf,id:'1',revision:'2'});assert.equal(r.httpStatusCode,303,r.text+r.errors);r=await run(4,'operations.php?copy=1&id=1');assert.equal(r.httpStatusCode,200);assert(r.text.includes('name="id" value="0"'));assert(r.text.includes('参加者テスト'));r=await run(5,'operations.php?id=1');assert(r.text.includes('公開済み'));assert(r.text.includes('13:00 ～ 16:30'));r=await run(4,'operations.php',{...minutes,id:'1',revision:'1'});assert.equal(r.httpStatusCode,409);
r=await run(4,'operations.php',{...minutes,csrf:'bad'});assert.equal(r.httpStatusCode,403);
r=await run(4,'operations.php',{...minutes,url:'javascript:alert(1)'});assert.equal(r.httpStatusCode,400);
r=await run(4,'operations.php',{...minutes,meeting_on:'2026-02-31'});assert.equal(r.httpStatusCode,400);
r=await run(4,'operations.php?tab=editors');assert.equal(r.httpStatusCode,403);
const grant={action:'editor',csrf:jars[3].csrf,user_id:'2',area:'福岡',enabled:'1'};
r=await run(4,'operations.php?tab=editors',{...grant,csrf:jars[4].csrf});assert.equal(r.httpStatusCode,403);
r=await run(3,'operations.php?tab=editors',grant);assert.equal(r.httpStatusCode,303,r.text+r.errors);
r=await run(2,'operations.php?access=1');assert.equal(JSON.parse(r.text).notice,true);assert.equal(JSON.parse(r.text).board,false);
const notice={action:'notice',csrf:jars[2].csrf,title:'福岡Zoomテスト',body:'無料の会議です',area:'偽の地区',event_at:'2026-10-01T12:00',url:'https://example.com/meeting'};
r=await run(1,'operations.php?tab=notice',{...notice,csrf:jars[1].csrf});assert.equal(r.httpStatusCode,403);
r=await run(2,'operations.php?tab=notice',notice);assert.equal(r.httpStatusCode,303,r.text+r.errors);
r=await run(2,'api.php?action=feed&room=all');assert.equal(r.httpStatusCode,200,r.text+r.errors);const msg=JSON.parse(r.text).messages.find(m=>m.title==='福岡Zoomテスト');assert(msg);assert.equal(msg.area,'福岡');assert.equal(msg.kind,'notice');
r=await run(2,'operations.php?tab=notice',{...notice,url:'http://example.com'});assert.equal(r.httpStatusCode,400);
r=await run(3,'operations.php?tab=editors',{action:'editor',csrf:jars[3].csrf,user_id:'2',area:'福岡'});assert.equal(r.httpStatusCode,303);
r=await run(2,'operations.php?tab=notice',notice);assert.equal(r.httpStatusCode,403);
r=await run(1,'operations.php?id=1');assert.equal(r.httpStatusCode,403);
r=await run(4,'operations.php',{...minutes,start_time:'20:00',end_time:'10:00'});assert.equal(r.httpStatusCode,400);r=await run(1,'operations.php',{action:'publish_minutes',csrf:jars[1].csrf,id:'1',revision:'3'});assert.equal(r.httpStatusCode,403);r=await run(4,'operations.php?edit=1');assert.equal(r.httpStatusCode,200);assert(r.text.includes('議題を追加'));console.log('PASS: structured fields, copy, preview-to-publish, time validation;  minutes role isolation, draft/publish, shared edit conflicts, CSRF, XSS escaping, dates/URLs, admin-only representative grants, revoke-on-next-request, real chat-feed notice with enforced region.');
}finally{php.exit();fs.rmSync(temp,{recursive:true,force:true});}
