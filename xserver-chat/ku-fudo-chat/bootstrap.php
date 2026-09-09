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
ini_set('session.gc_maxlifetime', '43200');
session_save_path($sessions);
session_name('KU_FUDO_CHAT');
session_set_cookie_params(['lifetime' => 0, 'path' => '/ku-fudo-chat/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
if (isset($_SESSION['signed_at']) && time() - (int)$_SESSION['signed_at'] > 43200) { $_SESSION = []; session_regenerate_id(true); }
if (!isset($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }
$db = new PDO('sqlite:' . $private . '/chat.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('PRAGMA foreign_keys=ON');
$db->exec('PRAGMA busy_timeout=5000');
if ((int)$db->query('PRAGMA user_version')->fetchColumn() === 0) {
    $db->beginTransaction();
    $db->exec(file_get_contents(__DIR__ . '/schema.sql'));
    $db->commit();
}
if ((int)$db->query('PRAGMA user_version')->fetchColumn() !== 1) { fail('対応していないデータ形式です。管理者に連絡してください。', 503); }

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
    return array_intersect_key($user, array_flip(['id','login','name','role','active','must_change']));
}
function requireUser(): array { $u = currentUser(); if (!$u) { fail('ログインし直してください。', 401); } return $u; }
function requireAdmin(array $user): void { if ($user['role'] !== 'admin') { fail('管理者のみ操作できます。', 403); } }
function roomCheck(array $user, string $room): void { if (!roomAllowed($user, $room)) { fail('このチャットを利用する権限がありません。', 403); } }
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
function signIn(array $user): void {
    session_regenerate_id(true);
    $_SESSION = ['uid' => (int)$user['id'], 'version' => (int)$user['version'], 'signed_at' => time(), 'csrf' => bin2hex(random_bytes(32))];
}
function audit(int $actor, string $action, int $target): void {
    query('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)', [$actor,$action,$target,time()]);
}
