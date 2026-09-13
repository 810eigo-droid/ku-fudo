(()=>{'use strict';
const source=document.currentScript.src,root=new URL('../',source);
const url=p=>new URL(p,root).href;
const localNavs=[...document.querySelectorAll('nav')];
localNavs.forEach(n=>n.classList.add('sn-local-nav'));
for(const n of localNavs){const aside=n.closest('aside');if(aside)aside.classList.add('sn-local-aside');}
const bar=document.createElement('div');bar.className='sn-bar';
const home=document.createElement('a');home.className='sn-home';home.href=url('ku-fudo-demo/');home.textContent='トップへ';bar.append(home);
const menu=document.createElement('details');menu.className='sn-menu';
const summary=document.createElement('summary');summary.textContent='☰ メニュー';summary.setAttribute('aria-controls','sn-panel');menu.append(summary);
const panel=document.createElement('div');panel.id='sn-panel';panel.className='sn-panel';
const mainNav=document.createElement('nav');mainNav.setAttribute('aria-label','サイトメニュー');mainNav.className='sn-links';
const links=[['ku-fudo-demo/','トップページ'],['ku-fudo-demo/meditation.html','瞑想の会'],['ku-fudo-chat/mypage.php','マイページ'],['ku-fudo-chat/','チャット'],['ku-fudo-chat/?room=all#zoom-schedule','Zoom会議の予定'],['ku-fudo-demo/#curriculum','カリキュラム'],['ku-fudo-chat/redo.php','REDO MAIL'],['ku-fudo-chat/prayer.php','祈りの蓄積'],['ku-fudo-chat/?account=1#account','アカウント']];
for(const [p,t] of links){const a=document.createElement('a');a.href=url(p);a.textContent=t;mainNav.append(a);}
panel.append(mainNav);const extras=document.createElement('nav');extras.className='sn-links sn-extras';extras.setAttribute('aria-label','このページのメニュー');panel.append(extras);
const close=document.createElement('button');close.type='button';close.className='sn-close';close.textContent='メニューを閉じる';close.addEventListener('click',()=>{menu.open=false;summary.focus();});panel.append(close);menu.append(panel);bar.append(menu);document.body.prepend(bar);
function refresh(){extras.replaceChildren();const seen=new Set([...mainNav.querySelectorAll('a')].map(a=>a.href));for(const n of localNavs){if(n.closest('[hidden]'))continue;for(const a of n.querySelectorAll('a[href]')){if(a.closest('[hidden]')||seen.has(a.href))continue;const copy=document.createElement('a');copy.href=a.href;const label=a.querySelector('.nav-long');copy.textContent=(label||a).textContent.trim();extras.append(copy);seen.add(a.href);}}extras.hidden=!extras.childElementCount;}
menu.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(menu.open));if(menu.open)refresh();});
panel.addEventListener('click',e=>{if(e.target.closest('a')){menu.open=false;summary.focus();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;summary.focus();}});
document.addEventListener('click',e=>{if(menu.open&&!bar.contains(e.target))menu.open=false;});
const media=matchMedia('(max-width: 720px)');media.addEventListener('change',()=>{if(!media.matches)menu.open=false;});
const top=document.createElement('button');top.type='button';top.className='sn-top';top.textContent='↑ 上へ';top.setAttribute('aria-label','ページの先頭へ戻る');top.hidden=true;document.body.append(top);
function update(){top.hidden=window.scrollY<240;}window.addEventListener('scroll',update,{passive:true});update();
top.addEventListener('click',()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});const target=document.querySelector('main h1,h1');if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}});
document.documentElement.classList.add('sn-ready');
})();