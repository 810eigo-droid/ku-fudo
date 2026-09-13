const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.resolve(process.argv[2]||'/tmp/menu-test/node_modules/jsdom'));
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(root+'/ku-fudo-demo/site-nav.js','utf8');
for(const page of ['index.html','meditation.html','curriculum.html']){
const dom=new JSDOM(fs.readFileSync(root+'/ku-fudo-demo/'+page,'utf8'),{url:'https://example.com/ku-fudo-demo/'+page,runScripts:'outside-only'}),w=dom.window,d=w.document;
Object.defineProperty(d,'currentScript',{value:{src:'https://example.com/ku-fudo-demo/site-nav.js'}});
w.matchMedia=()=>({matches:true,addEventListener(){}});let scroll=null;w.scrollTo=x=>scroll=x;
w.eval(code);assert(d.querySelector('.sn-bar'));if(page!=='curriculum.html')assert(d.querySelector('.sn-local-aside'));assert.equal(d.querySelectorAll('.sn-top').length,1);
const menu=d.querySelector('.sn-menu');menu.open=true;menu.dispatchEvent(new w.Event('toggle'));assert.equal(d.querySelector('summary').getAttribute('aria-expanded'),'true');
assert(d.querySelector('.sn-links a[href="https://example.com/ku-fudo-demo/meditation.html"]'));
d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert(!menu.open);
Object.defineProperty(w,'scrollY',{value:500});w.dispatchEvent(new w.Event('scroll'));assert(!d.querySelector('.sn-top').hidden);d.querySelector('.sn-top').click();assert.equal(scroll.top,0);
if(page==='index.html'){assert.equal(d.querySelectorAll('.entrance-link').length,6);assert.equal(d.querySelectorAll('input[data-lesson]').length,6);}
assert(!d.querySelector('a[href*="pwd="]'));dom.window.close();
}
const dom=new JSDOM('<nav><a href="?tab=members">会員検索</a><a href="?tab=hidden" hidden>非公開</a></nav>',{url:'https://example.com/ku-fudo-chat/admin-search.php',runScripts:'outside-only'}),w=dom.window,d=w.document;
Object.defineProperty(d,'currentScript',{value:{src:'https://example.com/ku-fudo-chat/site-nav.js'}});w.matchMedia=()=>({matches:true,addEventListener(){}});w.eval(code);
const menu=d.querySelector('.sn-menu');menu.open=true;menu.dispatchEvent(new w.Event('toggle'));assert(d.querySelector('.sn-extras').textContent.includes('会員検索'));assert(!d.querySelector('.sn-extras').textContent.includes('非公開'));d.querySelector('.sn-close').click();assert(!menu.open);dom.window.close();
console.log('PASS: 3 public pages, preserved cards/lessons, menu open/close, page-specific links, hidden-link exclusion, return-to-top');
