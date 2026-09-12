<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$u=currentUser();$ready=$u && !(int)$u['must_change'];
function opsBoard(array $u):bool {return in_array($u['role'],['admin','director','candidate'],true);}
function opsGrant(int $id):?array {$r=query('SELECT area FROM notice_editors WHERE user_id=? AND enabled=1',[$id])->fetch();return $r?:null;}
function opsUrl(array $d):string {$v=value($d,'url',1500);if($v!=='' && (!filter_var($v,FILTER_VALIDATE_URL)||parse_url($v,PHP_URL_SCHEME)!=='https'||parse_url($v,PHP_URL_USER)!==null||parse_url($v,PHP_URL_PASS)!==null)){fail('リンクはhttps://から始まるURLにしてください。');}return $v;}
function opsDate(array $d,string $key,string $format):string {$v=value($d,$key,16,true);$x=DateTimeImmutable::createFromFormat('!'.$format,$v);if(!$x||$x->format($format)!==$v){fail('日付・時刻を確認してください。');}return $v;}
function opsFields(array $data):array {
 $out=[];foreach(['start_time'=>5,'end_time'=>5,'participants'=>4000,'chair'=>100,'secretary'=>100,'host'=>100,'program'=>4000,'next_meeting'=>2000,'other'=>4000] as $k=>$max){$out[$k]=value($data,$k,$max);}
 foreach(['start_time','end_time'] as $k){if($out[$k]!==''&&!preg_match('/\A(?:[01][0-9]|2[0-3]):[0-5][0-9]\z/D',$out[$k])){fail('時刻を確認してください。');}}
 if($out['start_time']!==''&&$out['end_time']!==''&&$out['end_time']<$out['start_time']){fail('終了時刻は開始時刻以降にしてください。');}
 $topics=$data['topics']??[];if(!is_array($topics)||count($topics)>30){fail('議題は30件以内にしてください。');}$out['topics']=[];
 foreach($topics as $t){if(!is_array($t)){fail('議題の形式を確認してください。');}$x=[];foreach(['title'=>200,'content'=>5000,'decision'=>2000,'owner'=>200,'deadline'=>100] as $k=>$max){$x[$k]=value($t,$k,$max);}if(implode('',$x)!==''){$out['topics'][]=$x;}}
 if(strlen(json_encode($out,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))>120000){fail('全体の入力内容が多すぎます。議事録を分けて保存してください。');}return $out;
}
function opsBody(array $f):string {
 $labels=['participants'=>'参加者','chair'=>'司会','secretary'=>'書記','host'=>'Zoomホスト','program'=>'式次第'];$parts=[];
 if($f['start_time']!==''||$f['end_time']!==''){$parts[]='開催時刻：'.$f['start_time'].' ～ '.$f['end_time'];}
 foreach($labels as $k=>$label){if($f[$k]!==''){$parts[]=$label."：\n".$f[$k];}}
 foreach($f['topics'] as $i=>$t){$txt='議題 '.($i+1).'：'.$t['title'];foreach(['content'=>'内容','decision'=>'決定事項','owner'=>'担当者','deadline'=>'対応期限'] as $k=>$label){if($t[$k]!==''){$txt.="\n".$label.'：'.$t[$k];}}$parts[]=$txt;}
 foreach(['next_meeting'=>'次回の予定','other'=>'その他・連絡事項'] as $k=>$label){if($f[$k]!==''){$parts[]=$label."：\n".$f[$k];}}
 return implode("\n\n",$parts);
}
if($ready){
 $db->exec("CREATE TABLE IF NOT EXISTS notice_editors(user_id INTEGER PRIMARY KEY REFERENCES users(id),area TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)))");
 $db->exec("CREATE TABLE IF NOT EXISTS meeting_minutes(id INTEGER PRIMARY KEY,title TEXT NOT NULL,meeting_on TEXT NOT NULL,body TEXT NOT NULL,resource_url TEXT NOT NULL DEFAULT '',details_json TEXT NOT NULL DEFAULT '{}',published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),author_id INTEGER NOT NULL REFERENCES users(id),updated_by INTEGER NOT NULL REFERENCES users(id),revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL)");
 $columns=$db->query('PRAGMA table_info(meeting_minutes)')->fetchAll(PDO::FETCH_COLUMN,1);if(!in_array('details_json',$columns,true)){$db->exec("ALTER TABLE meeting_minutes ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}'");}
}
$board=$ready&&opsBoard($u);$admin=$ready&&$u['role']==='admin';$grant=$ready?opsGrant((int)$u['id']):null;
$notice=$ready&&($admin||($grant&&(int)($u['chat_access']??1)===1));
if(($_GET['access']??'')==='1'){output(['board'=>$board,'notice'=>(bool)$notice,'admin'=>$admin]);}
$error='';$draft=null;
$tab=$_GET['tab']??'minutes';if(!is_string($tab)||!in_array($tab,['minutes','notice','editors'],true)){fail('ページが見つかりません。',404);}
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
 if(!$ready){fail('ログインしてください。',401);}
 if(!is_string($_POST['csrf']??null)||!hash_equals($_SESSION['csrf'],$_POST['csrf'])){fail('再読み込みしてから操作してください。',403);}
 $action=value($_POST,'action',20,true);
 $db->beginTransaction();query('UPDATE users SET version=version WHERE id=?',[$u['id']]);$u=requireUser();
 if((int)$u['must_change']){$db->rollBack();fail('パスワードを変更してください。',403);}
 if($action==='editor'){
  requireAdmin($u);$id=filter_var($_POST['user_id']??'',FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
  if(!$id||!query('SELECT 1 FROM users WHERE id=? AND active=1 AND deleted_at=0',[$id])->fetchColumn()){$db->rollBack();fail('有効な会員を選んでください。');}
  $enabled=isset($_POST['enabled'])?1:0;$area=value($_POST,'area',60,$enabled===1);
  query('INSERT INTO notice_editors(user_id,area,enabled) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET area=excluded.area,enabled=excluded.enabled',[$id,$area,$enabled]);audit((int)$u['id'],'notice_editor',$id);$db->commit();header('Location: operations.php?tab=editors&saved=1',true,303);exit;
 }
 if($action==='notice'){
  $g=opsGrant((int)$u['id']);if($u['role']!=='admin'&&(!$g||(int)($u['chat_access']??1)!==1)){$db->rollBack();fail('お知らせ投稿の担当者のみ操作できます。',403);}
  $title=value($_POST,'title',120,true);$body=value($_POST,'body',3000,true);$area=$u['role']==='admin'?value($_POST,'area',60):$g['area'];
  $at=value($_POST,'event_at',16);if($at!==''){$at=opsDate($_POST,'event_at','Y-m-d\TH:i');}$url=opsUrl($_POST);
  query("INSERT INTO messages(room,user_id,body,kind,title,area,event_at,zoom_url,parent_id,created_at) VALUES('all',?,?,'notice',?,?,?,?,NULL,?)",[$u['id'],$body,$title,$area,$at,$url,time()]);audit((int)$u['id'],'district_notice',(int)$db->lastInsertId());$db->commit();header('Location: ./?room=all',true,303);exit;
 }
 if($action==='publish_minutes'){
  if(!opsBoard($u)){$db->rollBack();fail('理事・理事候補のみ操作できます。',403);}
  $id=(int)($_POST['id']??0);$rev=(int)($_POST['revision']??0);$m=query('SELECT * FROM meeting_minutes WHERE id=?',[$id])->fetch();
  if(!$m||(int)$m['revision']!==$rev){$db->rollBack();fail('更新されています。最新の内容を確認してから公開してください。',409);}
  if(trim($m['body'])===''){$db->rollBack();fail('内容を入力してから公開してください。');}
  query('UPDATE meeting_minutes SET published=1,updated_by=?,revision=revision+1,updated_at=? WHERE id=?',[$u['id'],time(),$id]);audit((int)$u['id'],'minutes_publish',$id);$db->commit();header('Location: operations.php?id='.$id.'&saved=1',true,303);exit;
 }
 if($action==='minutes'){
  if(!opsBoard($u)){$db->rollBack();fail('理事・理事候補のみ操作できます。',403);}
  $id=filter_var($_POST['id']??'0',FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);$rev=filter_var($_POST['revision']??'0',FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
  if($id===false||$rev===false){$db->rollBack();fail('保存情報を確認してください。');}
  $title=value($_POST,'title',120,true);$day=opsDate($_POST,'meeting_on','Y-m-d');$fields=opsFields($_POST);$details=json_encode($fields,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$body=opsBody($fields);$url=opsUrl($_POST);$pub=0;
  $current=$id?query('SELECT * FROM meeting_minutes WHERE id=?',[$id])->fetch():null;
  if(($id&&!$current)||($id&&(int)$current['revision']!==$rev)||(!$id&&$rev!==0)){
   $db->rollBack();http_response_code(409);$error='別の担当者が更新しました。入力内容を控えてから、一覧で最新の内容を確認してください。';$draft=['id'=>$id,'revision'=>$rev,'title'=>$title,'meeting_on'=>$day,'body'=>$body,'resource_url'=>$url,'published'=>$pub,'details_json'=>$details];
  }else{
   if($id){query('UPDATE meeting_minutes SET title=?,meeting_on=?,body=?,resource_url=?,details_json=?,published=?,updated_by=?,revision=revision+1,updated_at=? WHERE id=?',[$title,$day,$body,$url,$details,$pub,$u['id'],time(),$id]);}
   else{query('INSERT INTO meeting_minutes(title,meeting_on,body,resource_url,details_json,published,author_id,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[$title,$day,$body,$url,$details,$pub,$u['id'],$u['id'],time()]);$id=(int)$db->lastInsertId();}
   audit((int)$u['id'],$pub?'minutes_publish':'minutes_draft',$id);$db->commit();header('Location: operations.php?id='.$id.'&saved=1',true,303);exit;
  }
 }else{$db->rollBack();fail('操作が不正です。');}
}
if($ready&&(($tab==='minutes'&&!$board)||($tab==='notice'&&!$notice)||($tab==='editors'&&!$admin))){fail('この画面を利用する権限がありません。',403);}
$e=fn($v):string=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
header('Content-Type: text/html; charset=utf-8');header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
?>
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>議事録・お知らせ｜じねんネットワーク</title><link rel="stylesheet" href="operations.css"></head><body><header><a href="./">じねんネットワーク</a><span>担当者のページ</span></header><nav><a href="./">チャットへ戻る</a><?php if($board):?><a href="operations.php">議事録</a><?php endif;?><?php if($notice):?><a href="?tab=notice">お知らせ投稿</a><?php endif;?><?php if($admin):?><a href="?tab=editors">地区担当者の設定</a><?php endif;?></nav><main>
<?php if(!$ready):?><h1>ログインしてください</h1><p>議事録は理事・理事候補、お知らせ投稿は指定された担当者が利用できます。</p><a class="button" href="./?account=1">ログイン画面へ</a><p>ログイン後、チャットの「議事録」または「お知らせ投稿」を開いてください。</p>
<?php elseif($tab==='editors'):
$q=value($_GET,'q',60);$after=max(0,(int)($_GET['after']??0));$members=query("SELECT u.id,u.name,u.role,coalesce(n.area,'') area,coalesce(n.enabled,0) enabled FROM users u LEFT JOIN notice_editors n ON n.user_id=u.id WHERE u.active=1 AND u.deleted_at=0 AND u.id>? AND (?='' OR instr(u.name,?)>0) ORDER BY u.id LIMIT 51",[$after,$q,$q])->fetchAll();?>
<h1>地区のお知らせ担当者</h1><p>指定した方は、全体チャットへZoom案内・お知らせを公開できます。会員管理や議事録の権限は増えません。</p><?php if(isset($_GET['saved'])):?><p role="status">設定を保存しました。</p><?php endif;?><form method="get"><input type="hidden" name="tab" value="editors"><label>お名前で検索<input name="q" maxlength="60" value="<?= $e($q) ?>"></label><button>検索</button></form>
<?php foreach(array_slice($members,0,50) as $m):?><section class="card"><h2><?= $e($m['name']) ?></h2><form method="post" action="?tab=editors"><input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>"><input type="hidden" name="action" value="editor"><input type="hidden" name="user_id" value="<?= (int)$m['id'] ?>"><label>担当地区<input name="area" maxlength="60" value="<?= $e($m['area']) ?>" placeholder="例：福岡"></label><label class="check"><input type="checkbox" name="enabled" <?= (int)$m['enabled']?'checked':'' ?>>お知らせの投稿を許可する</label><button>設定を保存</button></form></section><?php endforeach;?>
<?php if(count($members)>50):?><a class="button" href="?tab=editors&amp;q=<?= rawurlencode($q) ?>&amp;after=<?= (int)$members[49]['id'] ?>">次の50人</a><?php endif;?>
<?php elseif($tab==='notice'):?>
<h1>全体へのお知らせ投稿</h1><p>無料会員を含む全会員に公開されます。議事録の本文や限定リンクは載せないでください。</p><form method="post" action="?tab=notice" class="card"><input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>"><input type="hidden" name="action" value="notice"><label>お知らせ・会議名<input name="title" required maxlength="120"></label><?php if($admin):?><label>地区名<input name="area" maxlength="60"></label><?php else:?><p>地区：<?= $e($grant['area']) ?></p><?php endif;?><label>本文<textarea name="body" rows="7" maxlength="3000" required></textarea></label><label>Zoom開催日時（任意・日本時間）<input name="event_at" type="datetime-local"></label><label>参加リンク（任意）<input name="url" type="url" maxlength="1500" placeholder="https://"></label><p>開催日時を入れると、今後のZoom予定にも表示されます。無料・有料・お試しの区別は本文に記載してください。</p><button>全体に公開する</button></form>
<?php else:
$id=max(0,(int)($_GET['id']??0));$edit=isset($_GET['edit'])||isset($_GET['copy'])||$draft!==null;$item=$draft?:($id?query('SELECT * FROM meeting_minutes WHERE id=?',[$id])->fetch():null);
if($id&&!$item):http_response_code(404);echo '<p>議事録が見つかりません。</p>';
elseif($edit):$v=$item?:['id'=>0,'revision'=>0,'title'=>'','meeting_on'=>date('Y-m-d'),'body'=>'','resource_url'=>'','published'=>0,'details_json'=>'{}'];
$f=json_decode($v['details_json']??'{}',true)?:[];if(!$f&&$v['body']!==''){$f['other']=$v['body'];}
if(isset($_GET['copy'])&&$draft===null){$v['id']=0;$v['revision']=0;$v['published']=0;$v['meeting_on']='';$v['title']='';$f['next_meeting']='';}
$topics=$f['topics']??[];if(!$topics){$topics=[[]];}?>
<h1>議事録を作成・編集</h1><p>理事・理事候補・管理者で共同編集できます。下書きも、この担当者の範囲で共有されます。</p><?php if($error):?><p role="alert"><?= $e($error) ?></p><?php endif;?>
<form id="minutes-form" method="post" class="card" action="operations.php?edit=1&amp;id=<?= (int)$v['id'] ?>"><input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>"><input type="hidden" name="action" value="minutes"><input type="hidden" name="id" value="<?= (int)$v['id'] ?>"><input type="hidden" name="revision" value="<?= (int)$v['revision'] ?>">
<?php if(isset($_GET['copy'])):?><p>前回の内容をコピーしました。会議名・開催日と、今回変更する内容を確認してください。元の議事録は変更されません。</p><?php endif;?>
<h2>会議の基本情報</h2><label>会議名<input name="title" required maxlength="120" value="<?= $e($v['title']) ?>" placeholder="例：2026年9月 月例会"></label><div class="fields"><label>開催日<input name="meeting_on" type="date" value="<?= $e($v['meeting_on']) ?>" required></label><label>開始時刻<input name="start_time" type="time" value="<?= $e($f['start_time']??'') ?>"></label><label>終了時刻<input name="end_time" type="time" value="<?= $e($f['end_time']??'') ?>"></label></div>
<label>参加者<textarea name="participants" rows="3" maxlength="4000" placeholder="お名前を改行して入力できます"><?= $e($f['participants']??'') ?></textarea></label><div class="fields"><?php foreach(['chair'=>'司会','secretary'=>'書記','host'=>'Zoomホスト'] as $k=>$label):?><label><?= $label ?><input name="<?= $k ?>" maxlength="100" value="<?= $e($f[$k]??'') ?>"></label><?php endforeach;?></div>
<label>式次第<textarea name="program" rows="4" maxlength="4000" placeholder="例：1. 開会　2. お話　3. 会議"><?= $e($f['program']??'') ?></textarea></label>
<h2>議題と話し合いの内容</h2><div id="topics"><?php foreach($topics as $i=>$t):?><fieldset class="topic"><legend>議題 <?= $i+1 ?></legend><label>議題名<input data-field="title" name="topics[<?= $i ?>][title]" maxlength="200" value="<?= $e($t['title']??'') ?>"></label><label>話し合った内容<textarea data-field="content" name="topics[<?= $i ?>][content]" rows="5" maxlength="5000"><?= $e($t['content']??'') ?></textarea></label><label>決定事項（任意）<textarea data-field="decision" name="topics[<?= $i ?>][decision]" rows="3" maxlength="2000"><?= $e($t['decision']??'') ?></textarea></label><div class="fields"><label>担当者（任意）<input data-field="owner" name="topics[<?= $i ?>][owner]" maxlength="200" value="<?= $e($t['owner']??'') ?>"></label><label>対応期限（任意）<input data-field="deadline" name="topics[<?= $i ?>][deadline]" maxlength="100" value="<?= $e($t['deadline']??'') ?>" placeholder="例：次回の月例会まで"></label></div><button class="remove-topic secondary" type="button">この議題を削除</button></fieldset><?php endforeach;?></div><button id="add-topic" type="button" class="secondary">＋ 議題を追加</button><p id="topic-status" role="status"></p>
<label>次回の予定<textarea name="next_meeting" rows="3" maxlength="2000"><?= $e($f['next_meeting']??'') ?></textarea></label><label>その他・連絡事項<textarea name="other" rows="4" maxlength="4000"><?= $e($f['other']??'') ?></textarea></label><label>関連資料・動画のリンク（任意）<input name="url" type="url" maxlength="1500" value="<?= $e($v['resource_url']) ?>"></label><p>外部資料の閲覧権限は元のサービスで設定してください。</p>
<?php if((int)$v['published']):?><p>保存すると一度下書きに戻ります。内容を確認してから再公開してください。</p><?php endif;?><button>下書き保存して仕上がりを確認</button></form><a href="operations.php">← 一覧へ戻る</a><script src="operations.js?v=20260912-structured" defer></script>
<?php elseif($item):?><p><a href="operations.php">← 議事録一覧</a></p><?php if(isset($_GET['saved'])):?><p role="status">保存しました。内容をご確認ください。</p><?php endif;?><article class="card"><p><?= (int)$item['published']?'公開済み':'下書き' ?> ／ 開催日 <?= $e($item['meeting_on']) ?></p><h1><?= $e($item['title']) ?></h1><div class="body-text"><?= $e($item['body']) ?></div><?php if($item['resource_url']):?><p><a class="button" href="<?= $e($item['resource_url']) ?>">関連資料を開く</a></p><?php endif;?><p><a class="button" href="?edit=1&amp;id=<?= (int)$item['id'] ?>">編集する</a></p><p><a class="button secondary" href="?copy=1&amp;id=<?= (int)$item['id'] ?>">この議事録をコピーして新規作成</a></p><?php if(!(int)$item['published']):?><form method="post"><input type="hidden" name="action" value="publish_minutes"><input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>"><input type="hidden" name="id" value="<?= (int)$item['id'] ?>"><input type="hidden" name="revision" value="<?= (int)$item['revision'] ?>"><p>確認した内容を、理事・理事候補に公開します。</p><button>この内容で公開する</button></form><?php endif;?><small>最終更新：<?= $e(date('Y/m/d H:i',(int)$item['updated_at'])) ?></small></article>
<?php else:$before=max(0,(int)($_GET['before']??0));$items=query('SELECT id,title,meeting_on,published FROM meeting_minutes WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT 51',[$before,$before])->fetchAll();?>
<h1>月例会の議事録</h1><p>理事・理事候補・管理者だけが閲覧できます。</p><a class="button" href="?edit=1">議事録を新しく作る</a><?php if(!$items):?><p>議事録はまだ登録されていません。</p><?php endif;?><?php foreach(array_slice($items,0,50) as $m):?><article class="card"><p><?= $e($m['meeting_on']) ?> ／ <?= (int)$m['published']?'公開済み':'下書き' ?></p><h2><a href="?id=<?= (int)$m['id'] ?>"><?= $e($m['title']) ?></a></h2></article><?php endforeach;?><?php if(count($items)>50):?><a class="button" href="?before=<?= (int)$items[49]['id'] ?>">以前の議事録</a><?php endif;?><?php endif;endif;?>
</main></body></html>
