const progress=document.getElementById('progress');
const updateProgress=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.style.width=(max>0?Math.min(100,100*scrollY/max):0)+'%';};
addEventListener('scroll',updateProgress,{passive:true});addEventListener('resize',updateProgress);addEventListener('load',updateProgress);
const menu=document.getElementById('menu');menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.open=false));
document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')menu.open=false;});
const panels=[...document.querySelectorAll('.panel')];
const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){document.getElementById('position').textContent=e.target.id.replace('panel-','')+' / 10';}});},{rootMargin:'-15% 0px -50% 0px',threshold:0});panels.forEach(p=>observer.observe(p));
function notify(message){const t=document.getElementById('toast');t.textContent=message;t.style.display='block';setTimeout(()=>t.style.display='none',2800);}
async function share(){const url=new URL(location.href);url.hash='';const data={title:'空不動先生の「統一行」｜全10コマの縦読みマンガ',url:url.href};if(navigator.share){try{await navigator.share(data);return;}catch(e){if(e.name==='AbortError')return;}}try{await navigator.clipboard.writeText(data.url);notify('共有URLをコピーしました');}catch{const d=document.getElementById('share-dialog');document.getElementById('share-url').value=data.url;d.showModal();}}
document.querySelectorAll('.share').forEach(b=>b.addEventListener('click',share));document.getElementById('select-url').addEventListener('click',()=>{const input=document.getElementById('share-url');input.focus();input.select();});
