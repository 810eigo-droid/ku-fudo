"use strict";
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

