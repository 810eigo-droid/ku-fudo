(()=>{'use strict';
const form=document.getElementById('inquiry-form');
const prepare=document.getElementById('prepare-mail');
const result=document.getElementById('draft-result');
const draft=document.getElementById('draft-text');
const mail=document.getElementById('open-mail');
const status=document.getElementById('draft-status');
const address='info@kembunsha.com';
form.hidden=false;
prepare.hidden=false;
form.addEventListener('submit',event=>{
 event.preventDefault();
 const topic=form.elements.topic.value;
 const name=form.elements.name.value.trim();
 const message=form.elements.message.value.trim();
 const subject='【学びと実践の相談】'+topic;
 const body=['献文舎・読者連絡室 ご担当者様','',topic+'について、ご案内をお願いいたします。','現在の受付状況・参加条件・費用・申込み方法を教えていただけますでしょうか。','',message||'初めて学びます。参加までの流れを確認したく、ご連絡しました。','',name?'お名前：'+name:'お名前：［送信前にご記入ください］'].join('\n');
 draft.value='件名：'+subject+'\n\n'+body;
 mail.href='mailto:'+address+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 result.hidden=false;
 status.textContent='相談文を作成しました。まだ送信されていません。内容を確認し、メールアプリで送信してください。';
 draft.focus();
});
document.getElementById('copy-mail').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(draft.value);status.textContent='文面をコピーしました。宛先は '+address+' です。';}
 catch{draft.focus();draft.select();status.textContent='文面を選択しました。コピーしてメールに貼り付けてください。';}
});
document.querySelectorAll('[data-inquiry-topic]').forEach(link=>{link.addEventListener('click',()=>{
 const topic=link.dataset.inquiryTopic;
 if(Array.from(form.elements.topic.options).some(option=>option.value===topic)){form.elements.topic.value=topic;result.hidden=true;status.textContent='レインボークラブについての相談を選択しました。必要に応じて内容を入力してください。';}
});});
form.addEventListener('input',()=>{if(!result.hidden){result.hidden=true;status.textContent='内容を変更しました。「相談メールの文面を作る」をもう一度押してください。';}});
})();
