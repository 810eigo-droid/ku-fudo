<?php
declare(strict_types=1);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
date_default_timezone_set('Asia/Tokyo');
require_once __DIR__ . '/policy.php';
umask(0077);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function output(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function fail(string $message, int $status = 400): void { output(['error' => $message], $status); }
set_exception_handler(function (Throwable $error): void {
    if (isset($GLOBALS['db']) && $GLOBALS['db']->inTransaction()) { $GLOBALS['db']->rollBack(); }
    error_log('Ku-fudo chat: ' . get_class($error) . ' code=' . $error->getCode());
    fail('処理できませんでした。入力内容を控えてから再度お試しください。続く場合は管理者に連絡してください。', 503);
});
if (PHP_VERSION_ID < 80200 || !extension_loaded('pdo_sqlite') || !extension_loaded('mbstring')) {
    fail('このチャットにはPHP 8.2以上、PDO SQLite、mbstringが必要です。サーバー設定を確認してください。', 503);
}
if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
    fail('HTTPSのURLで開いてください。SSL設定の確認が必要です。', 400);
}

// Placement is fixed: DOMAIN/public_html/ku-fudo-chat and DOMAIN/ku-fudo-private.
// Never put user data inside the web root or the public GitHub repository.
$private = realpath(dirname(__DIR__, 2) . '/ku-fudo-private');
$webRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
if (!$private || !$webRoot || $private === $webRoot || str_starts_with($private, $webRoot . DIRECTORY_SEPARATOR)) {
    fail('設置準備が必要です。手順書に従い、公開フォルダの外にku-fudo-privateを作成してください。', 503);
}
if (!is_file($private . '/config.php') || !is_writable($private)) {
    fail('非公開フォルダのconfig.phpと書き込み権限を確認してください。', 503);
}
$config = require $private . '/config.php';
if (!is_array($config)) { fail('config.phpの形式を確認してください。', 503); }
$sessions = $private . '/sessions';
if (!is_dir($sessions) && !mkdir($sessions, 0700) && !is_dir($sessions)) { fail('保存先を準備できません。', 503); }
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.gc_maxlifetime', '2592000');
session_save_path($sessions);
session_name('KU_FUDO_CHAT');
session_set_cookie_params(['lifetime' => 0, 'path' => '/ku-fudo-chat/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
if (isset($_SESSION['signed_at']) && time() - (int)$_SESSION['signed_at'] >= min(2592000, (int)($_SESSION['lifetime'] ?? 43200))) { $_SESSION = []; session_regenerate_id(true); }
if (!isset($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }
$db = new PDO('sqlite:' . $private . '/chat.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('PRAGMA foreign_keys=ON');
$db->exec('PRAGMA busy_timeout=5000');
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 0) {
    $db->beginTransaction();
    $db->exec(file_get_contents(__DIR__ . '/schema.sql'));
    $db->commit();
}
// Upgrade existing databases in place; preserve members, messages and role assignments.
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 1) {
    $db->beginTransaction();
    $db->exec('CREATE TABLE IF NOT EXISTS login_links (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), version INTEGER NOT NULL, expires INTEGER NOT NULL)');
    $db->exec('PRAGMA user_version=2');
    $db->commit();
}
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 2) {
    $db->beginTransaction();
    $db->exec('CREATE TABLE IF NOT EXISTS applications (id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL)');
    $db->exec('PRAGMA user_version=3');
    $db->commit();
}
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 3) {
    $db->beginTransaction();
    $db->exec("CREATE TABLE IF NOT EXISTS approval_mail (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id), recipient TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_attempt INTEGER NOT NULL DEFAULT 0)");
    $db->exec('PRAGMA user_version=4');
    $db->commit();
}
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 4) {
    $db->beginTransaction();
    $columns=$db->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_COLUMN,1);
    if (!in_array('deleted_at',$columns,true)) { $db->exec('ALTER TABLE users ADD COLUMN deleted_at INTEGER NOT NULL DEFAULT 0'); }
    $db->exec('PRAGMA user_version=5');
    $db->commit();
}
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 5) {
    $db->beginTransaction();
    $columns=$db->query('PRAGMA table_info(users)')->fetchAll(PDO::FETCH_COLUMN,1);
    if (!in_array('membership',$columns,true)) { $db->exec("ALTER TABLE users ADD COLUMN membership TEXT NOT NULL DEFAULT 'regular'"); }
    $db->exec("CREATE TABLE IF NOT EXISTS materials (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, resource_url TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL CHECK(audience IN ('free','regular')), published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0, author_id INTEGER NOT NULL REFERENCES users(id), updated_at INTEGER NOT NULL)");
    $db->exec('PRAGMA user_version=6');
    $db->commit();
}
if ((int)$db->query('PRAGMA user_version')->fetchColumn() !== 6) { fail('対応していないデータ形式です。管理者に連絡してください。', 503); }

function query(string $sql, array $values = []): PDOStatement {
    global $db;
    $stmt = $db->prepare($sql); $stmt->execute($values); return $stmt;
}
function currentUser(): ?array {
    if (!isset($_SESSION['uid'])) { return null; }
    $user = query('SELECT * FROM users WHERE id=?', [$_SESSION['uid']])->fetch();
    if (!$user || !(int)$user['active'] || (int)$user['version'] !== (int)($_SESSION['version'] ?? 0)) {
        unset($_SESSION['uid'], $_SESSION['version']); return null;
    }
    return $user;
}
function publicUser(array $user): array {
    return array_intersect_key($user, array_flip(['id','login','name','role','membership','active','must_change'])) + ['link_login' => ($_SESSION['login_method'] ?? '') === 'link'];
}
function requireUser(): array { $u = currentUser(); if (!$u) { fail('ログインし直してください。', 401); } return $u; }
function requireAdmin(array $user): void { if ($user['role'] !== 'admin') { fail('管理者のみ操作できます。', 403); } }
function roomCheck(array $user, string $room): void { if (!roomAllowed($user, $room)) { fail('このチャットを利用する権限がありません。', 403); } }
function membershipValue(array $data, string $default='regular'): string {
    $value=$data['membership'] ?? $default;
    if (!in_array($value,['free','regular'],true)) { fail('会員区分を確認してください。'); }
    return $value;
}
function materialAllowed(array $user,array $material): bool {
    return $user['role']==='admin' || ((int)$material['published']===1 && ($material['audience']==='free' || ($user['membership'] ?? '')==='regular'));
}
function value(array $data, string $name, int $max, bool $required = false): string {
    $v = $data[$name] ?? '';
    if (!is_string($v) || !mb_check_encoding($v, 'UTF-8') || mb_strlen($v) > $max || str_contains($v, "\0")) { fail('入力形式・文字数を確認してください。'); }
    $v = trim($v); if ($required && $v === '') { fail('必須項目を入力してください。'); } return $v;
}
function passwordValue(array $data, bool $newPassword = true): string {
    $v = $data['password'] ?? '';
    if (!is_string($v) || !mb_check_encoding($v, 'UTF-8') || $v === '' || strlen($v) > 72 || str_contains($v, "\0") || ($newPassword && mb_strlen($v, 'UTF-8') < 8)) { fail('パスワードは8文字以上、72バイト以内で入力してください。'); } return $v;
}
function loginValue(array $data, bool $allowLegacy = false): string {
    $v = strtolower(value($data, 'login', 254, true));
    if (filter_var($v, FILTER_VALIDATE_EMAIL) !== false) { return $v; }
    // Keep existing accounts accessible until their owners switch to an email address.
    if ($allowLegacy && preg_match('/\A[a-z0-9][a-z0-9._-]{2,59}\z/D', $v)) { return $v; }
    fail('有効なメールアドレスを入力してください。');
}
function limitAttempt(string $bucket, int $max, int $seconds): void {
    global $db;
    $db->beginTransaction();
    query('DELETE FROM limits WHERE expires < ?', [time()]);
    query('INSERT OR IGNORE INTO limits(bucket,count,expires) VALUES(?,0,?)', [$bucket,time()+$seconds]);
    query('UPDATE limits SET count=count+1 WHERE bucket=?', [$bucket]);
    $count = (int)query('SELECT count FROM limits WHERE bucket=?', [$bucket])->fetchColumn();
    $db->commit();
    if ($count > $max) { fail('操作が続いています。しばらく待ってからお試しください。', 429); }
}
function signIn(array $user, bool $remember = false, string $method = 'password'): void {
    session_regenerate_id(true);
    $lifetime = $remember ? 2592000 : 43200;
    $_SESSION = ['uid' => (int)$user['id'], 'version' => (int)$user['version'], 'signed_at' => time(), 'lifetime' => $lifetime, 'login_method' => $method, 'csrf' => bin2hex(random_bytes(32))];
    setcookie('KU_FUDO_CHAT',session_id(),['expires'=>$remember ? time()+$lifetime : 0,'path'=>'/ku-fudo-chat/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']);
}
// Only the hash is stored. A link is valid for 72 hours, once, for one current membership version.
function issueLoginLink(array $user, int $actor): array {
    if ($user['role'] === 'admin' || !(int)$user['active']) { fail('管理者・利用停止中の会員には専用リンクを発行できません。'); }
    query('DELETE FROM login_links WHERE user_id=? OR expires<=?',[$user['id'],time()]);
    $token=bin2hex(random_bytes(32));$expires=time()+259200;
    query('INSERT INTO login_links(token_hash,user_id,version,expires) VALUES(?,?,?,?)',[hash('sha256',$token),$user['id'],$user['version'],$expires]);
    audit($actor,'login_link',(int)$user['id']);
    return ['login_token'=>$token,'expires_at'=>$expires];
}
function audit(int $actor, string $action, int $target): void {
    query('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)', [$actor,$action,$target,time()]);
}

// Called only after approval is committed, or by an authenticated admin retry.
// 'sent' means accepted by the server's mail transport, not verified inbox delivery.
function sendApprovalMail(int $id): string {
    global $db,$config;
    $db->beginTransaction();
    $claimed=query("UPDATE approval_mail SET status='sending',attempts=attempts+1,last_attempt=? WHERE id=? AND (status IN ('pending','failed') OR (status='sending' AND last_attempt<?))",[time(),$id,time()-600])->rowCount();
    $entry=query('SELECT m.*,u.name,u.login,u.active FROM approval_mail m JOIN users u ON u.id=m.user_id WHERE m.id=?',[$id])->fetch();
    $db->commit();
    if (!$entry) { return 'missing'; }
    if (!$claimed) { return $entry['status']; }
    $ok=false;
    try {
        $from=$config['approval_mail_from'] ?? 'info@taf-design.com';
        $url=$config['chat_login_url'] ?? 'https://taf-design.com/ku-fudo-chat/';
        $enabled=($config['approval_mail_enabled'] ?? true)===true;
        $validFrom=is_string($from) && preg_match('/\A[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\z/D',$from) && filter_var($from,FILTER_VALIDATE_EMAIL);
        $validUrl=is_string($url) && filter_var($url,FILTER_VALIDATE_URL) && parse_url($url,PHP_URL_SCHEME)==='https' && parse_url($url,PHP_URL_USER)===null && parse_url($url,PHP_URL_PASS)===null;
        $recipient=$entry['recipient'];
        if ($enabled && $validFrom && $validUrl && function_exists('mail') && (int)$entry['active'] && $entry['login']===$recipient && filter_var($recipient,FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/',$recipient)) {
            $subject=mb_encode_mimeheader('【献文舎】会員登録が承認されました','UTF-8','B',"\r\n");
            $sender='=?UTF-8?B?'.base64_encode('献文舎 会員サイト').'?=';
            $text=$entry['name']." 様\n\n会員登録が承認されました。\n以下のリンクを開いて、チャットにログインしてください。\n\n".$url."\n\n登録時のメールアドレスとパスワードをご入力ください。\n皆さんの投稿やZoom会議の予定をご覧いただけます。\n\n献文舎 会員サイト\nお問い合わせ：".$from;
            $escape=fn(string $value): string => htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
            $html='<!doctype html><html lang="ja"><meta charset="utf-8"><body style="font-family:sans-serif;color:#203448;line-height:1.8;font-size:18px"><p>'.$escape($entry['name']).' 様</p><h1 style="font-size:24px">会員登録が承認されました</h1><p>こちらからチャットにログインできます。</p><p><a href="'.$escape($url).'" style="display:inline-block;background:#142c40;color:white;padding:16px 28px;border-radius:8px;text-decoration:none;font-weight:bold">チャットを開く →</a></p><p>登録時のメールアドレスとパスワードをご入力ください。</p><p>皆さんの投稿やZoom会議の予定をご覧いただけます。</p><p style="font-size:14px">ボタンが開けない場合：<br><a href="'.$escape($url).'">'.$escape($url).'</a></p><p>献文舎 会員サイト<br>お問い合わせ：'.$escape($from).'</p></body></html>';
            $boundary='ku_fudo_'.bin2hex(random_bytes(16));
            $part=fn(string $type,string $body): string => '--'.$boundary."\r\nContent-Type: ".$type."; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($body),76,"\r\n");
            $body=$part('text/plain',$text).$part('text/html',$html).'--'.$boundary."--\r\n";
            $headers=['From'=>$sender.' <'.$from.'>','Reply-To'=>$from,'MIME-Version'=>'1.0','Content-Type'=>'multipart/alternative; boundary="'.$boundary.'"'];
            $ok=@mail($recipient,$subject,$body,$headers,'-f'.$from);
        }
    } catch (Throwable $error) { error_log('Ku-fudo approval mail: transport failure'); }
    $status=$ok?'sent':'failed';
    query('UPDATE approval_mail SET status=? WHERE id=?',[$status,$id]);
    return $status;
}
