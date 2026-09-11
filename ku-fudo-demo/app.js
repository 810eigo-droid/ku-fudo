const topButton=document.getElementById('back-to-top');
const menu=document.querySelector('.sidebar');
function updateMenuOffset(){
 const mobile=window.matchMedia('(max-width:720px)').matches;
 const bar=mobile?menu:document.querySelector('.workspace>header');
 document.documentElement.style.setProperty('--menu-offset',Math.ceil(bar.getBoundingClientRect().height+14)+'px');
}
function updateTopButton(){topButton.hidden=window.scrollY<240;}
window.addEventListener('scroll',updateTopButton,{passive:true});
window.addEventListener('resize',updateMenuOffset);
if('ResizeObserver' in window){const observer=new ResizeObserver(updateMenuOffset);observer.observe(menu);observer.observe(document.querySelector('.workspace>header'));}
topButton.addEventListener('click',()=>{
 window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 const firstLink=menu.querySelector('nav a');
 firstLink.focus({preventScroll:true});
});
document.querySelectorAll('.sidebar nav a').forEach(link=>link.addEventListener('click',()=>{
 document.querySelectorAll('.sidebar nav a').forEach(item=>{item.classList.remove('active');item.removeAttribute('aria-current');});
 link.classList.add('active');link.setAttribute('aria-current','location');
}));
updateMenuOffset();updateTopButton();


const checks=[...document.querySelectorAll('[data-lesson]')];
function updateProgress(){
 const count=checks.filter(c=>c.checked).length;
 document.getElementById('progress-text').textContent=`視聴の目印：${count} / 6 本`;
 document.getElementById('count').textContent=count;
 document.getElementById('progress').value=count;
 document.getElementById('progress-note').textContent=count===6?'6本の視聴が完了しました。':count?'少しずつ、学びを積み重ねています。':'まずは一つ、始めてみましょう。';
 const next=checks.findIndex(c=>!c.checked);const link=document.getElementById('continue');
 link.href=next<0?'#curriculum':document.querySelectorAll('.watch')[next].href;
 link.textContent=count===6?'レッスンを振り返る →':count?'続きのレッスンを開く →':'最初のレッスンを開く →';
}
checks.forEach(c=>c.addEventListener('change',updateProgress));window.addEventListener('pageshow',updateProgress);updateProgress();
