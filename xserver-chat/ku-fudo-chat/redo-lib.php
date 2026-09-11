<?php
declare(strict_types=1);
// All data and PDFs remain under the existing private directory.
function redoYear(): int { return (int)date('Y')-((int)date('n')<2?1:0); }
function redoDates(int $year): array {
    if ($year<2000 || $year>2100) { fail('対象年度を確認してください。'); }
    return [sprintf('%04d-02-01',$year),sprintf('%04d-01-31',$year+1)];
}
function redoDate(array $data,string $key): string {
    $v=value($data,$key,10,true);$d=DateTimeImmutable::createFromFormat('!Y-m-d',$v);
    if (!$d || $d->format('Y-m-d')!==$v) { fail('日付を確認してください。'); } return $v;
}
function redoEligible(array $u): bool {
    if (!(int)$u['active'] || (int)$u['deleted_at']) { return false; }
    return (bool)query('SELECT 1 FROM redo_terms WHERE user_id=? AND year=? AND enabled=1 AND joined_on<=?',[$u['id'],redoYear(),date('Y-m-d')])->fetchColumn();
}
function redoCheck(array $u): void { if ($u['role']!=='admin' && !redoEligible($u)) { fail('有効なやりなおし会員資格が必要です。管理者にご確認ください。',403); } }
function redoIssue(array $u,int $id): array {
    redoCheck($u);$i=query('SELECT * FROM redo_issues WHERE id=?',[$id])->fetch();
    if (!$i || ($u['role']!=='admin' && (int)$i['published']!==1)) { fail('この号は公開されていません。',404); }return $i;
}
function redoPdfPath(string $key): string {
    global $private;
    if (!preg_match('/\A[a-f0-9]{48}\.pdf\z/D',$key)) { fail('PDFが見つかりません。',404); }
    return $private.'/redo-pdfs/'.$key;
}
function redoPublicIssue(array $i): array { $i['has_pdf']=$i['pdf_key']!=='';unset($i['pdf_key']);return $i; }
function redoMailSettings(): array {
    global $config;
    $from=$config['redo_mail_from'] ?? $config['approval_mail_from'] ?? 'info@taf-design.com';
    $root=$config['chat_login_url'] ?? 'https://taf-design.com/ku-fudo-chat/';
    if (!is_string($from) || !preg_match('/\A[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\z/D',$from) || !filter_var($from,FILTER_VALIDATE_EMAIL) || !is_string($root) || !filter_var($root,FILTER_VALIDATE_URL) || parse_url($root,PHP_URL_SCHEME)!=='https' || parse_url($root,PHP_URL_USER)!==null || parse_url($root,PHP_URL_PASS)!==null || parse_url($root,PHP_URL_QUERY)!==null || parse_url($root,PHP_URL_FRAGMENT)!==null) { fail('送信元とサイトURLの設定を確認してください。'); }
    return [$from,rtrim($root,'/').'/redo.php'];
}
function redoSend(int $deliveryId): string {
    global $db,$config;
    $db->beginTransaction();
    $claimed=query("UPDATE redo_deliveries SET status='sending',attempts=attempts+1,attempted_at=? WHERE id=? AND status='pending'",[time(),$deliveryId])->rowCount();
    $d=query('SELECT * FROM redo_deliveries WHERE id=?',[$deliveryId])->fetch();
    $u=$d?query('SELECT * FROM users WHERE id=?',[$d['user_id']])->fetch():false;
    $i=$d?query('SELECT * FROM redo_issues WHERE id=?',[$d['issue_id']])->fetch():false;
    if (!$claimed) { $db->commit();return $d['status'] ?? 'missing'; }
    if (!$u || !$i || (int)$i['published']!==1 || !redoEligible($u) || !(int)$u['redo_mail'] || $u['login']!==$d['recipient']) {
        query("UPDATE redo_deliveries SET status='skipped' WHERE id=?",[$deliveryId]);$db->commit();return 'skipped';
    }
    $db->commit();
    [$from,$root]=redoMailSettings();$ok=false;
    try {
        if (($config['redo_mail_enabled'] ?? true)===true && function_exists('mail') && filter_var($d['recipient'],FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/',$d['recipient'])) {
            $url=$root.'?id='.$i['id'];
            $subject=mb_encode_mimeheader('【REDO MAIL】'.$i['title'],'UTF-8','B',"\r\n");
            $text=$u['name']." 様\n\nREDO MAIL ".$i['series'].' No.'.$i['number']."\n配信日：".$i['issued_on']."\n".$i['title']."\n\n今号を読む（本文・PDF）\n".$url."\n\n登録したメールアドレスとパスワードでログインしてください。\n配信停止は、ログイン後のREDO MAIL画面で設定できます。\n".$root."\n\nじねんネットワーク\nお問い合わせ：".$from;
            $e=fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
            $html='<html lang="ja"><meta charset="utf-8"><body style="font-family:sans-serif;font-size:18px;line-height:1.8;color:#203448"><p>'.$e($u['name']).' 様</p><p>REDO MAIL '.$e($i['series']).' No.'.$e($i['number']).' ／ '.$e($i['issued_on']).'</p><h1 style="font-size:24px">'.$e($i['title']).'</h1><p><a href="'.$e($url).'" style="display:inline-block;padding:16px 28px;background:#142c40;color:white">今号を読む →</a></p><p>登録したメールアドレスとパスワードでログインしてください。</p><p><a href="'.$e($root).'">配信設定・過去号はこちら</a></p><p>じねんネットワーク<br>'.$e($from).'</p></body></html>';
            $boundary='redo_'.bin2hex(random_bytes(16));$part=fn($type,$body)=>'--'.$boundary."\r\nContent-Type: ".$type."; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($body),76,"\r\n");
            $body=$part('text/plain',$text).$part('text/html',$html).'--'.$boundary."--\r\n";
            $ok=@mail($d['recipient'],$subject,$body,['From'=>'=?UTF-8?B?'.base64_encode('じねんネットワーク REDO MAIL').'?= <'.$from.'>','Reply-To'=>$from,'MIME-Version'=>'1.0','Content-Type'=>'multipart/alternative; boundary="'.$boundary.'"'],'-f'.$from);
        }
    } catch (Throwable $e) { error_log('REDO MAIL transport failed'); }
    $status=$ok?'sent':'failed';query('UPDATE redo_deliveries SET status=? WHERE id=?',[$status,$deliveryId]);return $status;
}
