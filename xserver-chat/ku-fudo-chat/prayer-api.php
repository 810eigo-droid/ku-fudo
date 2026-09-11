<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';require __DIR__.'/prayer-lib.php';
$u=requireUser();if ((int)$u['must_change']) { fail('先に初回パスワードを変更してください。',403); }
$action=$_GET['action'] ?? 'state';if (!is_string($action)) { fail('操作が不正です。'); }
if (($_SERVER['REQUEST_METHOD'] ?? '')==='GET') {
    if ($action==='state') { $p=prayerProfile((int)$u['id']);output(['user'=>publicUser($u),'csrf'=>$_SESSION['csrf'],'participant'=>$p?:null,'eligible'=>$p && (int)$p['enabled']===1,'latest_month'=>prayerLatestMonth()]); }
    if ($action==='report' || $action==='history') {
        prayerCheck($u);
        if ($action==='report') { $m=prayerMonth($_GET['month'] ?? prayerLatestMonth());$r=query('SELECT * FROM prayer_reports WHERE user_id=? AND month=?',[$u['id'],$m])->fetch();output(['report'=>$r?prayerDisplay($r):null]); }
        $before=isset($_GET['before'])?prayerMonth($_GET['before']):'9999-12';$rows=query('SELECT id,month,revision,updated_at,receipt_status FROM prayer_reports WHERE user_id=? AND month<? ORDER BY month DESC LIMIT 25',[$u['id'],$before])->fetchAll();output(['reports'=>array_slice($rows,0,24),'more'=>count($rows)>24]);
    }
    requireAdmin($u);
    if ($action==='members') {
        $after=max(0,(int)($_GET['after'] ?? 0));$rows=query('SELECT u.id,u.name,u.login,u.active,p.number,p.enabled,p.start_month,p.end_month FROM users u LEFT JOIN prayer_members p ON p.user_id=u.id WHERE u.deleted_at=0 AND u.id>? ORDER BY u.id LIMIT 101',[$after])->fetchAll();output(['members'=>array_slice($rows,0,100),'more'=>count($rows)>100]);
    }
    if ($action==='summary' || $action==='csv') {
        $m=prayerMonth($_GET['month'] ?? prayerLatestMonth());$rows=prayerRows($m);
        if ($action==='csv') {
            header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="prayer-'.$m.'.csv"');echo "\xEF\xBB\xBF";$f=fopen('php://output','w');
            $head=['対象月','番号','名前','メールアドレス','提出状況'];foreach (prayerFields() as $key=>$label) { $head[]=$label.'（'.prayerUnit($key).'）'; }array_push($head,'感想・気づき','更新回数','更新日時（日本時間）','控えメール状況');fputcsv($f,$head,',','"','');
            foreach ($rows as $r) { $d=$r['id']?prayerDisplay($r):$r;$line=[$m,$r['number']??$r['participant_number'],$r['name']??$r['current_name'],$r['email']??$r['login'],$r['id']?'提出済み':'未提出'];foreach (prayerFields() as $k=>$label) { $line[]=$r['id']?$d[$k]:''; }array_push($line,$r['reflection']??'',$r['revision']??'',$r['id']?date('Y-m-d H:i:s',$r['updated_at']):'',$r['receipt_status']??'');fputcsv($f,array_map('prayerCsvCell',$line),',','"',''); }fclose($f);exit;
        }
        $totals=array_fill_keys(array_keys(prayerFields()),0);$submitted=0;
        foreach ($rows as &$row) { if ($row['id']) { $submitted++;foreach ($totals as $k=>$n) { $totals[$k]+=(int)$row[$k]; }$row=prayerDisplay($row); } }unset($row);
        $totals=prayerDisplay($totals);$offset=max(0,(int)($_GET['offset'] ?? 0));output(['month'=>$m,'total'=>count($rows),'submitted'=>$submitted,'totals'=>$totals,'rows'=>array_slice($rows,$offset,100),'more'=>count($rows)>$offset+100]);
    }
    fail('見つかりません。',404);
}
if (($_SERVER['REQUEST_METHOD'] ?? '')!=='POST') { fail('許可されていない操作です。',405); }
if (!hash_equals($_SESSION['csrf'],(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { fail('再読み込みしてください。',403); }
limitAttempt('prayer-write:'.$u['id'],60,60);
if ($action==='save' || $action==='receipt_retry') { limitAttempt('prayer-mail:'.$u['id'],20,3600); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>30000) { fail('入力が大きすぎます。',413); }
$raw=file_get_contents('php://input',false,null,0,30001);if (strlen($raw)>30000) { fail('入力が大きすぎます。',413); }$data=json_decode($raw,true);if (!is_array($data)) { fail('入力形式が不正です。'); }
$db->beginTransaction();query('UPDATE users SET version=version WHERE id=?',[$u['id']]);$u=requireUser();if ((int)$u['must_change']) { fail('先に初回パスワードを変更してください。',403); }
if ($action==='member_save') {
    requireAdmin($u);$id=(int)($data['user_id'] ?? 0);$number=prayerNumber($data,'number',999999);$enabled=$data['enabled'] ?? null;$start=prayerMonth($data['start_month'] ?? null);$end=($data['end_month'] ?? '')!==''?prayerMonth($data['end_month']):'';
    if ($number<1 || !in_array($enabled,[0,1],true) || ($end!=='' && $end<$start)) { fail('番号・参加期間・利用設定を確認してください。'); }
    if (!query('SELECT 1 FROM users WHERE id=? AND deleted_at=0',[$id])->fetchColumn()) { fail('会員が見つかりません。',404); }
    if (query('SELECT 1 FROM prayer_members WHERE number=? AND user_id<>?',[$number,$id])->fetchColumn()) { fail('この参加番号は別の方が使用しています。'); }
    query("INSERT INTO prayer_members(user_id,number,enabled,start_month,end_month) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET number=excluded.number,enabled=excluded.enabled,start_month=excluded.start_month,end_month=excluded.end_month",[$id,$number,$enabled,$start,$end]);audit((int)$u['id'],'prayer_member',$id);$db->commit();output(['ok'=>true]);
}
$p=prayerCheck($u);
if ($action==='save') {
    $month=prayerMonth($data['month'] ?? null);prayerMonthCheck($p,$month);$revision=$data['revision'] ?? null;
    if (!is_int($revision) || $revision<0) { fail('記録を読み込み直してください。'); }
    if (!filter_var($u['login'],FILTER_VALIDATE_EMAIL)) { fail('アカウント画面でメールアドレスを設定してください。'); }
    $days=(int)(new DateTimeImmutable($month.'-01'))->format('t');$values=[];
    foreach (prayerFields() as $key=>$label) { $values[]=prayerNumber($data,$key,$key==='meditation'?$days*1440:($key==='listening'?$days*2400:999999999),$key==='listening'); }
    $reflection=value($data,'reflection',3000);$existing=query('SELECT * FROM prayer_reports WHERE user_id=? AND month=?',[$u['id'],$month])->fetch();
    if (($existing?(int)$existing['revision']:0)!==$revision) { fail('この月の記録はすでに更新されています。入力内容を控え、「保存済みの記録を読み直す」を押して確認してください。',409); }
    $columns='humanity,vision,return_point,other_prayer,gratitude,meditation,listening';
    if ($existing) {
        query("UPDATE prayer_reports SET number=?,name=?,email=?,humanity=?,vision=?,return_point=?,other_prayer=?,gratitude=?,meditation=?,listening=?,reflection=?,revision=revision+1,updated_at=?,receipt_status='pending',receipt_at=0 WHERE id=?",array_merge([$p['number'],$u['name'],$u['login']],$values,[$reflection,time(),$existing['id']]));$id=(int)$existing['id'];
    } else {
        query("INSERT INTO prayer_reports(user_id,month,number,name,email,$columns,reflection,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",array_merge([$u['id'],$month,$p['number'],$u['name'],$u['login']],$values,[$reflection,time()]));$id=(int)$db->lastInsertId();
    }
    audit((int)$u['id'],'prayer_report',$id);$db->commit();$receipt=prayerMail($id,$revision+1);output(['ok'=>true,'revision'=>$revision+1,'receipt_status'=>$receipt]);
}
if ($action==='receipt_retry') {
    $month=prayerMonth($data['month'] ?? null);$r=query('SELECT * FROM prayer_reports WHERE user_id=? AND month=?',[$u['id'],$month])->fetch();if (!$r) { fail('記録が見つかりません。',404); }
    if (!in_array($r['receipt_status'],['pending','failed'],true)) { fail('送信済み、または結果確認中です。二重送信を避けるため再送しません。',409); }
    $db->commit();output(['ok'=>true,'receipt_status'=>prayerMail((int)$r['id'],(int)$r['revision'])]);
}
fail('見つかりません。',404);
