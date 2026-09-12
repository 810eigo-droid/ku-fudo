<?php
declare(strict_types=1);
function mcSchema():void {
 global $db;
 $db->exec("CREATE TABLE IF NOT EXISTS notice_editors(user_id INTEGER PRIMARY KEY REFERENCES users(id),area TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1)");
 $db->exec("CREATE TABLE IF NOT EXISTS mail_regions(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,area TEXT NOT NULL,PRIMARY KEY(user_id,area))");
 $db->exec("CREATE TABLE IF NOT EXISTS mail_preferences(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,enabled INTEGER NOT NULL DEFAULT 1)");
 $db->exec("CREATE TABLE IF NOT EXISTS mail_bulletins(id INTEGER PRIMARY KEY,author_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,audience TEXT NOT NULL,area TEXT NOT NULL DEFAULT '',month TEXT NOT NULL DEFAULT '',title TEXT NOT NULL,body TEXT NOT NULL,event_at TEXT NOT NULL DEFAULT '',link TEXT NOT NULL DEFAULT '',source_id INTEGER,source_revision INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'draft',message_id INTEGER,created_at INTEGER NOT NULL,UNIQUE(kind,source_id,source_revision))");
 // NULL source_id distinguishes independent notices from one mailing per minutes revision.
 $db->exec("CREATE TABLE IF NOT EXISTS mail_outbox(id INTEGER PRIMARY KEY,bulletin_id INTEGER NOT NULL REFERENCES mail_bulletins(id),user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempted_at INTEGER NOT NULL DEFAULT 0,UNIQUE(bulletin_id,user_id))");
}
function mcBoard(array $u):bool {return in_array($u['role'],['admin','director','candidate'],true);}
function mcGrant(array $u):string {if(!(int)($u['chat_access']??1))return '';return (string)(query('SELECT area FROM notice_editors WHERE user_id=? AND enabled=1',[$u['id']])->fetchColumn()?:'');}
function mcCan(array $u,array $b):bool {
 if($u['role']==='admin')return true;
 if($b['kind']==='minutes'||$b['audience']==='board')return mcBoard($u);
 return $b['kind']==='notice' && $b['audience']==='region' && (int)$b['author_id']===(int)$u['id'] && $b['area']!=='' && mcGrant($u)===$b['area'];
}
function mcEligible(array $u,array $b):bool {
 if(!(int)$u['active']||(int)$u['deleted_at'])return false;
 if($b['kind']==='minutes')return mcBoard($u);
 if($b['audience']==='board')return mcBoard($u)&&(int)$u['chat_access']===1;
 if($b['audience']==='prayer')return (bool)query("SELECT 1 FROM prayer_members WHERE user_id=? AND enabled=1 AND start_month<=? AND (end_month='' OR end_month>=?)",[$u['id'],$b['month'],$b['month']])->fetchColumn();
 if(!(int)$u['chat_access'])return false;
 if($b['audience']==='region')return (bool)query('SELECT 1 FROM mail_regions WHERE user_id=? AND area=?',[$u['id'],$b['area']])->fetchColumn();
 return $b['audience']==='all';
}
function mcRecipients(array $b):array {
 $out=[];foreach(query('SELECT u.* FROM users u LEFT JOIN mail_preferences p ON p.user_id=u.id WHERE u.active=1 AND u.deleted_at=0 AND COALESCE(p.enabled,1)=1 ORDER BY u.id')->fetchAll() as $u){if(mcEligible($u,$b)&&filter_var($u['login'],FILTER_VALIDATE_EMAIL)&&!preg_match('/[\r\n]/',$u['login']))$out[]=['id'=>(int)$u['id'],'name'=>$u['name'],'email'=>$u['login']];}return $out;
}
function mcLive(array $b,bool $draft=false):bool {
 if($b['kind']==='notice' && !$draft && $b['message_id'])return (bool)query('SELECT 1 FROM messages WHERE id=? AND hidden=0',[$b['message_id']])->fetchColumn();
 if($b['kind']!=='minutes')return true;
 $m=query('SELECT * FROM meeting_minutes WHERE id=?',[$b['source_id']])->fetch();
 return $m && (int)$m['revision']===(int)$b['source_revision'] && ($draft||(int)$m['published']===1) && $m['title']===$b['title'] && str_contains($b['body'],$m['body']);
}
function mcRoot():array {
 global $config;$from=$config['notice_mail_from']??$config['approval_mail_from']??'info@taf-design.com';$root=$config['chat_login_url']??'https://taf-design.com/ku-fudo-chat/';
 if(!is_string($from)||!preg_match('/\A[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\z/D',$from)||!filter_var($from,FILTER_VALIDATE_EMAIL)||!is_string($root)||!filter_var($root,FILTER_VALIDATE_URL)||parse_url($root,PHP_URL_SCHEME)!=='https'||parse_url($root,PHP_URL_USER)!==null||parse_url($root,PHP_URL_PASS)!==null||parse_url($root,PHP_URL_QUERY)!==null||parse_url($root,PHP_URL_FRAGMENT)!==null)fail('送信元・サイトURLの設定を確認してください。');
 return [$from,rtrim($root,'/').'/'];
}
function mcText(array $b):string {[, $root]=mcRoot();$url=$b['kind']==='minutes'?$root.'operations.php?id='.$b['source_id']:($b['kind']==='prayer'?$root.'prayer.php?month='.$b['month']:$root.'?room='.($b['audience']==='board'?'board':'all').'#zoom-schedule');return $b['body'].($b['event_at']!==''?"\n\n開催日時（日本時間）：".str_replace('T',' ',$b['event_at']):'').($b['link']!==''?"\n\n参加・資料リンク：\n".$b['link']:'')."\n\nサイトで確認する：\n".$url;}
function mcTransport(string $recipient,string $title,string $body):bool {
 global $config;[$from,$root]=mcRoot();if(($config['notice_mail_enabled']??true)!==true||!function_exists('mail'))return false;
 $body.="\n\nじねんネットワーク\nお問い合わせ：".$from."\nお知らせメールの受信設定：".$root.'mail-center.php?preferences=1';
 return @mail($recipient,mb_encode_mimeheader('【じねんネットワーク】'.$title,'UTF-8','B',"\r\n"),chunk_split(base64_encode($body)),['From'=>'=?UTF-8?B?'.base64_encode('じねんネットワーク').'?= <'.$from.'>','Reply-To'=>$from,'MIME-Version'=>'1.0','Content-Type'=>'text/plain; charset=UTF-8','Content-Transfer-Encoding'=>'base64'],'-f'.$from);
}
function mcBatch(int $bid,array $actor):void {
 global $db;
 foreach(query("SELECT id FROM mail_outbox WHERE bulletin_id=? AND status='pending' ORDER BY id LIMIT 10",[$bid])->fetchAll() as $row){
  $db->beginTransaction();query('UPDATE mail_bulletins SET id=id WHERE id=?',[$bid]);$actor=requireUser();$b=query('SELECT * FROM mail_bulletins WHERE id=?',[$bid])->fetch();
  if(!$b||!mcCan($actor,$b)||(int)$actor['must_change']){$db->rollBack();fail('配信の権限をご確認ください。',403);}
  $d=query('SELECT * FROM mail_outbox WHERE id=?',[$row['id']])->fetch();if($d['status']!=='pending'){$db->commit();continue;}
  $u=query('SELECT * FROM users WHERE id=?',[$d['user_id']])->fetch();$pref=query('SELECT enabled FROM mail_preferences WHERE user_id=?',[$d['user_id']])->fetchColumn();
  if(!$u||!mcEligible($u,$b)||$u['login']!==$d['recipient']||($pref!==false&&(int)$pref===0)||!mcLive($b)) {query("UPDATE mail_outbox SET status='skipped' WHERE id=?",[$d['id']]);$db->commit();continue;}
  query("UPDATE mail_outbox SET status='sending',attempted_at=? WHERE id=? AND status='pending'",[time(),$d['id']]);$db->commit();
  try{$ok=mcTransport($d['recipient'],$b['title'],$u['name']." 様\n\n".mcText($b));}catch(Throwable $e){$ok=false;error_log('Notice mail transport failed');}
  query('UPDATE mail_outbox SET status=? WHERE id=?',[$ok?'sent':'failed',$d['id']]);
 }
}
