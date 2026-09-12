"use strict";
// Only an explicit send or continue action starts processing. Opening a result never sends mail.
document.addEventListener('submit', async event => {
 const form=event.target, button=event.submitter;
 if(!button || !['send','batch','retry'].includes(button.value) || button.name!=='action') return;
 event.preventDefault();
 const status=document.getElementById('mail-progress');status.hidden=false;
 const data=new URLSearchParams(new FormData(form)); data.set('action',button.value);
 const id=data.get('id');let payload=data;
 const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try {
  for(;;){
   status.textContent='メールを送信しています。この画面を開いたままお待ちください。';
   const response=await fetch('mail-center.php',{method:'POST',body:payload,credentials:'same-origin'});
   const text=await response.text();if(!response.ok)throw new Error('送信処理が停止しました。');
   const page=new DOMParser().parseFromString(text,'text/html');
   const next=page.querySelector('button[name="action"][value="batch"]');
   if(!next){location.href='mail-center.php?id='+encodeURIComponent(id);break;}
   payload=new URLSearchParams(new FormData(next.form));payload.set('action','batch');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 } catch(error){
  status.textContent='通信または送信処理が中断しました。配信履歴で結果を確認してください。送信済みの分は再送しません。';
  const link=document.createElement('a');link.href='mail-center.php?id='+encodeURIComponent(id);link.textContent='配信結果を確認する';status.append(' ',link);
 }
});
