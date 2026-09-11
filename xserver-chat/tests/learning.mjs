import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ku-fudo-chat');const modules=process.argv[2];if(!modules)throw Error('Pass the PHP WASM node_modules path');
const {PHP}=await import(pathToFileURL(modules+'/@php-wasm/universal/index.js'));const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(modules+'/@php-wasm/node/index.js'));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));const temp=fs.mkdtempSync(path.join(os.tmpdir(),'learning-test-'));const web=temp+'/public_html',app=web+'/ku-fudo-chat';fs.mkdirSync(web);fs.cpSync(source,app,{recursive:true});if(process.env.LEARNING_TEST_BOOTSTRAP)fs.copyFileSync(process.env.LEARNING_TEST_BOOTSTRAP,app+'/bootstrap.php');fs.mkdirSync(temp+'/ku-fudo-private');fs.writeFileSync(temp+'/ku-fudo-private/config.php',"<?php return []; ");
fs.writeFileSync(app+'/seed.php',`<?php require __DIR__.'/bootstrap.php'; $id=(int)$_GET['id']; query("INSERT OR IGNORE INTO users(id,login,name,password,role,created_at) VALUES(?,?,?,'unused','member',0)",[$id,'test'.$id.'@example.com','テスト'.$id]);if($id===3){query("UPDATE users SET role='admin' WHERE id=?",[$id]);}$u=query('SELECT * FROM users WHERE id=?',[$id])->fetch();signIn($u);output(['csrf'=>$_SESSION['csrf']]);`);
await php.mount(temp,createNodeFsMountHandler(temp));const jars={};
async function run(who,file='learning.php',post=null){const jar=jars[who]??={cookie:''};let r=await php.run({scriptPath:app+'/'+file.split('?')[0],relativeUri:'/ku-fudo-chat/'+file,protocol:'https',method:post?'POST':'GET',headers:{Host:'test.invalid',Cookie:jar.cookie,...(post?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:post?new TextEncoder().encode(new URLSearchParams(post).toString()):undefined,$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.1'}});for(const c of r.headers['set-cookie']??[])if(c.startsWith('KU_FUDO_CHAT='))jar.cookie=c.split(';')[0];return r;}
try{
for(const id of [1,2,3]){const r=await run(id,'seed.php?id='+id);assert.equal(r.httpStatusCode,200,r.text+r.errors);jars[id].csrf=JSON.parse(r.text).csrf;}
let r=await run('anon');assert(r.text.includes('ログイン画面を開く'));assert(!r.text.includes('<textarea'));
const data={csrf:jars[1].csrf,lesson_id:'yUsA5PHWJeg',note:'私だけの気づき <script>alert(1)</script>',watched:'1',revision:'0',user_id:'2'};
r=await run(1,'learning.php',data);assert.equal(r.httpStatusCode,303,r.text+r.errors);
r=await run(1);assert(r.text.includes('私だけの気づき &lt;script&gt;'));assert(r.text.includes('<strong>1</strong>'));assert(!r.text.includes('<script>alert'));
r=await run(2,'learning.php?user_id=1');assert(!r.text.includes('私だけの気づき'));
r=await run(2,'learning.php',{...data,csrf:jars[2].csrf,note:'二人目のメモ'});assert.equal(r.httpStatusCode,303);
r=await run(1,'learning.php',{...data,note:'上書き失敗'});assert.equal(r.httpStatusCode,409);assert(r.text.includes('上書き失敗'));
r=await run(1,'learning.php',{...data,revision:'1',csrf:'wrong'});assert.equal(r.httpStatusCode,403);
r=await run(1,'learning.php',{...data,revision:'1',lesson_id:'unknown'});assert.equal(r.httpStatusCode,400);
r=await run(1,'learning.php',{...data,revision:'1',note:'a'.repeat(5001)});assert.equal(r.httpStatusCode,400);
r=await run(1,'learning.php',{csrf:jars[1].csrf,lesson_id:data.lesson_id,revision:'1',note:''});assert.equal(r.httpStatusCode,303);
r=await run(1);assert(r.text.includes('<strong>0</strong>'));assert(!r.text.includes('私だけの気づき'));
const relog=await run(2,'seed.php?id=2');jars[2].csrf=JSON.parse(relog.text).csrf;r=await run(2);assert(r.text.includes('二人目のメモ'));
r=await run('anon','learning-admin.php');assert.equal(r.httpStatusCode,401);r=await run(1,'learning-admin.php');assert.equal(r.httpStatusCode,403);r=await run(3,'learning-admin.php');assert.equal(r.httpStatusCode,200,r.text+r.errors);assert(r.text.includes('1 / 6 レッスン'));assert(!r.text.includes('二人目のメモ'));r=await run(3,'learning-admin.php?q='+encodeURIComponent('テスト2'));assert(r.text.includes('テスト2さん'));assert(!r.text.includes('テスト1さん'));r=await run(3,'learning-admin.php',{any:'data'});assert.equal(r.httpStatusCode,405);console.log('PASS: admin authorization, progress-only view and name search;  anonymous protection, per-user isolation, persistence after login, CSRF, stale-edit conflict, escaped memo, validation, uncheck and clearing.');
}finally{php.exit();fs.rmSync(temp,{recursive:true,force:true});}
