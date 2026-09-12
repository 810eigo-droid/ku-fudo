<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$db->exec('CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,user_version INTEGER NOT NULL,email TEXT NOT NULL,expires INTEGER NOT NULL)');
function resetSettings():array {
 global $config;$from=$config['password_reset_mail_from']??$config['approval_mail_from']??'info@taf-design.com';$root=$config['chat_login_url']??'https://taf-design.com/ku-fudo-chat/';
 if(!is_string($from)||!preg_match('/\A[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\z/D',$from)||!filter_var($from,FILTER_VALIDATE_EMAIL)||!is_string($root)||!filter_var($root,FILTER_VALIDATE_URL)||parse_url($root,PHP_URL_SCHEME)!=='https'||parse_url($root,PHP_URL_USER)!==null||parse_url($root,PHP_URL_PASS)!==null||parse_url($root,PHP_URL_QUERY)!==null||parse_url($root,PHP_URL_FRAGMENT)!==null)fail('メール送信の設定を確認中です。時間をおいてお試しください。',503);
 return [$from,rtrim($root,'/').'/'];
}
function resetTransport(string $email,string $token):bool {
 global $config;[$from,$root]=resetSettings();if(($config['password_reset_mail_enabled']??true)!==true||!function_exists('mail'))return false;
 $text="じねんネットワーク 会員サイト\n\nパスワードの再設定を受け付けました。\n以下のリンクから新しいパスワードを設定してください。\n\n".$root.'password-reset.php?token='.$token."\n\nリンクは発行から30分間、1回限り有効です。\nこのメールに心当たりがない場合は、操作せずに破棄してください。今のパスワードは変更されません。\nこのリンクを他の人に渡さないでください。\n\nお問い合わせ：".$from;
 return @mail($email,mb_encode_mimeheader('【じねんネットワーク】パスワードの再設定','UTF-8','B',"\r\n"),chunk_split(base64_encode($text)),['From'=>'=?UTF-8?B?'.base64_encode('じねんネットワーク').'?= <'.$from.'>','MIME-Version'=>'1.0','Content-Type'=>'text/plain; charset=UTF-8','Content-Transfer-Encoding'=>'base64','Reply-To'=>$from],'-f'.$from);
}
function resetRecord(string $token):?array {
 if(!preg_match('/\A[a-f0-9]{64}\z/D',$token))return null;
 $r=query('SELECT r.token_hash,r.user_id,r.user_version,r.email FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.expires>? AND u.active=1 AND u.deleted_at=0 AND u.version=r.user_version AND u.login=r.email',[hash('sha256',$token),time()])->fetch();return $r?:null;
}
$token=is_string($_GET['token']??null)?$_GET['token']:'';$error='';$done=false;$sent=isset($_GET['sent']);$record=$token!==''?resetRecord($token):null;
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
 if(!is_string($_POST['csrf']??null)||!hash_equals($_SESSION['csrf'],$_POST['csrf'])){$error='画面を開き直してから、もう一度お試しください。';http_response_code(403);}
 elseif(($_POST['action']??'')==='request'){
  limitAttempt('reset-ip:'.hash('sha256',$_SERVER['REMOTE_ADDR']??''),10,3600);
  $email=strtolower(value($_POST,'email',254,true));
  if(!filter_var($email,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$email)){$error='登録したメールアドレスを正しく入力してください。';}
  else{
   limitAttempt('reset-email:'.hash('sha256',$email),3,3600);resetSettings();
   $user=query('SELECT id,login,version FROM users WHERE login=? AND active=1 AND deleted_at=0',[$email])->fetch();
   if($user){
    $raw=bin2hex(random_bytes(32));$hash=hash('sha256',$raw);
    $db->beginTransaction();query('DELETE FROM password_resets WHERE user_id=? OR expires<=?',[$user['id'],time()]);query('INSERT INTO password_resets(token_hash,user_id,user_version,email,expires) VALUES(?,?,?,?,?)',[$hash,$user['id'],$user['version'],$email,time()+1800]);$db->commit();
    try{$ok=resetTransport($email,$raw);}catch(Throwable $e){$ok=false;}
    if(!$ok){query('DELETE FROM password_resets WHERE token_hash=?',[$hash]);error_log('Password reset email transport failed');}
   }
   // Identical response for unregistered, disabled and active accounts.
   header('Location: password-reset.php?sent=1',true,303);exit;
  }
 }elseif(($_POST['action']??'')==='reset'){
  limitAttempt('reset-use:'.hash('sha256',$_SERVER['REMOTE_ADDR']??''),20,3600);
  $password=$_POST['password']??null;$confirm=$_POST['confirm']??null;
  if(!is_string($password)||!mb_check_encoding($password,'UTF-8')||mb_strlen($password)<8||strlen($password)>72||str_contains($password,"\0"))$error='パスワードは8文字以上、72バイト以内で入力してください。';
  elseif(!is_string($confirm)||!hash_equals($password,$confirm))$error='2つのパスワードが一致していません。';
  else{
   $hash=password_hash($password,PASSWORD_DEFAULT);$db->beginTransaction();query('DELETE FROM password_resets WHERE expires<=?',[time()]);$r=resetRecord($token);
   if(!$r){$db->rollBack();$error='このリンクは期限切れ、使用済み、または無効です。もう一度メールをお申し込みください。';$record=null;}
   else{
    $updated=query('UPDATE users SET password=?,must_change=0,version=version+1 WHERE id=? AND version=? AND login=? AND active=1 AND deleted_at=0',[$hash,$r['user_id'],$r['user_version'],$r['email']])->rowCount();
    if(!$updated){$db->rollBack();$error='登録情報が変更されました。もう一度メールをお申し込みください。';$record=null;}
    else{query('DELETE FROM password_resets WHERE user_id=?',[$r['user_id']]);query('DELETE FROM login_links WHERE user_id=?',[$r['user_id']]);audit((int)$r['user_id'],'password_self_reset',(int)$r['user_id']);$db->commit();unset($_SESSION['uid'],$_SESSION['version']);session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));header('Location: password-reset.php?complete=1',true,303);exit;}
   }
  }
 }else{$error='画面を開き直してください。';http_response_code(400);}
}
$done=isset($_GET['complete']);$e=fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
header('Content-Type: text/html; charset=utf-8');header("Content-Security-Policy: default-src 'self'; script-src 'none'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
?>
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>パスワードの再設定｜じねんネットワーク</title><link rel="stylesheet" href="chat.css"></head><body><header class="masthead"><a class="brand" href="./">じねんネットワーク<span>会員サイト</span></a></header><main><section class="card narrow"><h1>パスワードの再設定</h1><?php if($error):?><p role="alert"><?= $e($error) ?></p><?php endif;?>
<?php if($done):?><h2>パスワードを変更しました</h2><p>新しいパスワードでログインしてください。</p><a class="primary" href="./?account=1">ログイン画面へ</a>
<?php elseif($sent):?><h2>メールをご確認ください</h2><p>ご利用中の登録アドレスに一致する場合、再設定用のメールをお送りします。</p><p>メールのリンクを開き、30分以内に新しいパスワードを設定してください。</p><p>届かない場合は迷惑メールフォルダと、入力したアドレスをご確認ください。繰り返し申し込んだ場合は、最後に届いたリンクをご利用ください。</p><a href="password-reset.php">メールアドレスを入力し直す</a>
<?php elseif($token!==''&&!$record):?><h2>このリンクは利用できません</h2><p>有効期限は30分です。使用済みの場合や、登録情報が変わった場合も利用できなくなります。</p><a class="primary" href="password-reset.php">再設定メールを申し込む</a>
<?php elseif($record):?><p>新しいパスワードを決めてください。</p><form method="post" action="password-reset.php?token=<?= $e($token) ?>"><input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>"><input type="hidden" name="action" value="reset"><label>新しいパスワード（8文字以上）<input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label><label>もう一度入力してください<input name="confirm" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></label><button class="primary">このパスワードに変更する</button></form>
<?php else:?><p>登録したメールアドレスを入力してください。新しいパスワードを設定するためのリンクをお送りします。</p><form method="post" action="password-reset.php"><input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>"><input type="hidden" name="action" value="request"><label>メールアドレス<input name="email" type="email" maxlength="254" autocomplete="email" autocapitalize="none" spellcheck="false" required></label><button class="primary">再設定メールを送る</button></form><?php endif;?><p><a href="./?account=1">← ログイン画面へ戻る</a></p></section></main></body></html>
