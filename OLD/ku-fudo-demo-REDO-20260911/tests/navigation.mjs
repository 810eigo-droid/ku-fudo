import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function page(hash=''){
 const events=new Map(),nodes=new Map();
 function node(id){if(nodes.has(id))return nodes.get(id);const listeners={};const n={open:false,hidden:false,style:{setProperty(){}},classList:{add(){},remove(){}},focus(){},getBoundingClientRect(){return {height:52};},querySelector(){return node('first-link');},addEventListener(type,fn){(listeners[type]??=[]).push(fn);},emit(type,event={}){for(const fn of listeners[type]??[])fn(event);},showModal(){this.open=true;},close(){this.open=false;this.emit('close');}};nodes.set(id,n);return n;}
 const location={pathname:'/ku-fudo-demo/index.html',search:'',hash};
 const stack=[{state:null,hash}],history={index:0,get state(){return stack[this.index].state;},pushState(state,_,url){stack.splice(this.index+1);stack.push({state,hash:url.includes('#')?'#'+url.split('#')[1]:''});this.index++;location.hash=stack[this.index].hash;},replaceState(state,_,url){stack[this.index]={state,hash:url.includes('#')?'#'+url.split('#')[1]:''};location.hash=stack[this.index].hash;},go(delta){if(this.index+delta<0||this.index+delta>=stack.length)return;this.index+=delta;location.hash=stack[this.index].hash;for(const fn of events.get('popstate')??[])fn({state:this.state});},back(){this.go(-1);},forward(){this.go(1);}};
 const document={getElementById:node,querySelector:node,querySelectorAll(){return [];},body:node('body'),documentElement:node('html')};
 const window={scrollY:640,matchMedia(){return {matches:false};},addEventListener(type,fn){const list=events.get(type)??[];list.push(fn);events.set(type,list);},scrollTo({top}){this.scrollY=top;}};
 const context=vm.createContext({document,window,history,location,requestAnimationFrame:fn=>fn()});vm.runInContext(source,context);
 return {context,node,history,location,window};
}
const p=page();vm.runInContext('openLesson(2)',p.context);assert(p.node('lesson-dialog').open);assert.equal(p.location.hash,'#lesson-3');
p.history.back();assert(!p.node('lesson-dialog').open);assert.equal(p.window.scrollY,640);
p.history.forward();assert(p.node('lesson-dialog').open);p.node('close').onclick();assert(!p.node('lesson-dialog').open);assert.equal(p.history.index,0);
vm.runInContext('openLesson(1)',p.context);p.node('complete').onclick();assert(!p.node('lesson-dialog').open);assert(vm.runInContext('done.has(1)',p.context));assert.equal(p.history.index,0);
vm.runInContext('openLesson(4)',p.context);let prevented=false;p.node('lesson-dialog').emit('cancel',{preventDefault(){prevented=true;}});assert(prevented);assert(!p.node('lesson-dialog').open);assert.equal(p.history.index,0);
const deep=page('#lesson-4');assert(deep.node('lesson-dialog').open);deep.history.back();assert.equal(deep.location.hash,'#curriculum');assert(!deep.node('lesson-dialog').open);
console.log('PASS: lesson Back/Forward, close, completion, Escape, deep-link return and list scroll restoration');
