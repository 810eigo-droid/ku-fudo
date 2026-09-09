'use strict';
const $=id=>document.getElementById(id);
const roleNames={member:'一般会員',candidate:'理事候補',director:'理事',admin:'管理者'};
let user=null,csrf='',room='all',oldest=0,requestGeneration=0,loadingFeed=false,posting=false,viewingHistory=false;
const postForm=$('post-form');
let pendingInvite=new URLSearchParams(location.hash.slice(1)).get('invite')??'';
let credentialText='';
// Keep the credential out of subsequent requests, referrers, history and bookmarks.
if(new URLSearchParams(location.hash.slice(1)).has('invite'))history.replaceState(null,'',location.pathname+location.search);
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function clearPrivate(){requestGeneration++;user=null;['chat-panel','account','admin-panel','navigation'].forEach(id=>$(id).hidden=true);['messages','events','users','identity'].forEach(id=>$(id).replaceChildren());$('email-form').reset();$('password-form').reset();postForm.reset();clearReply();$('credential').textContent='';$('credential-user').textContent='';credentialText='';if($('credential-dialog').open)$('credential-dialog').close();}
async function api(action,data,query=''){
 const res=await fetch('api.php?action='+encodeURIComponent(action)+query,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{},body:data?JSON.stringify(data):undefined});
 let json;try{json=await res.json();}catch{throw new Error('サーバーの応答を読み取れません。PHPと設置場所を確認してください。');}
 if(!res.ok){if(res.status===401){clearPrivate();$('login-panel').hidden=false;}if(res.status===403&&action==='feed'){clearPrivate();$('login-panel').hidden=false;}throw new Error(json.error||'通信できませんでした。');}
 if(json.csrf)csrf=json.csrf;return json;
}
async function start(){
 const data=await api('state');user=data.user;
 if(pendingInvite){clearPrivate();$('login-panel').hidden=true;$('setup-panel').hidden=true;$('invite-panel').hidden=false;$('invite-form').hidden=!!data.user;$('invite-existing').hidden=!data.user;$('invite-identity').textContent=data.user?data.user.name+' さんとしてログイン中です。':'';status('');return;}
 $('invite-panel').hidden=true;
 $('login-panel').hidden=!!user||data.setup;$('setup-panel').hidden=!data.setup;
 if(!user){clearPrivate();status(data.setup?'設置担当者が初期設定を行ってください。':'ログインしてご利用ください。');return;}
 $('account').hidden=false;$('identity').textContent=user.name+' さん ／ '+roleNames[user.role]+' ／ '+user.login;
 const required=Number(user.must_change)===1;$('password-required').hidden=!required;$('password-details').open=required;$('email-details').hidden=required||user.link_login;$('password-details').hidden=!!user.link_login;$('link-account-note').hidden=!user.link_login;
 $('chat-panel').hidden=required;$('navigation').hidden=required;$('admin-panel').hidden=required||user.role!=='admin';
 $('board-button').hidden=user.role==='member';$('kind-label').hidden=user.role!=='admin';
 if(required){status('初回パスワードを変更してください。');return;}
 if(user.role==='member')room='all';setRoomLabels();await feed();if(user.role==='admin')await loadUsers();
}
function setRoomLabels(){const title=room==='all'?'全体チャット':'理事＆理事候補チャット';$('room-title').textContent=title;$('post-room').textContent='送信先：'+title;$('room-description').textContent=room==='all'?'一般会員・理事候補・理事が参加する、お知らせと交流の場です。':'理事・理事候補・管理者だけが閲覧・投稿できます。';document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.room===room)));}
function zoomLink(url){const a=node('a','Zoomに参加','zoom-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function localDate(value){return value.replace('T',' ');}
function showEvents(events){$('events').replaceChildren();if(!events.length){$('events').append(node('p','現在、予定されているZoomはありません。','empty'));return;}for(const e of events){const row=node('div',undefined,'event');const info=node('div');info.append(node('b',e.title),node('div',localDate(e.event_at)+' ／ '+(e.area||'地区指定なし'),'event-meta'));row.append(info);if(e.zoom_url)row.append(zoomLink(e.zoom_url));$('events').append(row);}}
function messageCard(m){const card=node('article',undefined,'message '+(m.kind==='notice'?'notice':''));card.dataset.id=m.id;const top=node('div',undefined,'message-top');const author=node('span',m.name,'author');if(m.kind==='notice')author.append(node('span','献文舎からのお知らせ','badge'));top.append(author);const time=node('time',new Date(Number(m.created_at)*1000).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' JST');time.dateTime=new Date(Number(m.created_at)*1000).toISOString();top.append(time);card.append(top);
 if(Number(m.hidden)){card.append(node('p','この投稿は取り下げられました。','empty'));return card;}
 if(m.parent_id)card.append(node('blockquote','返信先 #'+m.parent_id+'：'+(m.parent_preview||'投稿')));
 if(m.title)card.append(node('h3',m.title));if(m.area||m.event_at)card.append(node('p',[m.area,localDate(m.event_at)].filter(Boolean).join(' ／ '),'event-meta'));
 card.append(node('p',m.body,'message-body'));if(m.zoom_url)card.append(zoomLink(m.zoom_url));const actions=node('div',undefined,'message-actions');const reply=node('button','返信');reply.type='button';reply.onclick=()=>{$('reply-to').hidden=false;$('reply-label').textContent=m.name+'さんへの返信：'+m.body.slice(0,100);postForm.elements.parent_id.value=m.id;$('composer').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});postForm.elements.body.focus({preventScroll:true});};actions.append(reply);
 if(user.role==='admin'||Number(m.user_id)===Number(user.id)){const hide=node('button','取り下げる');hide.type='button';hide.onclick=async()=>{if(!confirm('この投稿を取り下げますか？会員画面から非表示になります。'))return;hide.disabled=true;try{await api('hide',{id:Number(m.id),room});await feed();}catch(e){status(e.message,true);}finally{hide.disabled=false;}};actions.append(hide);}card.append(actions);return card;}
async function feed(older=false){
 if(loadingFeed||!user)return;loadingFeed=true;const generation=requestGeneration;const selectedRoom=room;
 try{const result=await api('feed',null,'&room='+selectedRoom+(older?'&before='+oldest:''));if(generation!==requestGeneration||selectedRoom!==room)return;
 user=result.user;viewingHistory=older;if(!older)$('messages').replaceChildren();for(const m of result.messages)$('messages').append(messageCard(m));
 if(!$('messages').children.length)$('messages').append(node('p','まだ投稿はありません。最初のメッセージを投稿しましょう。','empty'));
 if(result.messages.length)oldest=Number(result.messages[result.messages.length-1].id);$('older').hidden=!result.more;showEvents(result.events);status('');
 }finally{loadingFeed=false;}
}
function clearReply(){$('reply-to').hidden=true;$('reply-label').textContent='';postForm.elements.parent_id.value='0';}
function noticeFields(){const notice=postForm.elements.kind.value==='notice';$('notice-fields').hidden=!notice;postForm.elements.title.required=notice;}
function formData(form){return Object.fromEntries(new FormData(form));}
function bindForm(id,handler){const form=$(id);form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button[type=submit],button:not([type])');if(button?.disabled)return;if(button)button.disabled=true;try{await handler(form);}catch(err){status(err.message,true);}finally{if(button)button.disabled=false;}});}
bindForm('invite-form',async form=>{await api('link_login',{token:pendingInvite,remember:form.elements.remember.checked});pendingInvite='';await start();status('チャットに入りました。このページをブックマークすると、次回も開きやすくなります。');});
$('invite-current').onclick=()=>{pendingInvite='';start().catch(e=>status(e.message,true));};
$('invite-cancel').onclick=()=>{pendingInvite='';start().catch(e=>status(e.message,true));};
$('invite-switch').onclick=async()=>{try{await api('logout',{});clearPrivate();await start();}catch(e){status(e.message,true);}};
bindForm('login-form',async form=>{await api('login',formData(form));form.reset();await start();});
bindForm('setup-form',async form=>{await api('setup',formData(form));form.reset();await start();status('初期設定が完了しました。config.phpの初期設定キーを空に戻してください。');});
bindForm('password-form',async form=>{await api('password',formData(form));form.reset();await start();status('パスワードを変更しました。');});
bindForm('email-form',async form=>{const data=formData(form);if(!confirm('ログイン用メールアドレスを '+data.login.trim()+' に変更します。よろしいですか？'))return;await api('email',data);form.reset();await start();status('ログイン用メールアドレスを変更しました。次回から新しいメールアドレスでログインしてください。');});
bindForm('post-form',async form=>{posting=true;const selected=room;try{await api('post',{...formData(form),room:selected});form.reset();clearReply();noticeFields();await feed();status('投稿しました。');}finally{posting=false;}});
function showCredential(label,password){$('credential-heading').textContent='仮パスワードを発行しました';$('credential-description').textContent='この画面を閉じると再表示できません。本人に個別に伝えてください。';$('credential-user').textContent=label;$('credential').textContent=password;$('credential-note').textContent='初回ログイン時に8文字以上のパスワードへ変更が必要です。';credentialText=label+'\n仮パスワード：'+password+'\nログイン先：'+new URL('./',location.href).href+'\n初回ログイン時に8文字以上のパスワードへ変更してください。';$('credential-dialog').showModal();}
function showLoginLink(name,result){const url=new URL('./',location.href);url.hash='invite='+result.login_token;$('credential-heading').textContent='本人専用リンクを発行しました';$('credential-description').textContent='「案内文をコピー」を押し、LINEやメールで本人に個別に送ってください。';$('credential-user').textContent=name+' さん専用';$('credential').textContent=url.href;$('credential-note').textContent='発行から3日間・1回限り有効です。全体のグループには送らないでください。';credentialText=name+'さん\n会員チャットのご案内です。\n\n① 下の専用リンクを開いてください。\n'+url.href+'\n\n②「チャットに入る」を押してください。\nメールアドレスやパスワードの入力は不要です。\n\n発行から3日以内に、ご自身のスマホ・パソコンで開いてください。入室後のページをブックマークすると、次回から同じブラウザで開けます。\nこのリンクはご本人専用です。他の方には転送しないでください。';$('credential-dialog').showModal();}
$('credential-copy').onclick=async()=>{try{await navigator.clipboard.writeText(credentialText);$('credential-note').textContent='コピーしました。本人へのLINEやメールに貼り付けて送ってください。';}catch{const range=document.createRange();range.selectNodeContents($('credential'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);$('credential-note').textContent='自動コピーができませんでした。選択されたリンク・パスワードをコピーし、本人に個別に送ってください。';}};
bindForm('user-form',async form=>{const data=formData(form);if(data.role==='admin'&&!confirm('管理者は会員管理と両方のチャット操作ができます。追加しますか？'))return;data.use_link=data.role!=='admin'&&data.access_method==='link';delete data.access_method;const result=await api('user_create',data);if(result.login_token)showLoginLink(data.name,result);else showCredential('メールアドレス：'+data.login,result.temporary_password);form.reset();await loadUsers();});
async function loadUsers(){const result=await api('users');$('users').replaceChildren();for(const u of result.users){const row=node('div',undefined,'user-row');row.append(node('b',u.name+' ／ '+u.login));if(Number(u.id)===Number(user.id)){row.append(node('small','自分のアカウント'));$('users').append(row);continue;}
 const fields=node('div',undefined,'fields');const roleLabel=node('label','権限');const select=node('select');for(const [key,label] of Object.entries(roleNames)){const option=node('option',label);option.value=key;select.append(option);}select.value=u.role;roleLabel.append(select);const activeLabel=node('label','利用状態');const active=node('select');for(const [key,label] of [['1','有効'],['0','停止']]){const o=node('option',label);o.value=key;active.append(o);}active.value=String(u.active);activeLabel.append(active);fields.append(roleLabel,activeLabel);row.append(fields);const actions=node('div',undefined,'user-actions');const save=node('button','設定を保存','secondary');save.type='button';save.onclick=async()=>{if(!confirm(u.name+'さんの権限・利用状態を変更します。ログイン中のセッションも無効になります。よろしいですか？'))return;save.disabled=true;try{await api('user_update',{id:Number(u.id),role:select.value,active:Number(active.value)});status('会員設定を更新しました。');await loadUsers();}catch(e){status(e.message,true);}finally{save.disabled=false;}};const reset=node('button','仮パスワードを再発行','secondary');reset.type='button';reset.onclick=async()=>{if(!confirm(u.name+'さんのパスワードを再発行しますか？現在のパスワードは使えなくなります。'))return;reset.disabled=true;try{const r=await api('user_reset',{id:Number(u.id)});showCredential((u.login.includes('@')?'メールアドレス：':'従来のID：')+u.login,r.temporary_password);}catch(e){status(e.message,true);}finally{reset.disabled=false;}};actions.append(save,reset);if(u.role!=='admin'&&Number(u.active)){const invite=node('button','専用リンクを発行','primary');invite.type='button';invite.onclick=async()=>{if(!confirm(u.name+'さんの本人専用リンクを発行します。以前の未使用リンクは無効になります。よろしいですか？'))return;invite.disabled=true;try{const result=await api('user_link',{id:Number(u.id)});showLoginLink(u.name,result);}catch(e){status(e.message,true);}finally{invite.disabled=false;}};actions.prepend(invite);}row.append(actions);$('users').append(row);}}
$('credential-close').onclick=()=>$('credential-dialog').close();$('credential-dialog').addEventListener('close',()=>{$('credential').textContent='';$('credential-user').textContent='';credentialText='';});
$('cancel-reply').onclick=clearReply;postForm.elements.kind.addEventListener('change',noticeFields);
document.querySelectorAll('[data-room]').forEach(button=>button.addEventListener('click',async()=>{if(loadingFeed||posting||room===button.dataset.room)return;if(postForm.elements.body.value&&!confirm('投稿先を切り替えると入力中の文章が消えます。切り替えますか？'))return;room=button.dataset.room;requestGeneration++;oldest=0;postForm.reset();clearReply();noticeFields();$('messages').replaceChildren();$('events').replaceChildren();setRoomLabels();try{await feed();}catch(e){status(e.message,true);}}));
$('refresh').onclick=()=>feed().catch(e=>status(e.message,true));$('older').onclick=()=>feed(true).catch(e=>status(e.message,true));
$('logout').onclick=async()=>{try{await api('logout',{});clearPrivate();await start();}catch(e){status(e.message,true);}};
setInterval(()=>{if(user&&!Number(user.must_change)&&!document.hidden&&!$('credential-dialog').open&&!$('messages').contains(document.activeElement)){if(!viewingHistory)feed().catch(e=>status(e.message,true));else api('state').then(s=>{if(!s.user){clearPrivate();$('login-panel').hidden=false;status('ログインし直してください。',true);}}).catch(e=>status(e.message,true));}},20000);
window.addEventListener('pageshow',event=>{if(event.persisted){clearPrivate();start().catch(e=>status(e.message,true));}});
const topButton=$('top');window.addEventListener('scroll',()=>{topButton.hidden=scrollY<240;},{passive:true});topButton.onclick=()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});document.querySelector('.brand').focus({preventScroll:true});};
if('ResizeObserver'in window)new ResizeObserver(()=>document.documentElement.style.setProperty('--menu-height',($('navigation').getBoundingClientRect().height+14)+'px')).observe($('navigation'));
start().catch(e=>status(e.message,true));

