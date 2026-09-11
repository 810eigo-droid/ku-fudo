<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$u=currentUser();
$lessons=json_decode('[{"id": "yUsA5PHWJeg", "title": "自明行とは何か／前半／会員向けからの抜粋", "url": "https://www.youtube.com/watch?v=yUsA5PHWJeg&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=23"}, {"id": "ZQJCpaHgnEc", "title": "自明行とは何か／後半／会員向けからの抜粋", "url": "https://www.youtube.com/watch?v=ZQJCpaHgnEc&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=24"}, {"id": "k3bWGxIxn4g", "title": "第三部［１］自明行の導入／第９回札幌講演会", "url": "https://www.youtube.com/watch?v=k3bWGxIxn4g&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=6"}, {"id": "uk5PHAL4w0U", "title": "【5-7】正しい喜びの自覚／人類滅亡を救う自明論", "url": "https://www.youtube.com/watch?v=uk5PHAL4w0U&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=21"}, {"id": "6EJ4ZIFUxPk", "title": "【4】自明行の準備／「人類愛の祈り」で宇宙に共鳴する", "url": "https://www.youtube.com/watch?v=6EJ4ZIFUxPk&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=1"}, {"id": "lNlSeXO-YSA", "title": "自明行の落とし穴", "url": "https://www.youtube.com/watch?v=lNlSeXO-YSA&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=25"}]',true,512,JSON_THROW_ON_ERROR);
$escape=fn($v):string=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
$ready=$u && !(int)$u['must_change'];
$error='';$posted=null;
if ($ready) {
 $db->exec("CREATE TABLE IF NOT EXISTS learning_notes (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, watched INTEGER NOT NULL DEFAULT 0 CHECK(watched IN (0,1)), note TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,lesson_id))");
}
if (($_SERVER['REQUEST_METHOD'] ?? '')==='POST') {
 if (!$ready) { fail('ログインしてから保存してください。',401); }
 if (!is_string($_POST['csrf'] ?? null) || !hash_equals($_SESSION['csrf'],$_POST['csrf'])) { fail('ページを開き直してください。',403); }
 $id=value($_POST,'lesson_id',32,true);
 if (!in_array($id,array_column($lessons,'id'),true)) { fail('対象の動画が見つかりません。',400); }
 $note=value($_POST,'note',5000);
 $revision=filter_var($_POST['revision'] ?? '',FILTER_VALIDATE_INT,['options'=>['min_range'=>0]]);
 if ($revision===false) { fail('保存情報を確認してください。',400); }
 $watched=isset($_POST['watched'])?1:0;
 $db->beginTransaction();query('UPDATE users SET version=version WHERE id=?',[$u['id']]);$u=requireUser();
 if ((int)$u['must_change']) { $db->rollBack();fail('パスワードを変更してください。',403); }
 $existing=query('SELECT revision FROM learning_notes WHERE user_id=? AND lesson_id=?',[$u['id'],$id])->fetch();
 if ((int)($existing['revision'] ?? 0)!==$revision) {
  $db->rollBack();http_response_code(409);$error='別の画面で記録が更新されています。下のメモを控えてから、ページを開き直してください。';$posted=['lesson_id'=>$id,'note'=>$note,'watched'=>$watched,'revision'=>$revision];
 } else {
  query('INSERT INTO learning_notes(user_id,lesson_id,watched,note,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET watched=excluded.watched,note=excluded.note,revision=learning_notes.revision+1,updated_at=excluded.updated_at',[$u['id'],$id,$watched,$note,time()]);
  $db->commit();header('Location: learning.php?saved='.rawurlencode($id).'#lesson-'.$id,true,303);exit;
 }
}
$records=[];
if ($ready) { foreach(query('SELECT * FROM learning_notes WHERE user_id=?',[$u['id']])->fetchAll() as $row) { $records[$row['lesson_id']]=$row; } }
$count=0;foreach($lessons as $lesson) { $count+=(int)($records[$lesson['id']]['watched'] ?? 0); }
header('Content-Type: text/html; charset=utf-8');
header("Content-Security-Policy: default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
?>
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>学びのマイページ｜じねんネットワーク</title><link rel="stylesheet" href="learning.css"></head><body>
<header><a href="../ku-fudo-demo/">じねんネットワーク<span>会員サイト</span></a></header>
<nav aria-label="メニュー"><a href="../ku-fudo-demo/">トップへ戻る</a><a href="./">チャット</a><a href="./?account=1">アカウント</a></nav><main>
<h1>学びのマイページ</h1>
<?php if (!$ready): ?>
<section class="card"><h2>ログインして記録を開く</h2><p>登録したメールアドレスとパスワードでログインしてください。初回パスワード変更の案内が出た場合は、変更を済ませてください。</p><a class="primary" href="./?account=1">ログイン画面を開く</a><p>ログイン後、ブラウザーの「戻る」でこの画面へ戻り、下のボタンを押してください。</p><a class="secondary" href="learning.php">マイページを開く</a></section>
<?php else: ?>
<p><?= $escape($u['name']) ?>さんの記録です。メモはチャットに公開されません。</p>
<section class="progress"><h2>人間やりなおし</h2><p><strong><?= $count ?></strong> / 6 レッスン視聴済み</p><progress value="<?= $count ?>" max="6"><?= $count ?>/6</progress></section>
<p>視聴済みにチェックし、気づいたことを書いて「保存する」を押してください。あとから書き直すこともできます。</p>
<?php if ($error): ?><p class="alert" role="alert"><?= $escape($error) ?></p><?php endif; ?>
<?php foreach($lessons as $i=>$l): $id=$l['id'];$row=$records[$id] ?? ['watched'=>0,'note'=>'','revision'=>0];if (($posted['lesson_id'] ?? '')===$id) { $row=$posted; } ?>
<section class="card" id="lesson-<?= $escape($id) ?>"><span class="number">レッスン <?= $i+1 ?></span><h2><?= $escape($l['title']) ?></h2>
<a class="secondary" href="<?= $escape($l['url']) ?>">動画を見る →</a>
<form action="learning.php#lesson-<?= $escape($id) ?>" method="post">
<input type="hidden" name="csrf" value="<?= $escape($_SESSION['csrf']) ?>"><input type="hidden" name="lesson_id" value="<?= $escape($id) ?>"><input type="hidden" name="revision" value="<?= (int)$row['revision'] ?>">
<label class="check"><input type="checkbox" name="watched" value="1" <?= (int)$row['watched']?'checked':'' ?>>視聴しました</label>
<label for="note-<?= $escape($id) ?>">自分のメモ</label><textarea id="note-<?= $escape($id) ?>" name="note" rows="5" maxlength="5000" placeholder="気づいたこと、心に残った言葉、質問など"><?= $escape($row['note']) ?></textarea><small>5,000文字まで。「保存する」を押すと次回も読めます。</small>
<button class="primary" type="submit">保存する</button>
<?php if (($_GET['saved'] ?? '')===$id && !$error): ?><p class="saved" role="status">保存しました。</p><?php endif; ?>
<?php if (isset($row['updated_at'])): ?><small>最終保存：<?= $escape(date('Y/m/d H:i',(int)$row['updated_at'])) ?></small><?php endif; ?>
</form></section><?php endforeach; ?>
<?php endif; ?><p><a href="../ku-fudo-demo/">← トップへ戻る</a></p></main></body></html>
