<?php
declare(strict_types=1);

// Always create an ordinary free member; client-supplied privileges are ignored.
function registerFreeMember(string $login, string $name, string $password): array {
    global $db;
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->beginTransaction();
    // Serialize registration with duplicate requests and legacy admin approvals.
    query('UPDATE users SET version=version WHERE id=(SELECT min(id) FROM users)');
    if (!query("SELECT 1 FROM users WHERE role='admin' AND active=1 LIMIT 1")->fetchColumn()) {
        $db->rollBack(); fail('現在、登録を受け付けていません。',403);
    }
    if (query('SELECT 1 FROM users WHERE login=?',[$login])->fetchColumn()) {
        $db->rollBack(); fail('このメールアドレスは登録済みです。ログイン画面からお入りください。',409);
    }
    $pending = query('SELECT * FROM applications WHERE login=?',[$login])->fetch();
    if ($pending) {
        if (!password_verify($password,$pending['password'])) {
            $db->rollBack(); fail('以前の申し込みがあります。そのときのパスワードでログインしてください。お忘れの場合は運営にお問い合わせください。',409);
        }
        $name = $pending['name'];
        $hash = $pending['password'];
    }
    query("INSERT INTO users(login,name,password,role,membership,active,must_change,chat_access,created_at) VALUES(?,?,?,'member','free',1,0,1,?)",[$login,$name,$hash,time()]);
    $id = (int)$db->lastInsertId();
    if ($pending) { query('DELETE FROM applications WHERE id=?',[$pending['id']]); }
    audit($id,'self_register',$id);
    $user = query('SELECT * FROM users WHERE id=?',[$id])->fetch();
    $db->commit();
    return $user;
}
