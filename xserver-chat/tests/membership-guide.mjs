import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const elements=new Map();function elem(id){if(!elements.has(id))elements.set(id,{hidden:true,value:'',href:'',textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn;},focus(){this.focused=true;},select(){this.selected=true;}});return elements.get(id);}
const form=elem('inquiry-form');form.elements={topic:{value:'レインボークラブの受付・申込みについて'},name:{value:'山田 & <花子>'},message:{value:'会費・受付は？\nよろしくお願いします。'}};
let copied='';const context={document:{getElementById:elem},navigator:{clipboard:{async writeText(t){copied=t;}}},encodeURIComponent};
vm.runInNewContext(fs.readFileSync(process.argv[2] || new URL('../../ku-fudo-demo/membership.js',import.meta.url),'utf8'),context);
assert.equal(form.hidden,false);assert.equal(elem('prepare-mail').hidden,false);
let prevented=false;form.listeners.submit({preventDefault(){prevented=true;}});assert(prevented);assert.equal(elem('draft-result').hidden,false);
const url=new URL(elem('open-mail').href);assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'info@kembunsha.com');assert(url.searchParams.get('body').includes('山田 & <花子>'));assert(url.searchParams.get('body').includes('\nよろしく'));assert(elem('draft-status').textContent.includes('まだ送信されていません'));
await elem('copy-mail').listeners.click();assert.equal(copied,elem('draft-text').value);
context.navigator.clipboard.writeText=async()=>{throw Error('denied')};await elem('copy-mail').listeners.click();assert(elem('draft-text').selected);
form.listeners.input();assert.equal(elem('draft-result').hidden,true);
console.log('PASS: draft creation, encoded mailto, no false sent state, clipboard and fallback, stale draft hidden after edits.');
