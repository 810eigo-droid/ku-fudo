"use strict";
const checks = [...document.querySelectorAll('[data-lesson]')];
function updateProgress(){document.getElementById('progress-text').textContent=`視聴の目印：${checks.filter(c=>c.checked).length} / 6 本`;}
checks.forEach(check=>check.addEventListener('change',updateProgress));
window.addEventListener('pageshow',updateProgress);
const topButton=document.getElementById('back-to-top');
function updateTop(){topButton.hidden=window.scrollY<240;}
window.addEventListener('scroll',updateTop,{passive:true});
topButton.addEventListener('click',()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});document.querySelector('.brand').focus({preventScroll:true});});
updateTop();updateProgress();
