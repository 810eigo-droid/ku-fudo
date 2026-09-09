const lessons=[
['学びを始める前に','この場所の使い方と、自分のペースで学ぶための準備。','8','学ぶ目的を整理し、動画・振り返り・交流という流れを確認します。','この学びを通して、どんなことを考えてみたいですか？'],
['自分を見つめる時間','日々の出来事から、自分の感じ方を振り返ります。','10','日常で印象に残った場面を一つ取り上げ、自分の言葉で整理します。','最近、心に残った出来事は何ですか？'],
['言葉と考え方の入り口','講座で扱う言葉に、少しずつ親しんでいきます。','12','先生が選んだ基本用語を確認するレッスンを想定しています。正式な説明は後から登録します。','意味をもう少し知りたい言葉はありますか？'],
['日常の中で振り返る','学んだ内容を、身近な経験と結びつけて考えます。','10','動画の内容と日常の経験を並べて考える、振り返りの練習を想定しています。','学んだこととつながる身近な経験はありますか？'],
['疑問を言葉にする','分からないことを整理して、交流の準備をします。','10','理解できた点と、先生に確認したい点を分けて整理します。','Zoomで先生に聞いてみたいことを一つ挙げると？'],
['これからの学びを選ぶ','入門を振り返り、次の学びにつなげます。','10','入門コースを振り返り、今後のテーマやZoom参加へのつなぎ方を確認します。','これから、どのようなテーマを深めたいですか？']
];
const done=new Set();let selected=0;const dialog=document.getElementById('lesson-dialog');
function render(){document.getElementById('lessons').innerHTML=lessons.map((l,i)=>`<button class="lesson" data-index="${i}"><div class="lesson-top"><span class="lesson-number">LESSON ${String(i+1).padStart(2,'0')}</span><span class="status ${done.has(i)?'done':''}">${done.has(i)?'✓ 完了':'未受講'}</span></div><h3>${l[0]}</h3><p>${l[1]}</p><div class="lesson-foot"><span>動画・振り返り ｜ 約${l[2]}分（仮）</span><span class="open">レッスンを開く →</span></div></button>`).join('');document.getElementById('count').textContent=done.size;document.getElementById('progress').value=done.size;document.getElementById('progress-note').textContent=done.size===6?'入門コースの体験が完了しました。':done.size?'少しずつ、学びを積み重ねています。':'まずは一つ、始めてみましょう。';document.getElementById('continue').textContent=done.size===6?'レッスンを振り返る →':done.size?'続きのレッスンを開く →':'最初のレッスンを開く →';}
function openLesson(i){selected=i;const l=lessons[i];document.getElementById('lesson-label').textContent=`LESSON ${String(i+1).padStart(2,'0')} · 仮のレッスン`;document.getElementById('dialog-title').textContent=l[0];document.getElementById('description').textContent=l[1];document.getElementById('objective').textContent=l[3];document.getElementById('question').textContent=l[4];document.getElementById('complete').textContent=done.has(i)?'完了済み · 一覧へ戻る':'学習を完了する →';dialog.showModal();document.body.classList.add('modal-open');dialog.scrollTop=0;}
document.getElementById('lessons').addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b)openLesson(Number(b.dataset.index));});
document.getElementById('continue').onclick=()=>openLesson(lessons.findIndex((_,i)=>!done.has(i))<0?0:lessons.findIndex((_,i)=>!done.has(i)));
document.getElementById('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>document.body.classList.remove('modal-open'));document.getElementById('complete').onclick=()=>{done.add(selected);render();dialog.close();};render();
