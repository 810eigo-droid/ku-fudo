<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';require __DIR__.'/redo-lib.php';
$u=requireUser();if ((int)$u['must_change']) { fail('先に初回パスワードを変更してください。',403); }
$action=$_GET['action'] ?? 'state';if (!is_string($action)) { fail('操作が不正です。'); }
if (($_SERVER['REQUEST_METHOD'] ?? '')==='GET') {
    if ($action==='state') {
        $terms=query('SELECT id,year,joined_on,enabled FROM redo_terms WHERE user_id=? ORDER BY year DESC',[$u['id']])->fetchAll();
        output(['user'=>publicUser($u),'csrf'=>$_SESSION['csrf'],'year'=>redoYear(),'period'=>redoDates(redoYear()),'eligible'=>redoEligible($u),'terms'=>$terms]);
    }
    if ($action==='issues') {
        redoCheck($u);$before=max(0,(int)($_GET['before'] ?? 0));$where=$u['role']==='admin'?'1=1':'published=1';$where.=$before?' AND id<'. $before:'';
        $issues=query("SELECT id,number,series,issued_on,title,published,(pdf_key!='') AS has_pdf FROM redo_issues WHERE $where ORDER BY id DESC LIMIT 51")->fetchAll();
        output(['issues'=>array_slice($issues,0,50),'more'=>count($issues)>50]);
    }
    if ($action==='issue' || $action==='pdf') {
        $i=redoIssue($u,(int)($_GET['id'] ?? 0));
        if ($action==='issue') { output(['issue'=>redoPublicIssue($i)]); }
        $path=redoPdfPath($i['pdf_key']);if (!is_file($path)) { fail('PDFが見つかりません。',404); }
        header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="REDO-MAIL-'.$i['id'].'.pdf"');header('Content-Length: '.filesize($path));header("Content-Security-Policy: sandbox; default-src 'none'");session_write_close();readfile($path);exit;
    }
    requireAdmin($u);
    if ($action==='members') {
        $year=(int)($_GET['year'] ?? redoYear());$dates=redoDates($year);$after=max(0,(int)($_GET['after'] ?? 0));
        $members=query('SELECT u.id,u.name,u.login,u.chat_access,u.active,u.redo_mail,t.id AS term_id,t.joined_on,t.paid_on,t.amount,t.enabled,t.note FROM users u LEFT JOIN redo_terms t ON t.user_id=u.id AND t.year=? WHERE u.deleted_at=0 AND u.id>? ORDER BY u.id LIMIT 101',[$year,$after])->fetchAll();
        output(['members'=>array_slice($members,0,100),'more'=>count($members)>100,'year'=>$year,'period'=>$dates]);
    }
    if ($action==='deliveries') {
        $id=(int)($_GET['id'] ?? 0);$after=max(0,(int)($_GET['after'] ?? 0));
        output(['counts'=>query('SELECT status,count(*) AS count FROM redo_deliveries WHERE issue_id=? GROUP BY status',[$id])->fetchAll(),'deliveries'=>query('SELECT d.id,d.recipient,d.status,d.attempts,u.name FROM redo_deliveries d JOIN users u ON u.id=d.user_id WHERE d.issue_id=? AND d.id>? ORDER BY d.id LIMIT 100',[$id,$after])->fetchAll()]);
    }
    if ($action==='recipients') {
        output(['count'=>(int)query('SELECT count(*) FROM users u JOIN redo_terms t ON t.user_id=u.id WHERE u.active=1 AND u.deleted_at=0 AND u.redo_mail=1 AND t.year=? AND t.enabled=1 AND t.joined_on<=?',[redoYear(),date('Y-m-d')])->fetchColumn()]);
    }
    fail('見つかりません。',404);
}
if (($_SERVER['REQUEST_METHOD'] ?? '')!=='POST') { fail('許可されていない操作です。',405); }
if (!hash_equals($_SESSION['csrf'],(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { fail('再読み込みしてください。',403); }
limitAttempt('redo-write:'.$u['id'],120,60);
$db->beginTransaction();query('UPDATE users SET version=version WHERE id=?',[$u['id']]);$u=requireUser();
if ($action==='upload') {
    requireAdmin($u);$id=(int)($_POST['id'] ?? 0);$i=redoIssue($u,$id);
    if ((int)$i['published']) { fail('公開後のPDFは変更できません。新しい号を作成してください。'); }
    $file=$_FILES['pdf'] ?? null;
    if (!$file || !is_array($file) || ($file['error'] ?? -1)!==UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) { fail('PDFをアップロードできません。サーバーの容量制限も確認してください。'); }
    $size=filesize($file['tmp_name']);if ($size===false || $size<12 || $size>10*1024*1024) { fail('PDFは10MB以内にしてください。'); }
    $head=file_get_contents($file['tmp_name'],false,null,0,1024);$tail=file_get_contents($file['tmp_name'],false,null,max(0,$size-2048));
    if (!str_starts_with($head,'%PDF-') || !str_contains($tail,'%%EOF')) { fail('PDF形式のファイルを選択してください。'); }
    $dir=$private.'/redo-pdfs';if (!is_dir($dir) && !mkdir($dir,0700) && !is_dir($dir)) { fail('PDF保存先を作成できません。',503); }
    $key=bin2hex(random_bytes(24)).'.pdf';$path=redoPdfPath($key);
    if (!move_uploaded_file($file['tmp_name'],$path)) { fail('PDFを保存できません。',503); }
    chmod($path,0600);query('UPDATE redo_issues SET pdf_key=?,updated_at=? WHERE id=?',[$key,time(),$id]);audit((int)$u['id'],'redo_pdf',$id);$db->commit();
    if ($i['pdf_key']!=='') { @unlink(redoPdfPath($i['pdf_key'])); }output(['ok'=>true]);
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>150000) { fail('入力が大きすぎます。',413); }
$raw=file_get_contents('php://input',false,null,0,150001);if (strlen($raw)>150000) { fail('入力が大きすぎます。',413); }
$data=json_decode($raw,true);if (!is_array($data)) { fail('入力形式が不正です。'); }
if ($action==='subscription') {
    $enabled=$data['enabled'] ?? null;if (!in_array($enabled,[0,1],true)) { fail('設定を確認してください。'); }
    query('UPDATE users SET redo_mail=? WHERE id=?',[$enabled,$u['id']]);$db->commit();output(['ok'=>true]);
}
requireAdmin($u);
if ($action==='member_create') {
    $login=loginValue($data);$name=value($data,'name',60,true);
    if (query('SELECT 1 FROM users WHERE login=?',[$login])->fetchColumn()) { fail('登録済みです。会員一覧から年度を設定してください。'); }
    $pw=bin2hex(random_bytes(8));query("INSERT INTO users(login,name,password,role,must_change,chat_access,created_at) VALUES(?,?,?,'member',1,0,?)",[$login,$name,password_hash($pw,PASSWORD_DEFAULT),time()]);
    $id=(int)$db->lastInsertId();audit((int)$u['id'],'redo_member_create',$id);$db->commit();output(['ok'=>true,'id'=>$id,'temporary_password'=>$pw]);
}
if ($action==='term_save') {
    $id=(int)($data['user_id'] ?? 0);$year=(int)($data['year'] ?? 0);[$start,$end]=redoDates($year);
    $target=query('SELECT * FROM users WHERE id=? AND deleted_at=0',[$id])->fetch();if (!$target) { fail('会員が見つかりません。',404); }
    $joined=redoDate($data,'joined_on');$paid=redoDate($data,'paid_on');$amount=$data['amount'] ?? null;$enabled=$data['enabled'] ?? null;$chat=$data['chat_access'] ?? null;$note=value($data,'note',1000);
    if ($joined<$start || $joined>$end || !is_int($amount) || $amount<0 || $amount>10000000 || !in_array($enabled,[0,1],true) || !in_array($chat,[0,1],true)) { fail('対象年度・入会日・金額・利用設定を確認してください。'); }
    if ($target['role']==='admin' && !$chat) { fail('管理者のチャット権限は外せません。'); }
    query('INSERT INTO redo_terms(user_id,year,joined_on,paid_on,amount,enabled,note) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,year) DO UPDATE SET joined_on=excluded.joined_on,paid_on=excluded.paid_on,amount=excluded.amount,enabled=excluded.enabled,note=excluded.note',[$id,$year,$joined,$paid,$amount,$enabled,$note]);
    // Revoke sessions only if chat permissions change; REDO access is checked on every request.
    if ((int)$target['chat_access']!==$chat) { query('UPDATE users SET chat_access=?,version=version+1 WHERE id=?',[$chat,$id]); }
    audit((int)$u['id'],'redo_term',$id);
} elseif ($action==='issue_save') {
    $id=(int)($data['id'] ?? 0);$number=value($data,'number',20,true);$series=value($data,'series',30,true);$title=value($data,'title',120,true);$body=value($data,'body',20000,true);$date=redoDate($data,'issued_on');
    if (preg_match('/[\r\n]/',$title.$number.$series)) { fail('タイトル・号数に改行は使えません。'); }
    if ($id) {
        $i=redoIssue($u,$id);if ((int)$i['published']) { fail('公開済みの号は変更できません。訂正版を新しい号として作成してください。'); }
        query('UPDATE redo_issues SET number=?,series=?,issued_on=?,title=?,body=?,updated_at=? WHERE id=?',[$number,$series,$date,$title,$body,time(),$id]);
    } else { query('INSERT INTO redo_issues(number,series,issued_on,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[$number,$series,$date,$title,$body,time(),time()]);$id=(int)$db->lastInsertId(); }
    audit((int)$u['id'],'redo_draft',$id);$db->commit();output(['ok'=>true,'id'=>$id]);
} elseif ($action==='publish') {
    $id=(int)($data['id'] ?? 0);$i=redoIssue($u,$id);$notify=$data['notify'] ?? false;
    if (!is_bool($notify) || ($data['confirmed'] ?? false)!==true) { fail('プレビューと配信対象を確認してください。'); }
    if ((int)$i['published']) { fail('この号は公開済みです。二重配信は行いません。',409); }
    if ($notify) { redoMailSettings(); }
    query('UPDATE redo_issues SET published=1,updated_at=? WHERE id=?',[time(),$id]);
    if ($notify) { query("INSERT INTO redo_deliveries(issue_id,user_id,recipient) SELECT ?,u.id,u.login FROM users u JOIN redo_terms t ON t.user_id=u.id WHERE u.active=1 AND u.deleted_at=0 AND u.redo_mail=1 AND t.year=? AND t.enabled=1 AND t.joined_on<=?",[$id,redoYear(),date('Y-m-d')]); }
    $count=(int)query('SELECT count(*) FROM redo_deliveries WHERE issue_id=?',[$id])->fetchColumn();audit((int)$u['id'],'redo_publish',$id);$db->commit();output(['ok'=>true,'queued'=>$count]);
} elseif ($action==='unpublish') {
    $id=(int)($data['id'] ?? 0);redoIssue($u,$id);
    // Keep the content locked after publication; only suspend visibility and queued delivery.
    query('UPDATE redo_issues SET published=2,updated_at=? WHERE id=?',[time(),$id]);query("UPDATE redo_deliveries SET status='skipped' WHERE issue_id=? AND status='pending'",[$id]);audit((int)$u['id'],'redo_unpublish',$id);
} elseif ($action==='retry_failed') {
    $id=(int)($data['id'] ?? 0);$i=redoIssue($u,$id);if ((int)$i['published']!==1) { fail('公開中の号だけ再送できます。'); }
    query("UPDATE redo_deliveries SET status='pending' WHERE issue_id=? AND status='failed'",[$id]);audit((int)$u['id'],'redo_retry',$id);
} elseif ($action==='send_batch') {
    $id=(int)($data['id'] ?? 0);$i=redoIssue($u,$id);if ((int)$i['published']!==1) { fail('公開中の号だけ送信できます。'); }
    redoMailSettings();$ids=query("SELECT id FROM redo_deliveries WHERE issue_id=? AND status='pending' ORDER BY id LIMIT 5",[$id])->fetchAll(PDO::FETCH_COLUMN);$db->commit();
    foreach ($ids as $deliveryId) { $fresh=currentUser();if (!$fresh || $fresh['role']!=='admin') { fail('管理者でログインし直してください。',401); }redoSend((int)$deliveryId); }
    output(['ok'=>true,'remaining'=>(int)query("SELECT count(*) FROM redo_deliveries WHERE issue_id=? AND status='pending'",[$id])->fetchColumn()]);
} else { fail('見つかりません。',404); }
$db->commit();output(['ok'=>true]);
