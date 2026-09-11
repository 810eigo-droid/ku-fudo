// Run with: node integration.mjs /absolute/path/to/node_modules
// Test fixtures are temporary; never uses an actual server or actual membership data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const modules=process.argv[2];
if(!modules)throw new Error('Pass the node_modules path containing @php-wasm/node and @php-wasm/universal');
const {PHP}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js')));
const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ku-fudo-test-'));
const web=path.join(temp,'public_html');const app=path.join(web,'ku-fudo-chat');
fs.mkdirSync(web);fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'../ku-fudo-chat'),app,{recursive:true});
const privateDir=path.join(temp,'ku-fudo-private');fs.mkdirSync(privateDir,{mode:0o700});
const setupKey=randomBytes(24).toString('hex');fs.writeFileSync(path.join(privateDir,'config.php'),`<?php return ['setup_key'=>'${setupKey}'];`,{mode:0o600});
// Replace only the mail transport in the disposable copy. Never send real test emails.
const bootstrapPath=path.join(app,'bootstrap.php');
let testBootstrap=fs.readFileSync(bootstrapPath,'utf8').replace("function_exists('mail')","function_exists('testApprovalTransport')").replace('@mail(', 'testApprovalTransport(');
testBootstrap+=`\nfunction testApprovalTransport($to,$subject,$body,$headers,$extra): bool { file_put_contents('${privateDir}/mail-test.log',json_encode(compact('to','subject','body','headers','extra'))."\\n",FILE_APPEND);return !is_file('${privateDir}/mail-fail');}\n`;
fs.writeFileSync(bootstrapPath,testBootstrap);
const redoLibPath=path.join(app,'redo-lib.php');fs.writeFileSync(redoLibPath,fs.readFileSync(redoLibPath,'utf8').replace("function_exists('mail')","function_exists('testApprovalTransport')").replace('@mail(', 'testApprovalTransport('));
const prayerLibPath=path.join(app,'prayer-lib.php');fs.writeFileSync(prayerLibPath,fs.readFileSync(prayerLibPath,'utf8').replace("function_exists('mail')","function_exists('testApprovalTransport')").replace('@mail(', 'testApprovalTransport('));
await php.mount(temp,createNodeFsMountHandler(temp));
const jars={};let passed=0;
async function request(who,action,data,expected=200,query='',csrfOverride){
 const isPrayer=action.startsWith('prayer:');const isRedo=action.startsWith('redo:');if(isPrayer)action=action.slice(7);else if(isRedo)action=action.slice(5);const apiFile=isPrayer?'prayer-api.php':(isRedo?'redo-api.php':'api.php');
 const jar=jars[who]??=( {cookie:'',csrf:''} );
 const r=await php.run({scriptPath:path.join(app,apiFile),relativeUri:'/ku-fudo-chat/'+apiFile+'?action='+action+query,protocol:'https',method:data?'POST':'GET',headers:{Host:'test.invalid',Cookie:jar.cookie,...(data?{'Content-Type':'application/json','X-CSRF-Token':csrfOverride??jar.csrf}:{})},body:data?new TextEncoder().encode(JSON.stringify(data)):undefined,$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.'+(Object.keys(jars).indexOf(who)+1)}});
 jar.lastHeaders=r.headers;const cookies=r.headers['set-cookie']??[];for(const cookie of cookies){if(cookie.startsWith('KU_FUDO_CHAT='))jar.cookie=cookie.split(';')[0];}
 let out;try{out=JSON.parse(r.text);}catch{throw new Error(`${action} invalid JSON: ${r.text} ${r.errors}`);}
 assert.equal(r.httpStatusCode,expected,`${who}/${action}: ${JSON.stringify(out)} ${r.errors}`);
 if(out.csrf)jar.csrf=out.csrf;passed++;return out;
}
try{
 const extensions=await php.run({code:'<?php echo json_encode([PHP_VERSION,extension_loaded("pdo_sqlite"),extension_loaded("mbstring")]);'});console.log('Runtime:',extensions.text);
 await request('anon','feed',null,401,'&room=all');
 const state=await request('admin','state');assert.equal(state.setup,true);
 assert(jars.admin.cookie.startsWith('KU_FUDO_CHAT='));
 await request('admin','setup',{setup_key:'invalid',login:'admin@example.com',name:'運営テスト',password:'Admin123'},403);
 await request('admin','setup',{setup_key:setupKey,login:'not-an-email',name:'運営テスト',password:'Admin123'},400);
 await request('admin','setup',{setup_key:setupKey,login:'admin@example.com',name:'運営テスト',password:'1234567'},400);
 await request('admin','setup',{setup_key:setupKey,login:'admin@example.com',name:'運営テスト',password:'Admin123'});
 const admin=await request('admin','state');assert.equal(admin.user.role,'admin');
 await request('admin','setup',{setup_key:setupKey,login:'another@example.com',name:'別管理者',password:'Admin123'},403);
 const members={};
 for(const role of ['member','candidate','director']){
  const created=await request('admin','user_create',{login:role+'@example.com',name:'テスト '+role,role});
  await request(role,'state');await request(role,'login',{login:role+'@example.com',password:created.temporary_password});
  await request(role,'feed',null,403,'&room=all');
  await request(role,'password',{old_password:created.temporary_password,password:'New-password-'+role+'-123'});
  members[role]=(await request(role,'state')).user;
 }
 // Email validation, case normalization, password character boundaries and session invalidation.
 await request('admin','user_create',{login:'not-an-email',name:'invalid',role:'member'},400);
 await request('admin','user_create',{login:' MEMBER@EXAMPLE.COM ',name:'duplicate',role:'member'},400);
 const mailUser=await request('admin','user_create',{login:' Mixed+Tag@Example.com ',name:'メールテスト',role:'member'});
 await request('mail','state');await request('mail','login',{login:'MIXED+TAG@EXAMPLE.COM',password:mailUser.temporary_password});
 await request('mail','email',{login:'new@example.com',password:mailUser.temporary_password},403);
 for(const password of ['1234567','あいうえおかき','a'.repeat(73)])await request('mail','password',{old_password:mailUser.temporary_password,password},400);
 await request('mail','password',{old_password:mailUser.temporary_password,password:'12345678'});
 await request('mail','password',{old_password:'12345678',password:'あいうえおかきく'});
 await request('mailOther','state');await request('mailOther','login',{login:'mixed+tag@example.com',password:'あいうえおかきく'});
 const mailId=(await request('mail','state')).user.id;
 await request('mail','post',{room:'all',body:'email migration persistence'});
 await request('mail','email',{login:'new@example.com',password:'wrong-password'},403);
 await request('mail','email',{login:'ADMIN@EXAMPLE.COM',password:'あいうえおかきく'},400);
 await request('mail','email',{login:'bad-email',password:'あいうえおかきく'},400);
 await request('mail','email',{login:' New@Example.com ',password:'あいうえおかきく'});
 const changed=(await request('mail','state')).user;assert.equal(changed.login,'new@example.com');assert.equal(changed.id,mailId);assert.equal(changed.role,'member');
 await request('mailOther','feed',null,401,'&room=all');
 await request('mailOther','state');await request('mailOther','login',{login:'mixed+tag@example.com',password:'あいうえおかきく'},401);
 await request('mailOther','login',{login:'NEW@EXAMPLE.COM',password:'あいうえおかきく'});
 const retained=await request('mailOther','feed',null,200,'&room=all');assert(retained.messages.some(m=>m.body==='email migration persistence'));
 await request('mailOther','feed',null,403,'&room=board');
 // Simulate the existing v1 database without reinitializing it. Old policy accepted 4 Japanese characters (12 bytes).
 const legacySeed=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$s=$db->prepare("INSERT INTO users(login,name,password,role,created_at) VALUES(?,?,?,'admin',?)");$s->execute(['legacy-admin','従来管理者',password_hash('あいうえ',PASSWORD_DEFAULT),time()]);echo 'ok';`});assert.equal(legacySeed.text,'ok');
 await request('legacy','state');await request('legacy','login',{login:'legacy-admin',password:'あいうえ'});
 await request('legacy','email',{login:'legacy@example.com',password:'あいうえ'});
 await request('legacy','logout',{});await request('legacy','state');
 await request('legacy','login',{login:'legacy-admin',password:'あいうえ'},401);
 await request('legacy','login',{login:'legacy@example.com',password:'あいうえ'});
 await request('legacy','password',{old_password:'あいうえ',password:'Legacy88'});
 await request('admin','post',{room:'all',kind:'notice',title:'全体Zoom',area:'全地区',event_at:'2099-10-01T18:00',zoom_url:'https://example.com/meeting',body:'公開テスト案内'});
 await request('admin','post',{room:'board',kind:'notice',title:'限定Zoom',area:'理事',event_at:'2099-10-02T18:00',zoom_url:'https://example.com/private',body:'限定内容SECRET'});
 await request('admin','post',{room:'all',kind:'notice',title:'不正リンク',body:'test',zoom_url:'javascript:alert(1)'},400);
 await request('admin','post',{room:'all',kind:'notice',title:'不正日時',body:'test',event_at:'2099-02-30T12:00'},400);
 const board=await request('candidate','feed',null,200,'&room=board');const boardId=Number(board.messages[0].id);assert.equal(board.events.length,1);
 const all=await request('member','feed',null,200,'&room=all');assert(!JSON.stringify(all).includes('SECRET'));assert.equal(all.events[0].title,'全体Zoom');assert.equal(all.events[0].description,'公開テスト案内');const allId=Number(all.messages[0].id);
 await request('member','feed',null,403,'&room=board');
 await request('member','post',{room:'board',body:'侵入',kind:'chat'},403);
 await request('member','post',{room:'all',body:'誤った返信',parent_id:boardId},404);
 await request('member','hide',{room:'all',id:boardId},404);
 await request('member','post',{room:'all',kind:'notice',title:'偽のお知らせ',body:'test'},403);
 await request('member','users',null,403);
 await request('member','user_create',{login:'hacker',name:'test',role:'admin'},403);
 await request('member','user_update',{id:members.member.id,role:'admin',active:1},403);
 await request('member','post',{room:'all',body:'csrf test'},403,'','bad-token');
 await request('member','post',{room:'all',body:'質問です <script>alert(1)</script>',parent_id:allId});
 let feed=await request('admin','feed',null,200,'&room=all');const reply=feed.messages[0];assert.equal(Number(reply.parent_id),allId);assert(feed.messages.some(m=>m.body.includes('<script>')));
 await request('director','post',{room:'board',body:'理事の返信',parent_id:boardId});
 await request('candidate','post',{room:'board',body:'候補の返信',parent_id:boardId});
 await request('member','hide',{room:'all',id:allId},403);
 await request('admin','hide',{room:'all',id:allId});
 feed=await request('member','feed',null,200,'&room=all');assert.equal(feed.events.length,0);assert.equal(feed.messages.find(m=>Number(m.id)===allId).body,'');assert.equal(feed.messages.find(m=>Number(m.id)===Number(reply.id)).parent_preview,'非表示の投稿');
 await request('admin','user_update',{id:members.candidate.id,role:'member',active:1});
 await request('candidate','feed',null,401,'&room=board');
 await request('candidate','state');await request('candidate','login',{login:'candidate@example.com',password:'New-password-candidate-123'});await request('candidate','feed',null,403,'&room=board');
 await request('admin','user_update',{id:members.director.id,role:'director',active:0});await request('director','feed',null,401,'&room=board');
 await request('member','logout',{});await request('member','feed',null,401,'&room=all');
 await request('member','state');await request('member','login',{login:'member@example.com',password:'New-password-member-123'});
 feed=await request('member','feed',null,200,'&room=all');assert(feed.messages.some(m=>Number(m.id)===Number(reply.id)));
 await request('admin','user_update',{id:admin.user.id,role:'member',active:0},400);
 const reset=await request('admin','user_reset',{id:members.member.id});await request('member','feed',null,401,'&room=all');
 await request('member','state');await request('member','login',{login:'member@example.com',password:reset.temporary_password});await request('member','feed',null,403,'&room=all');
 const seed=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite'); $s=$db->prepare("INSERT INTO messages(room,user_id,body,created_at) VALUES('all',1,?,?)"); for($i=0;$i<55;$i++)$s->execute(['pagination fixture '.$i,time()]); echo 'ok';`});assert.equal(seed.text,'ok');
 const first=await request('admin','feed',null,200,'&room=all');assert.equal(first.messages.length,50);assert.equal(first.more,true);
 const second=await request('admin','feed',null,200,'&room=all&before='+first.messages.at(-1).id);assert(second.messages.length>0);assert.equal(second.more,false);assert(!second.messages.some(m=>first.messages.some(n=>n.id===m.id)));
 // Personal-link login: preserve v1 data, enforce one use/expiry/roles and persistent session revocation.
 const migration=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DROP TABLE login_links');$db->exec('PRAGMA user_version=1');$db->exec('DELETE FROM limits');echo 'ok';`});assert.equal(migration.text,'ok');
 await request('admin','state');
 const migrated=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');echo json_encode([(int)$db->query('PRAGMA user_version')->fetchColumn(),(int)$db->query('SELECT count(*) FROM messages')->fetchColumn()]);`});const migratedInfo=JSON.parse(migrated.text);assert.equal(migratedInfo[0],9);assert(migratedInfo[1]>55);
 await request('anon','user_link',{id:members.member.id},403); // Missing CSRF rejected before authentication.
 await request('anon','state');await request('anon','user_link',{id:members.member.id},401);
 await request('mailOther','user_link',{id:members.member.id},403);
 await request('admin','user_link',{id:admin.user.id},400);
 await request('admin','user_create',{login:'linkadmin@example.com',name:'invalid admin',role:'admin',use_link:true},400);
 const noAdmin=(await request('admin','users')).users;assert(!noAdmin.some(u=>u.login==='linkadmin@example.com'));
 const invite=await request('admin','user_create',{login:'senior@example.com',name:'入力なし会員',role:'member',use_link:true});assert.match(invite.login_token,/^[a-f0-9]{64}$/);assert(!('temporary_password' in invite));
 const senior=(await request('admin','users')).users.find(u=>u.login==='senior@example.com');
 const stored=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');echo json_encode($db->query('SELECT * FROM login_links')->fetchAll(PDO::FETCH_ASSOC));`});assert(!stored.text.includes(invite.login_token));
 await request('senior','state');await request('senior','state'); // Link previews and page loads do not consume a token.
 await request('senior','link_login',{token:invite.login_token,remember:true},403,'','bad-csrf');
 await request('senior','link_login',{token:invite.login_token,remember:'yes'},403);
 await request('senior','link_login',{token:invite.login_token,remember:true});
 const rememberCookie=jars.senior.lastHeaders['set-cookie'].findLast(c=>c.startsWith('KU_FUDO_CHAT='));assert.match(rememberCookie,/expires=/i);assert.match(rememberCookie,/secure/i);assert.match(rememberCookie,/httponly/i);assert.match(rememberCookie,/samesite=strict/i);
 const seniorState=await request('senior','state');assert.equal(seniorState.user.id,senior.id);assert.equal(Number(seniorState.user.must_change),0);assert.equal(seniorState.user.link_login,true);
 await request('senior','post',{room:'all',body:'文字入力なしで入室できました'});await request('senior','feed',null,200,'&room=all');await request('senior','feed',null,403,'&room=board');
 await request('replay','state');await request('replay','link_login',{token:invite.login_token,remember:true},403);
 const expiredLink=await request('admin','user_link',{id:senior.id});
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('UPDATE login_links SET expires=1');`});
 await request('replay','link_login',{token:expiredLink.login_token,remember:true},403);
 const oldLink=await request('admin','user_link',{id:senior.id});const newLink=await request('admin','user_link',{id:senior.id});
 await request('replay','link_login',{token:oldLink.login_token,remember:true},403);
 await request('admin','link_login',{token:newLink.login_token,remember:true},403); // Cannot silently replace an authenticated account.
 await request('seniorSecond','state');await request('seniorSecond','link_login',{token:newLink.login_token,remember:false});
 const shortCookie=jars.seniorSecond.lastHeaders['set-cookie'].findLast(c=>c.startsWith('KU_FUDO_CHAT='));assert(!/expires=/i.test(shortCookie));
 async function ageSession(who,seconds){const id=jars[who].cookie.split('=')[1];const aged=await php.run({code:`<?php session_save_path('${privateDir}/sessions');session_name('KU_FUDO_CHAT');session_id('${id}');session_start();$_SESSION['signed_at']=time()-${seconds};session_write_close();echo 'ok';`});assert.equal(aged.text,'ok');}
 await ageSession('senior',43201);assert((await request('senior','state')).user); // Remembered login survives the old 12-hour limit.
 await ageSession('seniorSecond',43201);assert.equal((await request('seniorSecond','state')).user,null);
 await ageSession('senior',2592001);assert.equal((await request('senior','state')).user,null);
 const boardInvite=await request('admin','user_create',{login:'boardlink@example.com',name:'リンク理事候補',role:'candidate',use_link:true});
 await request('boardLink','state');await request('boardLink','link_login',{token:boardInvite.login_token,remember:true});
 const boardLinkUser=(await request('boardLink','state')).user;await request('boardLink','feed',null,200,'&room=board');
 const beforeRole=await request('admin','user_link',{id:boardLinkUser.id});
 await request('admin','user_update',{id:boardLinkUser.id,role:'member',active:1});await request('boardLink','feed',null,401,'&room=board');
 await request('replay','link_login',{token:beforeRole.login_token,remember:true},403);
 const afterRole=await request('admin','user_link',{id:boardLinkUser.id});await request('boardLink','state');await request('boardLink','link_login',{token:afterRole.login_token,remember:true});await request('boardLink','feed',null,403,'&room=board');
 const beforeStop=await request('admin','user_link',{id:boardLinkUser.id});await request('admin','user_update',{id:boardLinkUser.id,role:'member',active:0});await request('boardLink','feed',null,401,'&room=all');await request('replay','link_login',{token:beforeStop.login_token,remember:true},403);await request('admin','user_link',{id:boardLinkUser.id},400);
 const beforeReset=await request('admin','user_link',{id:senior.id});await request('admin','user_reset',{id:senior.id});await request('replay','link_login',{token:beforeReset.login_token,remember:true},403);
 const afterReset=await request('admin','user_link',{id:senior.id});await request('senior','state');await request('senior','link_login',{token:afterReset.login_token,remember:true});await request('senior','logout',{});assert.equal((await request('senior','state')).user,null);await request('senior','feed',null,401,'&room=all');
 // Public applications: no access until approval, no role selection, no password replacement.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DELETE FROM limits');`});
 await request('applicant','state');
 const application={name:'申込テスト',login:' Applicant@Example.com ',password:'Pass1234',role:'admin',active:1};
 await request('applicant','register',application,403,'','wrong-csrf');
 await request('applicant','register',{...application,password:'1234567'},400);
 await request('applicant','register',{...application,login:'invalid'},400);
 await request('applicant','register',application);
 assert.equal((await request('applicant','state')).user,null);
 await request('applicant','login',{login:'applicant@example.com',password:'Pass1234'},403);
 await request('applicant','feed',null,401,'&room=all');
 await request('applicant','applications',null,401);
 await request('mailOther','applications',null,403);
 await request('applicant','register',{...application,password:'Changed88'});
 let applications=(await request('admin','applications')).applications;
 assert.equal(applications.length,1);assert.equal(applications[0].login,'applicant@example.com');assert(!('password' in applications[0]));
 const applicationId=applications[0].id;
 const hashed=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');echo $db->query('SELECT password FROM applications')->fetchColumn();`});assert(!hashed.text.includes('Pass1234'));assert.match(hashed.text,/^\$2y\$/);
 await request('mailOther','application_approve',{id:applicationId},403);
 await request('admin','application_approve',{id:applicationId},403,'','wrong-csrf');
 await request('admin','application_approve',{id:applicationId,role:'admin'});
 await request('admin','application_approve',{id:applicationId},404);
 assert.equal((await request('admin','applications')).applications.length,0);
 await request('applicant','login',{login:'applicant@example.com',password:'Changed88'},401);
 await request('applicant','login',{login:'applicant@example.com',password:'Pass1234',remember:true});
 const newMember=(await request('applicant','state')).user;assert.equal(newMember.role,'member');assert.equal(Number(newMember.must_change),0);
 await request('applicant','feed',null,200,'&room=all');await request('applicant','feed',null,403,'&room=board');
 await request('applicant','register',application,403);
 await request('applicant2','state');await request('applicant2','register',{...application,password:'Hacked88'});
 assert.equal((await request('admin','applications')).applications.length,0);
 await request('applicant2','login',{login:'applicant@example.com',password:'Hacked88'},401);
 await request('applicant2','login',{login:'applicant@example.com',password:'Pass1234',remember:true});
 assert.match(jars.applicant2.lastHeaders['set-cookie'].findLast(c=>c.startsWith('KU_FUDO_CHAT=')),/expires=/i);
 await request('rejected','state');await request('rejected','register',{name:'削除テスト',login:'rejected@example.com',password:'Reject88'});
 const rejected=(await request('admin','applications')).applications[0];
 await request('admin','application_reject',{id:rejected.id});
 await request('rejected','login',{login:'rejected@example.com',password:'Reject88'},401);
 await request('rejected','feed',null,401,'&room=all');
 await request('limitedApplicant','state');
 for(let i=0;i<10;i++)await request('limitedApplicant','register',{name:'制限テスト',login:'limited@example.com',password:'Limited8'});
 await request('limitedApplicant','register',{name:'制限テスト',login:'limited@example.com',password:'Limited8'},429);
 // Approval mail queue, contents, failure recovery, authorization and duplicate suppression.
 let mailHistory=(await request('admin','approval_mails')).mails;
 assert.equal(mailHistory.length,1);assert.equal(mailHistory[0].status,'sent');assert.equal(mailHistory[0].recipient,'applicant@example.com');
 let sentMails=fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(sentMails.length,1);assert.equal(sentMails[0].to,'applicant@example.com');
 assert.equal(sentMails[0].headers['Reply-To'],'info@taf-design.com');assert.equal(sentMails[0].extra,'-finfo@taf-design.com');
 const parts=[...sentMails[0].body.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)].map(m=>Buffer.from(m[1],'base64').toString('utf8'));
 assert.equal(parts.length,2);assert(parts[0].includes('https://taf-design.com/ku-fudo-chat/'));assert(parts[1].includes('チャットを開く'));assert(!parts.join('').includes('Pass1234'));
 await request('applicant','approval_mails',null,403);
 await request('rejected','approval_mails',null,401);
 await request('applicant','approval_mail_retry',{id:mailHistory[0].id},403);
 await request('admin','approval_mail_retry',{id:mailHistory[0].id},400);
 fs.writeFileSync(path.join(privateDir,'mail-fail'),'1');
 await request('mailFailApplicant','state');await request('mailFailApplicant','register',{name:'送信失敗テスト',login:'mail-fail@example.com',password:'Mailfail8'});
 const pendingFailure=(await request('admin','applications')).applications.find(a=>a.login==='mail-fail@example.com');
 const failedApproval=await request('admin','application_approve',{id:pendingFailure.id});assert.equal(failedApproval.mail_status,'failed');
 await request('mailFailApplicant','login',{login:'mail-fail@example.com',password:'Mailfail8'});
 await request('mailFailApplicant','feed',null,200,'&room=all'); // Membership survives mail failure.
 mailHistory=(await request('admin','approval_mails')).mails;const failedMail=mailHistory.find(m=>m.recipient==='mail-fail@example.com');assert.equal(failedMail.status,'failed');assert.equal(Number(failedMail.attempts),1);
 await request('admin','approval_mail_retry',{id:failedMail.id},403,'','bad-token');
 fs.unlinkSync(path.join(privateDir,'mail-fail'));
 const retryResult=await request('admin','approval_mail_retry',{id:failedMail.id});assert.equal(retryResult.mail_status,'sent');
 await request('admin','approval_mail_retry',{id:failedMail.id},400);
 mailHistory=(await request('admin','approval_mails')).mails;assert.equal(Number(mailHistory.find(m=>m.id===failedMail.id).attempts),2);
 sentMails=fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(sentMails.length,3);
 // An unconfirmed in-flight send cannot be retried immediately.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec("UPDATE approval_mail SET status='sending',last_attempt=".time()." WHERE id=${failedMail.id}");`});
 await request('admin','approval_mail_retry',{id:failedMail.id},400);
 // A stopped account cannot receive a retry, even if its job is stale.
 const failedUser=(await request('admin','users')).users.find(u=>u.login==='mail-fail@example.com');
 await request('admin','user_update',{id:failedUser.id,role:'member',active:0});
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec("UPDATE approval_mail SET last_attempt=1 WHERE id=${failedMail.id}");`});
 const suppressed=await request('admin','approval_mail_retry',{id:failedMail.id});assert.equal(suppressed.mail_status,'failed');
 assert.equal(fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').length,3);
 // Member deletion removes identity/access but preserves conversations and replies.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DELETE FROM limits');`});
 const deletionInvite=await request('admin','user_link',{id:newMember.id});
 await request('applicant','post',{room:'all',body:'Deletion preserves this conversation'});
 const deletionPending=(await request('admin','submissions')).submissions.find(m=>m.body==='Deletion preserves this conversation');await request('admin','submission_review',{id:deletionPending.id,decision:'approved'});
 const deleteFeed=await request('admin','feed',null,200,'&room=all');const keptPost=deleteFeed.messages.find(m=>m.body==='Deletion preserves this conversation');
 await request('admin','post',{room:'all',body:'Reply preserved',parent_id:keptPost.id});
 await request('applicant','user_delete',{id:newMember.id},403);
 await request('admin','user_delete',{id:admin.user.id},400);
 await request('admin','user_delete',{id:newMember.id},403,'','bad-token');
 await request('admin','user_delete',{id:newMember.id});
 await request('applicant','feed',null,401,'&room=all');await request('applicant2','feed',null,401,'&room=all');
 await request('applicant','state');await request('applicant','login',{login:'applicant@example.com',password:'Pass1234'},401);
 await request('applicant','link_login',{token:deletionInvite.login_token,remember:true},403);
 assert(!(await request('admin','users')).users.some(u=>u.id===newMember.id));
 assert(!(await request('admin','approval_mails')).mails.some(m=>m.recipient==='applicant@example.com'));
 await request('admin','user_delete',{id:newMember.id},404);
 await request('admin','user_update',{id:newMember.id,role:'admin',active:1},404);
 await request('admin','user_reset',{id:newMember.id},404);
 await request('admin','user_link',{id:newMember.id},400);
 const retainedDelete=(await request('admin','feed',null,200,'&room=all')).messages;
 assert.equal(retainedDelete.find(m=>m.id===keptPost.id).name,'退会済みの会員');assert(retainedDelete.some(m=>m.body==='Reply preserved'&&Number(m.parent_id)===Number(keptPost.id)));
 await request('applicant','register',{name:'再申込',login:'applicant@example.com',password:'Another8'});
 assert((await request('admin','applications')).applications.some(a=>a.login==='applicant@example.com'));assert.equal((await request('applicant','state')).user,null);
 // Membership tiers only gate materials: free members still share all-room chat and Zoom notices.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DELETE FROM limits');`});
 assert.equal((await request('mailOther','state')).user.membership,'regular'); // Existing users retain normal access.
 await request('freeReader','state');await request('freeReader','register',{name:'無料テスト',login:'free-reader@example.com',password:'Free8888',membership:'regular'});
 const freeApp=(await request('admin','applications')).applications.find(a=>a.login==='free-reader@example.com');
 await request('admin','application_approve',{id:freeApp.id});
 await request('freeReader','login',{login:'free-reader@example.com',password:'Free8888'});
 const freeReader=(await request('freeReader','state')).user;assert.equal(freeReader.membership,'free');
 const submitted=await request('freeReader','post',{room:'all',body:'無料会員の承認前本文',status:'approved',membership:'regular'});assert.equal(submitted.pending,true);
 const queue=(await request('admin','submissions')).submissions;const pending=queue.find(m=>m.body==='無料会員の承認前本文');assert(pending);
 assert(!(await request('mailOther','feed',null,200,'&room=all')).messages.some(m=>m.body==='無料会員の承認前本文'));
 assert(!(await request('mailOther','submissions')).submissions.some(m=>m.id===pending.id));
 assert((await request('freeReader','submissions')).submissions.some(m=>m.id===pending.id));
 await request('rejected','submissions',null,401);
 await request('freeReader','submission_review',{id:pending.id,decision:'approved'},403);
 await request('admin','submission_review',{id:pending.id,decision:'approved'},403,'','bad-token');
 await request('admin','submission_review',{id:pending.id,decision:'approved'});
 await request('admin','submission_review',{id:pending.id,decision:'approved'},409);
 const approved=(await request('mailOther','feed',null,200,'&room=all')).messages.find(m=>m.body==='無料会員の承認前本文');assert(approved);assert.equal(Number(approved.user_id),Number(freeReader.id));
 await request('freeReader','post',{room:'all',body:'未承認の返信',parent_id:approved.id});
 const replyPending=(await request('admin','submissions')).submissions.find(m=>m.body==='未承認の返信');assert.equal(Number(replyPending.parent_id),Number(approved.id));
 assert(!(await request('mailOther','feed',null,200,'&room=all')).messages.some(m=>m.body==='未承認の返信'));
 await request('admin','submission_review',{id:replyPending.id,decision:'rejected'});
 assert.equal((await request('freeReader','submissions')).submissions.find(m=>m.id===replyPending.id).status,'rejected');
 await request('admin','submission_review',{id:replyPending.id,decision:'approved'},409);
 await request('mailOther','post',{room:'all',body:'通常会員は即時公開'});
 assert((await request('freeReader','feed',null,200,'&room=all')).messages.some(m=>m.body==='通常会員は即時公開'));
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DELETE FROM limits');`});

 await request('admin','post',{room:'all',kind:'notice',title:'有料Zoomの案内',body:'参加費は案内文でお知らせ',event_at:'2099-11-01T12:00',zoom_url:'https://example.com/paid-zoom'});
 assert((await request('freeReader','feed',null,200,'&room=all')).events.some(e=>e.title==='有料Zoomの案内'));
 await request('freeReader','feed',null,403,'&room=board');
 const baseMaterial={title:'全会員向け',body:'無料でも学べる本文',audience:'free',published:1,sort_order:10,resource_url:'https://example.com/free-video'};
 await request('freeReader','material_save',baseMaterial,403);
 const freeMaterial=await request('admin','material_save',baseMaterial);
 const regularMaterial=await request('admin','material_save',{...baseMaterial,title:'通常会員限定TITLE',body:'通常会員限定SECRET',audience:'regular',resource_url:'https://example.com/regular-secret',sort_order:20});
 const draftMaterial=await request('admin','material_save',{...baseMaterial,title:'下書きTITLE',published:0});
 await request('rejected','materials',null,401);
 await request('rejected','material',null,401,'&id='+freeMaterial.id);
 const freeList=(await request('freeReader','materials')).materials;assert.deepEqual(freeList.map(m=>m.id),[freeMaterial.id]);assert(!JSON.stringify(freeList).includes('限定'));
 assert.equal((await request('freeReader','material',null,200,'&id='+freeMaterial.id)).material.body,baseMaterial.body);
 await request('freeReader','material',null,404,'&id='+regularMaterial.id);
 await request('freeReader','material',null,404,'&id='+draftMaterial.id);
 const normalList=(await request('mailOther','materials')).materials;assert.deepEqual(normalList.map(m=>m.id),[freeMaterial.id,regularMaterial.id]);
 await request('mailOther','material',null,200,'&id='+regularMaterial.id);
 await request('mailOther','material',null,404,'&id='+draftMaterial.id);
 await request('admin','material',null,200,'&id='+draftMaterial.id);
 await request('admin','material_save',{...baseMaterial,resource_url:'javascript:alert(1)'},400);
 await request('admin','material_save',{...baseMaterial,resource_url:'https://user:pass@example.com/'},400);
 await request('admin','material_save',{...baseMaterial,published:2},400);
 await request('admin','material_save',{...baseMaterial,audience:'unknown'},400);
 await request('admin','material_save',{...baseMaterial,sort_order:-1},400);
 await request('admin','material_save',baseMaterial,403,'','bad-token');
 await request('admin','user_update',{id:freeReader.id,role:'member',active:1,membership:'regular'});
 await request('freeReader','material',null,401,'&id='+regularMaterial.id);
 await request('freeReader','state');await request('freeReader','login',{login:'free-reader@example.com',password:'Free8888'});
 await request('freeReader','material',null,200,'&id='+regularMaterial.id);
 await request('admin','user_update',{id:freeReader.id,role:'member',active:1,membership:'free'});
 await request('freeReader','material',null,401,'&id='+regularMaterial.id);
 await request('freeReader','state');await request('freeReader','login',{login:'free-reader@example.com',password:'Free8888'});
 await request('freeReader','material',null,404,'&id='+regularMaterial.id);
 await request('freeReader','user_update',{id:freeReader.id,role:'member',active:1,membership:'regular'},403);
 await request('admin','material_save',{...baseMaterial,id:freeMaterial.id,published:0});
 await request('freeReader','material',null,404,'&id='+freeMaterial.id);
 await request('admin','material_save',{...baseMaterial,id:freeMaterial.id,body:'編集済み本文'});
 assert.equal((await request('freeReader','material',null,200,'&id='+freeMaterial.id)).material.body,'編集済み本文');
 await request('freeReader','material_delete',{id:freeMaterial.id},403);
 await request('admin','material_delete',{id:freeMaterial.id});
 await request('freeReader','material',null,404,'&id='+freeMaterial.id);
 assert(!(await request('admin','materials')).materials.some(m=>m.id===freeMaterial.id));
 // REDO is a separate paid annual entitlement, February through January.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DELETE FROM limits');`});
 await request('rejected','redo:state',null,401);
 const redoState=await request('admin','redo:state');const ry=redoState.year,rs=ry+'-02-01',re=(ry+1)+'-01-31';assert.deepEqual(redoState.period,[rs,re]);
 const redoDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
 await request('freeReader','redo:issues',null,403);
 await request('freeReader','redo:members',null,403);
 await request('freeReader','redo:member_create',{name:'Forbidden',login:'forbid@example.com'},403);
 const redoNew=await request('admin','redo:member_create',{name:'REDO会員',login:'redo-reader@example.com'});
 await request('redoReader','state');await request('redoReader','login',{login:'redo-reader@example.com',password:redoNew.temporary_password});
 await request('redoReader','redo:state',null,403);
 await request('redoReader','password',{old_password:redoNew.temporary_password,password:'ReaderPass88'});
 assert.equal((await request('redoReader','state')).user.chat_access,0);
 await request('redoReader','feed',null,403,'&room=all');await request('redoReader','materials',null,403);
 await request('redoReader','redo:issues',null,403);
 const term={user_id:redoNew.id,year:ry,joined_on:redoDate,paid_on:redoDate,amount:7000,enabled:1,chat_access:0,note:'途中入会・実際の振込金額'};
 await request('admin','redo:term_save',{...term,joined_on:(ry+1)+'-02-01'},400);
 await request('admin','redo:term_save',term,403,'','bad-token');
 await request('admin','redo:term_save',term);
 assert.equal((await request('redoReader','redo:state')).eligible,true);
 assert.equal((await request('redoReader','redo:state')).terms[0].year,ry);
 const redoIssueData={number:'614',series:'XXⅨ',issued_on:'2026-08-10',title:'岩根先生よりメッセージ【統一メール614号】',body:'REDO限定本文 <script>alert(1)</script>'};
 await request('redoReader','redo:issue_save',redoIssueData,403);
 const rd=await request('admin','redo:issue_save',redoIssueData);
 await request('redoReader','redo:issue',null,404,'&id='+rd.id);
 assert.equal((await request('redoReader','redo:issues')).issues.length,0);
 assert(!(JSON.stringify(await request('admin','redo:issue',null,200,'&id='+rd.id))).includes('pdf_key'));

 async function uploadRedo(who,id,bytes,expected=200,token){
  const boundary='----redo-test-boundary';
  const body='--'+boundary+'\r\nContent-Disposition: form-data; name="id"\r\n\r\n'+id+'\r\n--'+boundary+'\r\nContent-Disposition: form-data; name="pdf"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n'+bytes+'\r\n--'+boundary+'--\r\n';
  const rr=await php.run({scriptPath:path.join(app,'redo-api.php'),relativeUri:'/ku-fudo-chat/redo-api.php?action=upload',protocol:'https',method:'POST',headers:{Host:'test.invalid',Cookie:jars[who].cookie,'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':token??jars[who].csrf},body:new TextEncoder().encode(body),$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web,REMOTE_ADDR:'192.0.2.201'}});
  assert.equal(rr.httpStatusCode,expected,rr.text+' '+rr.errors);return rr;
 }
 await uploadRedo('redoReader',rd.id,'%PDF-1.4\n%%EOF',403);
 await uploadRedo('admin',rd.id,'%PDF-1.4\n%%EOF',403,'invalid');
 await uploadRedo('admin',rd.id,'<html>not a PDF</html>',400);
 await uploadRedo('admin',rd.id,'%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
 assert.equal((await request('admin','redo:issue',null,200,'&id='+rd.id)).issue.has_pdf,true);
 // PDFs are read by authenticated ID only, never by a public file path.
 fs.mkdirSync(path.join(privateDir,'redo-pdfs'),{recursive:true});const pdfKey='a'.repeat(48)+'.pdf';const pdfBytes='%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF';fs.writeFileSync(path.join(privateDir,'redo-pdfs',pdfKey),pdfBytes);
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec("UPDATE redo_issues SET pdf_key='${pdfKey}' WHERE id=${rd.id}");`});
 await request('freeReader','redo:pdf',null,403,'&id='+rd.id);await request('redoReader','redo:pdf',null,404,'&id='+rd.id);
 const mailBefore=fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').length;
 await request('admin','redo:publish',{id:rd.id,notify:true},400);
 const publishRedo=await request('admin','redo:publish',{id:rd.id,notify:true,confirmed:true});assert.equal(publishRedo.queued,1);
 assert.equal(fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').length,mailBefore); // Publishing queues; only send_batch sends.
 await request('admin','redo:publish',{id:rd.id,notify:true,confirmed:true},409);
 assert.equal((await request('redoReader','redo:issue',null,200,'&id='+rd.id)).issue.body,redoIssueData.body);
 await request('freeReader','redo:issue',null,403,'&id='+rd.id);
 const pdfResponse=await php.run({scriptPath:path.join(app,'redo-api.php'),relativeUri:'/ku-fudo-chat/redo-api.php?action=pdf&id='+rd.id,protocol:'https',method:'GET',headers:{Host:'test.invalid',Cookie:jars.redoReader.cookie},$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web}});assert.equal(pdfResponse.httpStatusCode,200);assert.equal(pdfResponse.text,pdfBytes);assert(JSON.stringify(pdfResponse.headers).includes('attachment'));
 await request('admin','redo:issue_save',{...redoIssueData,id:rd.id,body:'changed'},400);
 // Actual sends use mocked transport only; addresses are not exposed to another member.
 await request('redoReader','redo:deliveries',null,403,'&id='+rd.id);
 fs.rmSync(path.join(privateDir,'mail-fail'),{force:true});
 const enabledConfig=await php.run({code:`<?php $c=require '${privateDir}/config.php';$c['redo_mail_enabled']=true;$c['approval_mail_enabled']=true;file_put_contents('${privateDir}/config.php','<?php return '.var_export($c,true).';');`});
 await request('admin','redo:send_batch',{id:rd.id});
 const rdDelivery=await request('admin','redo:deliveries',null,200,'&id='+rd.id);assert.equal(rdDelivery.counts[0].status,'sent');
 await request('admin','redo:send_batch',{id:rd.id});assert.equal(fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').length,mailBefore+1);
 const sentRedo=JSON.parse(fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n').at(-1));assert.equal(sentRedo.to,'redo-reader@example.com');
 assert(Buffer.from(sentRedo.body.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\s/g,''),'base64').toString().includes('redo.php?id='+rd.id));
 await request('admin','redo:term_save',{...term,enabled:0});await request('redoReader','redo:pdf',null,403,'&id='+rd.id);
 await request('admin','redo:term_save',{...term,year:ry+1,joined_on:(ry+1)+'-02-01'});assert.equal((await request('redoReader','redo:state')).eligible,false); // Future renewal does not grant this year.
 await request('admin','redo:term_save',term);
 await request('redoReader','redo:subscription',{enabled:0});assert.equal((await request('admin','redo:recipients')).count,0);
 const noMailIssue=await request('admin','redo:issue_save',{...redoIssueData,number:'615'});
 assert.equal((await request('admin','redo:publish',{id:noMailIssue.id,notify:true,confirmed:true})).queued,0);
 await request('redoReader','redo:subscription',{enabled:1});
 const cancelIssue=await request('admin','redo:issue_save',{...redoIssueData,number:'616'});await request('admin','redo:publish',{id:cancelIssue.id,notify:true,confirmed:true});
 await request('admin','redo:term_save',{...term,enabled:0});await request('admin','redo:send_batch',{id:cancelIssue.id});assert.equal((await request('admin','redo:deliveries',null,200,'&id='+cancelIssue.id)).counts[0].status,'skipped');
 await request('admin','redo:term_save',term);await request('admin','redo:unpublish',{id:rd.id});await request('redoReader','redo:issue',null,404,'&id='+rd.id);await request('redoReader','redo:pdf',null,404,'&id='+rd.id);assert(!(await request('redoReader','redo:issues')).issues.some(i=>i.id===rd.id));
 await request('admin','redo:issue_save',{...redoIssueData,id:rd.id},400);
 const failedIssue=await request('admin','redo:issue_save',{...redoIssueData,number:'617'});await request('admin','redo:publish',{id:failedIssue.id,notify:true,confirmed:true});fs.writeFileSync(path.join(privateDir,'mail-fail'),'1');await request('admin','redo:send_batch',{id:failedIssue.id});assert.equal((await request('admin','redo:deliveries',null,200,'&id='+failedIssue.id)).counts[0].status,'failed');fs.rmSync(path.join(privateDir,'mail-fail'));await request('admin','redo:retry_failed',{id:failedIssue.id});await request('admin','redo:send_batch',{id:failedIssue.id});assert.equal((await request('admin','redo:deliveries',null,200,'&id='+failedIssue.id)).counts[0].status,'sent');
 // Both memberships are explicit. Enabling chat invalidates old login sessions.
 await request('admin','redo:term_save',{...term,chat_access:1});await request('redoReader','feed',null,401,'&room=all');await request('redoReader','state');await request('redoReader','login',{login:'redo-reader@example.com',password:'ReaderPass88'});await request('redoReader','feed',null,200,'&room=all');await request('redoReader','redo:issue',null,200,'&id='+noMailIssue.id);

 // Prayer reports: separate participation, private records, monthly replacement and receipt transport.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec('DELETE FROM limits');`});
 await request('anon','prayer:state',null,401);
 const ps=await request('admin','prayer:state');const pm=ps.latest_month;
 const dt=new Date(pm+'-15T00:00:00Z');dt.setUTCMonth(dt.getUTCMonth()-1);const prev=dt.toISOString().slice(0,7);dt.setUTCMonth(dt.getUTCMonth()+2);const future=dt.toISOString().slice(0,7);
 assert.equal((await request('freeReader','prayer:state')).eligible,false);
 for(const action of ['history','report','summary','csv','members'])await request('freeReader','prayer:'+action,null,403);
 const participant={user_id:freeReader.id,number:'２４',enabled:1,start_month:prev,end_month:''};
 await request('freeReader','prayer:member_save',participant,403);
 await request('admin','prayer:member_save',participant,403,'','bad');
 await request('admin','prayer:member_save',{...participant,number:'0'},400);
 await request('admin','prayer:member_save',{...participant,start_month:'2026-13'},400);
 await request('admin','prayer:member_save',participant);
 assert.equal((await request('freeReader','prayer:state')).participant.number,24);
 assert.equal((await request('freeReader','prayer:state')).eligible,true);
 await request('admin','prayer:member_save',{...participant,user_id:redoNew.id},400); // Duplicate number rejected.
 await request('admin','prayer:member_save',{...participant,user_id:redoNew.id,number:'25'});
 const record={month:pm,revision:0,humanity:'１２',vision:'3',return_point:'4',other_prayer:'0',gratitude:'5',meditation:'３０',listening:'１．５０',reflection:'テスト感想 <script>no execution</script>'};
 await request('freeReader','prayer:save',record,403,'','bad');
 for(const patch of [{humanity:'-1'},{vision:'2.5'},{meditation:'1.5'},{listening:'1.234'},{listening:'Infinity'},{meditation:'999999'},{listening:'9999'},{gratitude:''},{other_prayer:'1e3'},{month:future},{month:'2026-00'},{reflection:'a'.repeat(3001)}])await request('freeReader','prayer:save',{...record,...patch},400);
 const prayerLog=()=>fs.readFileSync(path.join(privateDir,'mail-test.log'),'utf8').trim().split('\n');const beforePrayer=prayerLog().length;
 let saved=await request('freeReader','prayer:save',{...record,user_id:redoNew.id,email:'attacker@example.com'});
 assert.equal(saved.revision,1);assert.equal(saved.receipt_status,'sent');assert.equal(prayerLog().length,beforePrayer+1);
 const own=await request('freeReader','prayer:report',null,200,'&month='+pm+'&user_id='+redoNew.id);assert.equal(own.report.user_id,freeReader.id);assert.equal(own.report.humanity,12);assert.equal(own.report.meditation,30);assert.equal(own.report.listening,'1.50');assert.equal(own.report.email,'free-reader@example.com');
 assert.equal((await request('redoReader','prayer:report',null,200,'&month='+pm+'&user_id='+freeReader.id)).report,null);
 for(const action of ['summary','csv','members'])await request('freeReader','prayer:'+action,null,403,'&month='+pm);
 let reportMail=JSON.parse(prayerLog().at(-1));assert.equal(reportMail.to,'free-reader@example.com');const plain=Buffer.from(reportMail.body.replace(/\s/g,''),'base64').toString();assert(plain.includes('聴く行：1.50 時間'));assert(plain.includes('prayer.php?month='+pm));assert(plain.includes('人類愛の祈り：12 回'));assert(!JSON.stringify(reportMail.headers).includes('attacker'));
 await request('freeReader','prayer:save',record,409); // A double click cannot duplicate records or send another email.
 await request('freeReader','prayer:receipt_retry',{month:pm},409);assert.equal(prayerLog().length,beforePrayer+1);
 let sum=await request('admin','prayer:summary',null,200,'&month='+pm);assert.equal(sum.total,2);assert.equal(sum.submitted,1);assert.equal(sum.totals.humanity,12);assert.equal(sum.totals.listening,'1.50');assert(sum.rows.some(r=>!r.id&&r.current_name==='REDO会員'));
 fs.writeFileSync(path.join(privateDir,'mail-fail'),'1');
 saved=await request('freeReader','prayer:save',{...record,revision:1,humanity:'20',listening:'0.25',reflection:'=HYPERLINK("https://example.invalid")'});assert.equal(saved.receipt_status,'failed');assert.equal(saved.revision,2);
 assert.equal((await request('freeReader','prayer:history')).reports.length,1);
 sum=await request('admin','prayer:summary',null,200,'&month='+pm);assert.equal(sum.submitted,1);assert.equal(sum.totals.humanity,20);assert.equal(sum.totals.listening,'0.25');
 fs.rmSync(path.join(privateDir,'mail-fail'));saved=await request('freeReader','prayer:receipt_retry',{month:pm});assert.equal(saved.receipt_status,'sent');
 const csv=await php.run({scriptPath:path.join(app,'prayer-api.php'),relativeUri:'/ku-fudo-chat/prayer-api.php?action=csv&month='+pm,protocol:'https',method:'GET',headers:{Host:'test.invalid',Cookie:jars.admin.cookie},$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web}});assert.equal(csv.httpStatusCode,200);assert(csv.text.includes("'=HYPERLINK"));assert(csv.text.includes('聴く行（時間）'));assert(csv.text.includes('未提出'));assert(JSON.stringify(csv.headers).includes('no-store'));assert(!csv.text.includes('Admin123'));
 // Suspended participation is enforced on every read/write, while the administrator retains totals.
 await request('admin','prayer:member_save',{...participant,enabled:0});
 await request('freeReader','prayer:report',null,403,'&month='+pm);await request('freeReader','prayer:history',null,403);await request('freeReader','prayer:save',{...record,revision:2},403);
 assert.equal((await request('admin','prayer:summary',null,200,'&month='+pm)).totals.humanity,20);
 await request('freeReader','feed',null,200,'&room=all'); // Participation changes never change chat membership.
 await request('admin','prayer:member_save',{...participant,end_month:prev});
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec("DELETE FROM limits WHERE bucket LIKE 'prayer-%'");`});
 await request('freeReader','prayer:save',{...record,revision:2},400);
 await request('freeReader','prayer:save',{...record,month:prev,humanity:'0',listening:'0',reflection:''});
 await request('admin','prayer:member_save',participant);
 assert.deepEqual((await request('freeReader','prayer:history')).reports.map(r=>r.month),[pm,prev]);
 // Pending receipt after a interrupted request can be resumed; uncertain sending is never resent.
 await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');$db->exec("UPDATE prayer_reports SET receipt_status='sending' WHERE user_id=${freeReader.id}");`});
 await request('freeReader','prayer:receipt_retry',{month:pm},409);
 // New users must change their temporary password even if already added as participants.
 const newPrayer=await request('admin','user_create',{login:'prayer-only@example.com',name:'一時テスト',role:'member'});
 await request('prayerNew','state');await request('prayerNew','login',{login:'prayer-only@example.com',password:newPrayer.temporary_password});
 await request('prayerNew','prayer:state',null,403);await request('prayerNew','password',{old_password:newPrayer.temporary_password,password:'Prayer-pass-88'});const newPrayerId=(await request('prayerNew','state')).user.id;
 await request('admin','prayer:member_save',{...participant,user_id:newPrayerId,number:'26'});await request('prayerNew','prayer:save',record);
 await request('admin','user_delete',{id:newPrayerId});await request('prayerNew','prayer:history',null,401);
 const removedPrayer=await php.run({code:`<?php $db=new PDO('sqlite:${privateDir}/chat.sqlite');echo json_encode([(int)$db->query('SELECT count(*) FROM prayer_members WHERE user_id=${newPrayerId}')->fetchColumn(),(int)$db->query('SELECT count(*) FROM prayer_reports WHERE user_id=${newPrayerId}')->fetchColumn()]);`});assert.deepEqual(JSON.parse(removedPrayer.text),[0,0]);
 const prayerPage=await php.run({scriptPath:path.join(app,'prayer.php'),relativeUri:'/ku-fudo-chat/prayer.php',protocol:'https',method:'GET',headers:{Host:'test.invalid',Cookie:jars.admin.cookie},$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web}});assert.equal(prayerPage.httpStatusCode,200);assert(prayerPage.text.includes('祈りの蓄積'));assert(prayerPage.text.includes('内容を確認する'));
 const prayerAnon=await php.run({scriptPath:path.join(app,'prayer.php'),relativeUri:'/ku-fudo-chat/prayer.php?month='+pm,protocol:'https',method:'GET',headers:{Host:'test.invalid'},$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web}});assert.equal(prayerAnon.httpStatusCode,302);assert(JSON.stringify(prayerAnon.headers).includes('./?prayer=1&month='+pm));

 for(const file of fs.readdirSync(app).filter(n=>n.endsWith('.php'))){const parsed=await php.run({code:`<?php token_get_all(file_get_contents(${JSON.stringify(path.join(app,file))}),TOKEN_PARSE);echo 'OK';`});assert.equal(parsed.text,'OK',file+' '+parsed.errors);}
 const redoPage=await php.run({scriptPath:path.join(app,'redo.php'),relativeUri:'/ku-fudo-chat/redo.php?id='+noMailIssue.id,protocol:'https',method:'GET',headers:{Host:'test.invalid',Cookie:jars.redoReader.cookie},$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web}});assert.equal(redoPage.httpStatusCode,200);assert(redoPage.text.includes('やりなおし会員・REDO MAIL'));
 const redoAnonPage=await php.run({scriptPath:path.join(app,'redo.php'),relativeUri:'/ku-fudo-chat/redo.php?id=614',protocol:'https',method:'GET',headers:{Host:'test.invalid'},$_SERVER:{HTTPS:'on',DOCUMENT_ROOT:web}});assert.equal(redoAnonPage.httpStatusCode,302);assert(JSON.stringify(redoAnonPage.headers).includes('./?redo=614'));
 const policy=await php.run({code:fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'policy-test.php'),'utf8').replace("dirname(__DIR__) . '/ku-fudo-chat/policy.php'",JSON.stringify(path.join(app,'policy.php')))});assert.equal(policy.exitCode,0);assert(policy.text.includes('PASS'));console.log(policy.text.trim());
 console.log(`PASS: ${passed} API checks plus room isolation, reply scoping, hidden content and persistence assertions.`);
}finally{php.exit();fs.rmSync(temp,{recursive:true,force:true});}

