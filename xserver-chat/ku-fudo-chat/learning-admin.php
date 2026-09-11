<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
$u=requireUser();requireAdmin($u);
if ((int)$u['must_change']) { fail('初回パスワードを変更してください。',403); }
if (($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='GET') { fail('閲覧専用の画面です。',405); }
$lessons=json_decode('[{"id": "yUsA5PHWJeg", "title": "自明行とは何か／前半／会員向けからの抜粋", "url": "https://www.youtube.com/watch?v=yUsA5PHWJeg&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=23"}, {"id": "ZQJCpaHgnEc", "title": "自明行とは何か／後半／会員向けからの抜粋", "url": "https://www.youtube.com/watch?v=ZQJCpaHgnEc&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=24"}, {"id": "k3bWGxIxn4g", "title": "第三部［１］自明行の導入／第９回札幌講演会", "url": "https://www.youtube.com/watch?v=k3bWGxIxn4g&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=6"}, {"id": "uk5PHAL4w0U", "title": "【5-7】正しい喜びの自覚／人類滅亡を救う自明論", "url": "https://www.youtube.com/watch?v=uk5PHAL4w0U&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=21"}, {"id": "6EJ4ZIFUxPk", "title": "【4】自明行の準備／「人類愛の祈り」で宇宙に共鳴する", "url": "https://www.youtube.com/watch?v=6EJ4ZIFUxPk&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=1"}, {"id": "lNlSeXO-YSA", "title": "自明行の落とし穴", "url": "https://www.youtube.com/watch?v=lNlSeXO-YSA&list=PLF6CxVYhczrAPQIziAzqN1O1w8TbSAyQN&index=25"}]',true,512,JSON_THROW_ON_ERROR);
$escape=fn($v):string=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
$search=value($_GET,'q',60);
$page=filter_var($_GET['page'] ?? '1',FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100000]]);
if ($page===false) { fail('ページ番号を確認してください。'); }
$where="deleted_at=0 AND (?='' OR instr(name,?)>0)";
$total=(int)query('SELECT count(*) FROM users WHERE '.$where,[$search,$search])->fetchColumn();
$members=query('SELECT id,name,active FROM users WHERE '.$where.' ORDER BY id LIMIT 50 OFFSET '.(($page-1)*50),[$search,$search])->fetchAll();
$records=[];
$exists=query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='learning_notes'")->fetchColumn();
if ($exists && $members) {
 $ids=array_column($members,'id');$placeholders=implode(',',array_fill(0,count($ids),'?'));
 // Select only progress; personal note text is never loaded for this view.
 foreach(query('SELECT user_id,lesson_id,watched,updated_at FROM learning_notes WHERE user_id IN ('.$placeholders.')',$ids)->fetchAll() as $r) { $records[$r['user_id']][$r['lesson_id']]=$r; }
}
header('Content-Type: text/html; charset=utf-8');
header("Content-Security-Policy: default-src 'self'; script-src 'none'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
?>
<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>会員の視聴状況｜じねんネットワーク</title><link rel="stylesheet" href="learning.css"></head><body><header><a href="./?account=1">じねんネットワーク<span>管理者用</span></a></header><nav><a href="./?account=1">会員管理へ戻る</a><a href="learning.php">自分のマイページ</a></nav><main><h1>会員の視聴状況</h1><p>人間やりなおし · 全6レッスン</p><p>ご本人がチェックして保存した視聴状況です。動画の再生時間を自動計測した記録ではありません。</p><form method="get" action="learning-admin.php"><label for="search">お名前で探す</label><input id="search" name="q" maxlength="60" value="<?= $escape($search) ?>"><button class="primary">検索する</button></form><p><?= $total ?>人中 <?= count($members) ?>人を表示</p>
<?php if (!$members): ?><p>該当する会員はいません。</p><?php endif; ?>
<?php foreach($members as $member): $saved=$records[$member['id']] ?? [];$done=0;foreach($lessons as $l){$done+=(int)($saved[$l['id']]['watched'] ?? 0);} ?>
<section class="card"><h2><?= $escape($member['name']) ?>さん <?= (int)$member['active']?'':'（利用停止中）' ?></h2><p><strong><?= $done ?> / 6 レッスン 視聴済み</strong></p><ul>
<?php foreach($lessons as $i=>$l): $r=$saved[$l['id']] ?? null; ?><li><strong><?= (int)($r['watched'] ?? 0)?'✓ 視聴済み':'未チェック' ?></strong> · <?= $i+1 ?>. <?= $escape($l['title']) ?></li><?php endforeach; ?>
</ul></section><?php endforeach; ?>
<div><?php if ($page>1): ?><a class="secondary" href="?q=<?= rawurlencode($search) ?>&amp;page=<?= $page-1 ?>">前の50人</a><?php endif; ?> <?php if ($page*50<$total): ?><a class="secondary" href="?q=<?= rawurlencode($search) ?>&amp;page=<?= $page+1 ?>">次の50人</a><?php endif; ?></div></main></body></html>
