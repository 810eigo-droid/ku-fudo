import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ku-fudo-chat');const modules=process.argv[2];if(!modules)throw Error('Pass the PHP WASM node_modules path');
const {PHP}=await import(pathToFileURL(modules+'/@php-wasm/universal/index.js'));const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(modules+'/@php-wasm/node/index.js'));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));const temp=fs.mkdtempSync(path.join(os.tmpdir(),'learning-test-'));const web=temp+'/public_html',app=web+'/ku-fudo-chat';fs.mkdirSync(web);fs.cpSync(source,app,{recursive:true});if(process.env.LEARNING_TEST_BOOTSTRAP)fs.copyFileSync(process.env.LEARNING_TEST_BOOTSTRAP,app+'/bootstrap.php');fs.mkdirSync(temp+'/ku-fudo-private');fs.writeFileSync(temp+'/ku-fudo-private/config.php',"<?php return []; ");
fs.writeFileSync(app+'/seed.php',`<?php require __DIR__.'/bootstrap.php'; $id=(int)$_GET['id']; query("INSERT OR IGNORE INTO users(id,login,name,password,role,created_at) VALUES(?,?,?,'unused','member',0)",[$id,'test'.$id.'@example.com','テスト'.$id]);if($id===3){query("UPDATE users SET role='admin' WHERE id=?",[$id]);}if($id===4){query("UPDATE users SET role='candidate' WHERE id=?",[$id]);}if($id===5){query("UPDATE users SET role='director' WHERE id=?",[$id]);}$u=query('SELECT * FROM users WHERE id=?',[$id])->fetch();signIn($u);output(['csrf'=>$_SESSION['csrf']]);`);
let reset=fs.readFileSync(app+'/password-reset.php','utf8');const start=reset.indexOf('function resetTransport('),end=reset.indexOf('function resetRecord(');reset=reset.slice(0,start)+`function resetTransport(string $email,string $token):bool {file_put_contents(__DIR__.'/reset-mail.json',json_encode(['email'=>$email,'token'=>$token]));return true;}\n`.replace('\\n','\n')+reset.slice(end);fs.writeFileSync(app+'/password-reset.php',reset);
fs.writeFileSync(app+'/inspect-reset.php',`<?php require __DIR__.'/bootstrap.php';if(isset($_GET['sql']))$db->exec($_GET['sql']);output(['rows'=>query('SELECT * FROM password_resets')->fetchAll(),'users'=>query('SELECT id,version,must_change FROM users')->fetchAll(),'valid'=>password_verify('Newpass123!',query('SELECT password FROM users WHERE id=1')->fetchColumn())]);`);
await php.mount(temp,createNodeFsMountHandler(temp));const jars={};
async function run(who,file='learning.php',post=null){const jar=jars[who]??={cookie:''};let r=await php.run({scriptPath:app+'/'+file.split('?')[0],relativeUri:'/ku-fudo-chat/'+file,protocol:'https',method:post?'POST':'GET',headers:{Host:'test.invalid',Cookie:jar.cookie,...(post?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:post?new TextEncoder().encode(new URLSearchParams(post).toString()):undefined,$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.1'}});for(const c of r.headers['set-cookie']??[])if(c.startsWith('KU_FUDO_CHAT='))jar.cookie=c.split(';')[0];return r;}

async function inspect(sql=''){return JSON.parse((await run(3,'inspect-reset.php'+(sql?'?sql='+encodeURIComponent(sql):''))).text);}
async function open(who,token=''){const r=await run(who,'password-reset.php'+(token?'?token='+token:''));assert.equal(r.httpStatusCode,200,r.text+r.errors);const csrf=r.text.match(/name="csrf" value="([^"]+)"/);if(csrf)jars[who].csrf=csrf[1];return r;}
async function request(email){await open('anon');return run('anon','password-reset.php',{action:'request',csrf:jars.anon.csrf,email});}
try{
for(const id of [1,2,3]){const r=await run(id,'seed.php?id='+id);jars[id].csrf=JSON.parse(r.text).csrf;}
let r=await open('anon');assert(r.text.includes('再設定メールを送る'));
r=await run('anon','password-reset.php',{action:'request',csrf:'bad',email:'test1@example.com'});assert.equal(r.httpStatusCode,403);assert(!fs.existsSync(app+'/reset-mail.json'));
r=await request('missing@example.com');assert.equal(r.httpStatusCode,303);assert(!fs.existsSync(app+'/reset-mail.json'));
r=await request('test1@example.com');assert.equal(r.httpStatusCode,303,r.text+r.errors);const token=JSON.parse(fs.readFileSync(app+'/reset-mail.json')).token;assert.equal(token.length,64);let d=await inspect();assert.equal(d.rows.length,1);assert(!JSON.stringify(d.rows).includes(token));const version=d.users.find(x=>x.id===1).version;
r=await open('anon',token);assert(r.text.includes('もう一度入力'));assert.equal((await inspect()).rows.length,1);
const set={action:'reset',csrf:jars.anon.csrf,password:'Newpass123!',confirm:'Newpass123!'};
r=await run('anon','password-reset.php?token='+token,{...set,password:'short',confirm:'short'});assert(r.text.includes('8文字以上'));assert.equal((await inspect()).rows.length,1);
r=await run('anon','password-reset.php?token='+token,{...set,confirm:'different'});assert(r.text.includes('一致していません'));
r=await run('anon','password-reset.php?token='+token,{...set,csrf:'bad'});assert.equal(r.httpStatusCode,403);
r=await run('anon','password-reset.php?token='+token,set);assert.equal(r.httpStatusCode,303,r.text+r.errors);d=await inspect();assert(d.valid);assert.equal(d.rows.length,0);assert.equal(d.users.find(x=>x.id===1).version,version+1);
r=await run(1,'api.php?action=feed&room=all');assert.equal(r.httpStatusCode,401);
r=await open('anon',token);assert(r.text.includes('このリンクは利用できません'));
await request('test1@example.com');const expired=JSON.parse(fs.readFileSync(app+'/reset-mail.json')).token;await inspect('UPDATE password_resets SET expires=0');r=await open('anon',expired);assert(r.text.includes('このリンクは利用できません'));
await request('test1@example.com');const changed=JSON.parse(fs.readFileSync(app+'/reset-mail.json')).token;await inspect('UPDATE users SET version=version+1 WHERE id=1');r=await open('anon',changed);assert(r.text.includes('このリンクは利用できません'));
r=await request('test1@example.com');assert.equal(r.httpStatusCode,429);
await inspect('DELETE FROM limits; UPDATE users SET active=0 WHERE id=2');fs.unlinkSync(app+'/reset-mail.json');r=await request('test2@example.com');assert.equal(r.httpStatusCode,303);assert(!fs.existsSync(app+'/reset-mail.json'));
r=await run('anon','password-reset.php?token='+encodeURIComponent('<script>'));assert(!r.text.includes('<script>'));
console.log('PASS: uniform request response, inactive exclusion, CSRF, password rules, hash-only tokens, GET non-consumption, single use, expiry, version revocation, old session invalidation and rate limits. Transport was stubbed; no real email sent.');
}finally{php.exit();fs.rmSync(temp,{recursive:true,force:true});}
