import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ku-fudo-chat'),modules=process.argv[2];
const {PHP}=await import(pathToFileURL(modules+'/@php-wasm/universal/index.js'));const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(modules+'/@php-wasm/node/index.js'));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));const temp=fs.mkdtempSync(path.join(os.tmpdir(),'instant-register-')),web=temp+'/public_html',app=web+'/ku-fudo-chat';fs.mkdirSync(web);fs.cpSync(source,app,{recursive:true});fs.mkdirSync(temp+'/ku-fudo-private');fs.writeFileSync(temp+'/ku-fudo-private/config.php','<?php return [];');
fs.writeFileSync(app+'/seed.php',`<?php require __DIR__.'/bootstrap.php';
query("INSERT INTO users(login,name,password,role,membership,active,created_at) VALUES('admin@example.com','Admin',?,'admin','regular',1,0)",[password_hash('admin-password',PASSWORD_DEFAULT)]);
query("INSERT INTO users(login,name,password,role,membership,active,created_at) VALUES('stopped@example.com','Stopped',?,'member','regular',0,0)",[password_hash('old-password',PASSWORD_DEFAULT)]);
foreach(['pending','pending2'] as $n)query('INSERT INTO applications(login,name,password,created_at) VALUES(?,?,?,?)',[$n.'@example.com','Original '.$n,password_hash('pending-password',PASSWORD_DEFAULT),time()]);output(['ok'=>true]);`);
await php.mount(temp,createNodeFsMountHandler(temp));const jars={};
async function run(who,file='api.php?action=state',post=null,csrfOverride=null){let jar=jars[who]??={cookie:'',csrf:''};const r=await php.run({scriptPath:app+'/'+file.split('?')[0],relativeUri:'/ku-fudo-chat/'+file,protocol:'https',method:post?'POST':'GET',headers:{Host:'test.invalid',Cookie:jar.cookie,...(post?{'Content-Type':'application/json','X-CSRF-Token':csrfOverride??jar.csrf}:{})},body:post?new TextEncoder().encode(JSON.stringify(post)):undefined,$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.'+who}});for(const c of r.headers['set-cookie']??[])if(c.startsWith('KU_FUDO_CHAT='))jar.cookie=c.split(';')[0];try{let data=JSON.parse(r.text);if(data.csrf)jar.csrf=data.csrf;}catch{}return r;}
const data={name:'New learner',login:'learner@example.com',password:'new-password',remember:true,role:'admin',membership:'regular',active:0,must_change:1};
try{
await run(1,'seed.php');await run(2);let r=await run(2,'api.php?action=register',data,'bad');assert.equal(r.httpStatusCode,403);
r=await run(2,'api.php?action=register',data);assert.equal(r.httpStatusCode,200,r.text+r.errors);assert(r.headers['set-cookie'].some(x=>/expires=/i.test(x)));
r=await run(2);let u=JSON.parse(r.text).user;assert.equal(u.role,'member');assert.equal(u.membership,'free');assert.equal(Number(u.active),1);assert.equal(Number(u.must_change),0);
r=await run(2,'mypage.php');assert.equal(r.httpStatusCode,200);assert(r.text.includes('New learner'));
r=await run(2,'learning.php');assert.equal(r.httpStatusCode,200);assert(r.text.includes('<textarea'));
r=await run(2,'api.php?action=post',{room:'all',body:'moderated post'});assert.equal(r.httpStatusCode,200,r.text);assert.equal(JSON.parse(r.text).pending,true);
r=await run(2,'api.php?action=feed&room=all');assert(!JSON.parse(r.text).messages.some(x=>x.body==='moderated post'));
r=await run(2,'api.php?action=users');assert.equal(r.httpStatusCode,403);r=await run(2,'api.php?action=feed&room=board');assert.equal(r.httpStatusCode,403);
await run(3);r=await run(3,'api.php?action=register',{...data,password:'attacker-password'});assert.equal(r.httpStatusCode,409);r=await run(3);assert.equal(JSON.parse(r.text).user,null);
r=await run(3,'api.php?action=register',{...data,login:'stopped@example.com'});assert.equal(r.httpStatusCode,409);
await run(4);r=await run(4,'api.php?action=register',{...data,login:'pending@example.com'});assert.equal(r.httpStatusCode,409);
r=await run(4,'api.php?action=login',{login:'pending@example.com',password:'pending-password',remember:false});assert.equal(r.httpStatusCode,200,r.text);r=await run(4);assert.equal(JSON.parse(r.text).user.name,'Original pending');assert.equal(JSON.parse(r.text).user.membership,'free');
await run(5);r=await run(5,'api.php?action=register',{...data,login:'pending2@example.com',password:'pending-password'});assert.equal(r.httpStatusCode,200,r.text);r=await run(5);assert.equal(JSON.parse(r.text).user.name,'Original pending2');
await run(6);r=await run(6,'api.php?action=register',{...data,login:'invalid@example.com',remember:'yes'});assert.equal(r.httpStatusCode,400);
r=await run(2,'api.php?action=logout',{});assert.equal(r.httpStatusCode,200);await run(2);r=await run(2,'api.php?action=login',{login:data.login,password:data.password});assert.equal(r.httpStatusCode,200,r.text);
await run(7);r=await run(7,'api.php?action=login',{login:'admin@example.com',password:'admin-password'});assert.equal(r.httpStatusCode,200);r=await run(7,'api.php?action=applications');assert.equal(JSON.parse(r.text).applications.length,0);
console.log('PASS: immediate login and My Page, learning form, fixed free privileges, moderated posts, restricted admin/board, duplicate and disabled-account protection, CSRF, remember validation, legacy pending migration and password preservation.');
}finally{php.exit();fs.rmSync(temp,{recursive:true,force:true});}
