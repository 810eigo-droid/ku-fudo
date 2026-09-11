<?php
declare(strict_types=1);
function prayerLatestMonth(): string { return (new DateTimeImmutable('first day of last month'))->format('Y-m'); }
function prayerMonth(mixed $v): string {
    if (!is_string($v) || !preg_match('/\A20[0-9]{2}-(0[1-9]|1[0-2])\z/D',$v)) { fail('対象月を確認してください。'); }
    return $v;
}
function prayerProfile(int $id): array|false { return query('SELECT * FROM prayer_members WHERE user_id=?',[$id])->fetch(); }
function prayerCheck(array $u): array {
    $p=prayerProfile((int)$u['id']);
    if (!$p || !(int)$p['enabled']) { fail('祈りの蓄積への参加登録が必要です。担当者にご確認ください。',403); }
    return $p;
}
function prayerMonthCheck(array $p,string $month): void {
    if ($month>prayerLatestMonth() || $month<$p['start_month'] || ($p['end_month']!=='' && $month>$p['end_month'])) { fail('参加期間内の、終了した月を選んでください。'); }
}
function prayerFields(): array { return ['humanity'=>'人類愛の祈り','vision'=>'大構想の祈り','return_point'=>'回帰点の祈り','other_prayer'=>'その他の祈り','gratitude'=>'全感謝の祈り','meditation'=>'瞑想','listening'=>'聴く行']; }
function prayerUnit(string $key): string { return $key==='meditation'?'分':($key==='listening'?'時間':'回'); }
function prayerNumber(array $data,string $key,int $max,bool $decimal=false): int {
    $v=$data[$key] ?? null;
    if (!is_string($v) && !is_int($v)) { fail('数値を入力してください。実践がない場合は0を入力してください。'); }
    $v=trim(str_replace('．','.',mb_convert_kana((string)$v,'n','UTF-8')));
    if (!preg_match($decimal?'/\A[0-9]{1,9}(?:\.[0-9]{1,2})?\z/D':'/\A[0-9]{1,9}\z/D',$v)) { fail('回数・分数は整数、時間は小数第2位までで入力してください。'); }
    if ($decimal) { $parts=explode('.',$v);$n=(int)$parts[0]*100+(int)str_pad($parts[1] ?? '',2,'0'); }
    else { $n=(int)$v; }
    if ($n>$max) { fail('入力した数値が大きすぎます。単位も確認してください。'); }return $n;
}
function prayerDisplay(array $r): array { $r['listening']=number_format((int)$r['listening']/100,2,'.','');return $r; }
function prayerMail(int $id,int $revision): string {
    global $db,$config;
    $db->beginTransaction();
    $claimed=query("UPDATE prayer_reports SET receipt_status='sending',receipt_at=? WHERE id=? AND revision=? AND receipt_status IN ('pending','failed')",[time(),$id,$revision])->rowCount();
    $r=query('SELECT * FROM prayer_reports WHERE id=?',[$id])->fetch();
    if (!$claimed) { $db->commit();return $r['receipt_status'] ?? 'missing'; }
    $u=query('SELECT * FROM users WHERE id=?',[$r['user_id']])->fetch();$p=$u?prayerProfile((int)$u['id']):false;
    if (!$u || !(int)$u['active'] || (int)$u['deleted_at'] || !$p || !(int)$p['enabled'] || $u['login']!==$r['email']) {
        query("UPDATE prayer_reports SET receipt_status='failed' WHERE id=? AND revision=?",[$id,$revision]);$db->commit();return 'failed';
    }
    $db->commit();$ok=false;
    try {
        $from=$config['prayer_mail_from'] ?? $config['approval_mail_from'] ?? 'info@taf-design.com';
        $root=$config['chat_login_url'] ?? 'https://taf-design.com/ku-fudo-chat/';
        $valid=is_string($from) && preg_match('/\A[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\z/D',$from) && filter_var($from,FILTER_VALIDATE_EMAIL) && is_string($root) && filter_var($root,FILTER_VALIDATE_URL) && parse_url($root,PHP_URL_SCHEME)==='https' && parse_url($root,PHP_URL_USER)===null && parse_url($root,PHP_URL_PASS)===null && parse_url($root,PHP_URL_QUERY)===null && parse_url($root,PHP_URL_FRAGMENT)===null;
        if (($config['prayer_mail_enabled'] ?? true)===true && $valid && function_exists('mail') && filter_var($r['email'],FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/',$r['email'])) {
            $lines=[$r['name'].' 様','','祈りの蓄積の報告を受け付けました。','対象月：'.$r['month'],'参加番号：'.$r['number'],'更新回数：'.$r['revision'],'受付日時：'.date('Y-m-d H:i:s',$r['updated_at']).'（日本時間）',''];
            $display=prayerDisplay($r);foreach (prayerFields() as $key=>$label) { $lines[]=$label.'：'.$display[$key].' '.prayerUnit($key); }
            $lines[]='';$lines[]='感想・気づき：';$lines[]=$r['reflection']!==''?$r['reflection']:'記入なし';$lines[]='';$lines[]='記録の確認・修正：';$lines[]=rtrim($root,'/').'/prayer.php?month='.$r['month'];$lines[]='';$lines[]='同じ月を修正した場合は、最後の報告が集計されます。';$lines[]='じねんネットワーク';
            $body=chunk_split(base64_encode(implode("\n",$lines)),76,"\r\n");
            $subject=mb_encode_mimeheader('【祈りの蓄積】'.$r['month'].'分 報告の控え','UTF-8','B',"\r\n");
            $ok=@mail($r['email'],$subject,$body,['From'=>'=?UTF-8?B?'.base64_encode('じねんネットワーク').'?= <'.$from.'>','Reply-To'=>$from,'MIME-Version'=>'1.0','Content-Type'=>'text/plain; charset=UTF-8','Content-Transfer-Encoding'=>'base64'],'-f'.$from);
        }
    } catch (Throwable $e) { error_log('Prayer receipt transport failed'); }
    $status=$ok?'sent':'failed';query('UPDATE prayer_reports SET receipt_status=? WHERE id=? AND revision=? AND receipt_status=\'sending\'',[$status,$id,$revision]);return $status;
}
function prayerRows(string $month): array {
    return query("SELECT u.id AS user_id,u.name AS current_name,u.login,p.number AS participant_number,p.enabled,p.start_month,p.end_month,r.* FROM users u LEFT JOIN prayer_members p ON p.user_id=u.id LEFT JOIN prayer_reports r ON r.user_id=u.id AND r.month=? WHERE u.deleted_at=0 AND ((p.start_month<=? AND (p.end_month='' OR p.end_month>=?)) OR r.id IS NOT NULL) ORDER BY p.number,u.id",[$month,$month,$month])->fetchAll();
}
function prayerCsvCell(mixed $v): string { $s=(string)($v ?? '');return preg_match('/\A[\s]*[=+@-]/u',$s)||preg_match('/\A[\t\r\n]/',$s)?"'".$s:$s; }
