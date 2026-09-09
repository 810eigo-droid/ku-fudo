<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$action = $_GET['action'] ?? 'state';
if (!is_string($action)) { fail('操作が不正です。'); }
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    if ($action === 'state') {
        $user = currentUser();
        output(['user' => $user ? publicUser($user) : null, 'csrf' => $_SESSION['csrf'], 'setup' => !(bool)query('SELECT 1 FROM users LIMIT 1')->fetchColumn()]);
    }
    $user = requireUser();
    if ((int)$user['must_change']) { fail('先にパスワードを変更してください。', 403); }
    if ($action === 'feed') {
        $room = is_string($_GET['room'] ?? null) ? $_GET['room'] : 'all'; roomCheck($user, $room);
        $before = max(0, (int)($_GET['before'] ?? 0));
        $where = $before ? ' AND m.id < ?' : '';
        $args = $before ? [$room,$before] : [$room];
        $messages = query("SELECT m.*,u.name,u.role,CASE WHEN p.hidden=0 THEN substr(p.body,1,120) ELSE '非表示の投稿' END AS parent_preview FROM messages m JOIN users u ON u.id=m.user_id LEFT JOIN messages p ON p.id=m.parent_id AND p.room=m.room WHERE m.room=? $where ORDER BY m.id DESC LIMIT 51", $args)->fetchAll();
        $more = count($messages) > 50; $messages = array_slice($messages,0,50);
        foreach ($messages as &$message) {
            if ((int)$message['hidden']) { foreach (['body','title','area','event_at','zoom_url','parent_preview'] as $key) { $message[$key]=''; } }
        } unset($message);
        $events = query("SELECT id,title,area,event_at,zoom_url FROM messages WHERE room=? AND kind='notice' AND hidden=0 AND event_at>=? ORDER BY event_at LIMIT 20", [$room,date('Y-m-d\TH:i')])->fetchAll();
        output(['messages' => $messages, 'more' => $more, 'events' => $events, 'user' => publicUser($user)]);
    }
    if ($action === 'users') {
        requireAdmin($user);
        output(['users'=>query('SELECT id,login,name,role,active,must_change FROM users ORDER BY id DESC LIMIT 500')->fetchAll()]);
    }
    fail('見つかりません。',404);
}
if ($method !== 'POST') { fail('許可されていない操作です。',405); }
if (!hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) { fail('画面を再読み込みしてからお試しください。',403); }
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>24000) { fail('入力が大きすぎます。',413); }
$raw = file_get_contents('php://input',false,null,0,24001);
if (strlen($raw)>24000) { fail('入力が大きすぎます。',413); }
$data = json_decode($raw,true);
if (!is_array($data)) { fail('入力形式が不正です。'); }
if ($action === 'link_login') {
    limitAttempt('link-auth:'.hash('sha256',(string)($_SERVER['REMOTE_ADDR'] ?? 'unknown')),20,900);
    $token=value($data,'token',64,true);$remember=$data['remember'] ?? false;
    if (!preg_match('/\A[a-f0-9]{64}\z/D',$token) || !is_bool($remember)) { fail('専用リンクが正しくありません。管理者に新しいリンクをご依頼ください。',403); }
    $db->beginTransaction();
    // The first write serializes concurrent redemption; no GET request consumes a link.
    query('DELETE FROM login_links WHERE expires<=?',[time()]);
    $link=query('SELECT * FROM login_links WHERE token_hash=?',[hash('sha256',$token)])->fetch();
    $user=$link ? query('SELECT * FROM users WHERE id=?',[$link['user_id']])->fetch() : false;
    if (!$user || !(int)$user['active'] || $user['role']==='admin' || (int)$user['version']!==(int)$link['version']) { fail('この専用リンクは期限切れ、使用済み、または無効です。管理者に新しいリンクをご依頼ください。',403); }
    $signedIn=currentUser();
    if ($signedIn && (int)$signedIn['id']!==(int)$user['id']) { fail('別のアカウントでログイン中です。ログアウトしてから専用リンクを開いてください。',403); }
    query('DELETE FROM login_links WHERE user_id=?',[$user['id']]);
    if ((int)$user['must_change']) {
        // A one-use invitation replaces, and invalidates, any previously issued temporary password.
        query('UPDATE users SET password=?,must_change=0,version=version+1 WHERE id=?',[password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT),$user['id']]);
        $user=query('SELECT * FROM users WHERE id=?',[$user['id']])->fetch();
    }
    audit((int)$user['id'],'link_login',(int)$user['id']);$db->commit();
    signIn($user,$remember,'link');output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
if ($action === 'setup' || $action === 'login') {
    $ip = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    limitAttempt('auth:'.$ip, 20, 900);
    $login = loginValue($data, $action === 'login'); $password = passwordValue($data, $action !== 'login');
    if ($action === 'setup') {
        if (query('SELECT 1 FROM users LIMIT 1')->fetchColumn()) { fail('初期設定は完了しています。',403); }
        $key = value($data,'setup_key',200,true);
        if (strlen((string)($config['setup_key'] ?? ''))<32 || !hash_equals($config['setup_key'],$key)) { fail('初期設定キーが正しくありません。',403); }
        $name=value($data,'name',60,true);
        $hash=password_hash($password,PASSWORD_DEFAULT);
        $db->beginTransaction();
        // The first write serializes competing initial setup requests.
        query("UPDATE limits SET count=count WHERE bucket=?", ['auth:'.$ip]);
        if (query('SELECT 1 FROM users LIMIT 1')->fetchColumn()) { $db->rollBack(); fail('初期設定は完了しています。',403); }
        query("INSERT INTO users(login,name,password,role,created_at) VALUES(?,?,?,'admin',?)",[$login,$name,$hash,time()]);
        $id=(int)$db->lastInsertId(); audit($id,'setup',$id); $db->commit();
        $user=query('SELECT * FROM users WHERE id=?',[$id])->fetch();
    } else {
        limitAttempt('login:'.hash('sha256',$login), 15, 900);
        $user=query('SELECT * FROM users WHERE login=?',[$login])->fetch();
        $hash=$user['password'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        if (!password_verify($password,$hash) || !$user || !(int)$user['active']) { fail('メールアドレス（従来のID）またはパスワードを確認してください。',401); }
    }
    signIn($user); output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
$user=requireUser();
if ($action === 'logout') { $_SESSION=[]; session_destroy(); setcookie('KU_FUDO_CHAT','',['expires'=>time()-3600,'path'=>'/ku-fudo-chat/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']); output(['ok'=>true]); }
if ((int)$user['must_change'] && $action !== 'password') { fail('先にパスワードを変更してください。',403); }
limitAttempt('write:'.$user['id'], 40, 60);
$db->beginTransaction();
// Acquire the SQLite write lock before re-checking membership to avoid a revocation race.
query('UPDATE users SET version=version WHERE id=?',[$user['id']]);
$user=requireUser();
if ($action === 'password') {
    $old=$data['old_password'] ?? '';
    if (!is_string($old) || strlen($old)>72 || !password_verify($old,$user['password'])) { fail('現在のパスワードが正しくありません。',403); }
    $password=passwordValue($data);
    if (hash_equals($old,$password)) { fail('現在と異なるパスワードにしてください。'); }
    query('UPDATE users SET password=?,must_change=0,version=version+1 WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$user['id']]);
    audit((int)$user['id'],'password',(int)$user['id']); $db->commit();
    signIn(query('SELECT * FROM users WHERE id=?',[$user['id']])->fetch()); output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
if ($action === 'email') {
    $login=loginValue($data);$password=passwordValue($data, false);
    if (!password_verify($password,$user['password'])) { fail('現在のパスワードが正しくありません。',403); }
    if ($login === $user['login']) { fail('現在と異なるメールアドレスを入力してください。'); }
    if (query('SELECT id FROM users WHERE login=? AND id<>?',[$login,$user['id']])->fetchColumn()) { fail('このメールアドレスは使われています。'); }
    query('UPDATE users SET login=?,version=version+1 WHERE id=?',[$login,$user['id']]);
    audit((int)$user['id'],'email',(int)$user['id']);$db->commit();
    signIn(query('SELECT * FROM users WHERE id=?',[$user['id']])->fetch());output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
if ($action === 'post') {
    $room=value($data,'room',10,true);roomCheck($user,$room);
    $body=value($data,'body',3000,true);$kind=value($data,'kind',10) ?: 'chat';
    if (!in_array($kind,['chat','notice'],true)) { fail('投稿の種類が不正です。'); }
    $title='';$area='';$at='';$url='';
    if ($kind === 'notice') {
        requireAdmin($user);$title=value($data,'title',120,true);$area=value($data,'area',60);$at=value($data,'event_at',16);$url=value($data,'zoom_url',1500);
        if ($at !== '') { $date=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$at); if (!$date || $date->format('Y-m-d\TH:i')!==$at) { fail('開催日時を確認してください。'); } }
        if ($url !== '' && (!filter_var($url,FILTER_VALIDATE_URL) || parse_url($url,PHP_URL_SCHEME)!=='https' || parse_url($url,PHP_URL_USER)!==null || parse_url($url,PHP_URL_PASS)!==null)) { fail('参加リンクはhttps://から始まるURLにしてください。'); }
    }
    $parent=(int)($data['parent_id'] ?? 0);
    if ($parent && !query('SELECT id FROM messages WHERE id=? AND room=? AND hidden=0',[$parent,$room])->fetchColumn()) { fail('返信先が見つかりません。',404); }
    query('INSERT INTO messages(room,user_id,body,kind,title,area,event_at,zoom_url,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[$room,$user['id'],$body,$kind,$title,$area,$at,$url,$parent?:null,time()]);
} elseif ($action === 'hide') {
    $room=value($data,'room',10,true); roomCheck($user,$room);$id=(int)($data['id'] ?? 0);
    $message=query('SELECT * FROM messages WHERE id=? AND room=?',[$id,$room])->fetch();
    if (!$message) { fail('投稿が見つかりません。',404); }
    if ($user['role']!=='admin' && (int)$message['user_id']!==(int)$user['id']) { fail('この投稿を取り下げる権限がありません。',403); }
    query('UPDATE messages SET hidden=1 WHERE id=?',[$id]);audit((int)$user['id'],'hide',$id);
} elseif ($action === 'user_create') {
    requireAdmin($user);$login=loginValue($data);$name=value($data,'name',60,true);$role=value($data,'role',15,true);
    if (!in_array($role,['member','candidate','director','admin'],true)) { fail('権限を確認してください。'); }
    $useLink=$data['use_link'] ?? false;
    if (!is_bool($useLink) || ($useLink && $role==='admin')) { fail('管理者にはメールアドレスと仮パスワードを案内してください。'); }
    if (query('SELECT id FROM users WHERE login=?',[$login])->fetchColumn()) { fail('このメールアドレスは使われています。'); }
    $temporary=bin2hex(random_bytes(10));
    query('INSERT INTO users(login,name,password,role,must_change,created_at) VALUES(?,?,?,?,1,?)',[$login,$name,password_hash($temporary,PASSWORD_DEFAULT),$role,time()]);
    $id=(int)$db->lastInsertId();audit((int)$user['id'],'user_create',$id);
    $result=$useLink ? issueLoginLink(query('SELECT * FROM users WHERE id=?',[$id])->fetch(),(int)$user['id']) : ['temporary_password'=>$temporary];
    $db->commit();output(['ok'=>true]+$result);
} elseif ($action === 'user_link') {
    requireAdmin($user);$id=(int)($data['id'] ?? 0);
    $target=query('SELECT * FROM users WHERE id=?',[$id])->fetch();
    if (!$target) { fail('会員が見つかりません。',404); }
    $result=issueLoginLink($target,(int)$user['id']);$db->commit();output(['ok'=>true]+$result);
} elseif ($action === 'user_update' || $action === 'user_reset') {
    requireAdmin($user);$id=(int)($data['id'] ?? 0);
    if ($id===(int)$user['id']) { fail('自分の権限変更・利用停止・仮パスワード発行はできません。'); }
    if (!query('SELECT id FROM users WHERE id=?',[$id])->fetchColumn()) { fail('会員が見つかりません。',404); }
    if ($action === 'user_reset') {
        $temporary=bin2hex(random_bytes(10));query('UPDATE users SET password=?,must_change=1,version=version+1 WHERE id=?',[password_hash($temporary,PASSWORD_DEFAULT),$id]);
        audit((int)$user['id'],'user_reset',$id);$db->commit();output(['ok'=>true,'temporary_password'=>$temporary]);
    }
    $role=value($data,'role',15,true);$active=$data['active'] ?? null;
    if (!in_array($role,['member','candidate','director','admin'],true) || !in_array($active,[0,1],true)) { fail('権限・利用状態を確認してください。'); }
    query('UPDATE users SET role=?,active=?,version=version+1 WHERE id=?',[$role,$active,$id]);audit((int)$user['id'],'user_update',$id);
} else { fail('見つかりません。',404); }
$db->commit();output(['ok'=>true]);
