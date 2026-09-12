# 更新ZIPのダウンロード

GitHubの画面でZIPをクリックしても中身は表示されず、ダウンロードボタンが分かりにくいことがあります。
下のリンクを右クリック→「名前を付けてリンク先を保存」か、そのままクリックしてください。ブラウザのダウンロードフォルダに保存されます。

## 最新（2026年9月12日）議事録・地区のお知らせ
- ku-fudo-operations-20260912.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-operations-20260912.zip
  設置手順: [xserver-chat/OPERATIONS-guide.md](xserver-chat/OPERATIONS-guide.md)

## その他の更新ZIP
- ku-fudo-TOP-latest-20260911.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-TOP-latest-20260911.zip
- ku-fudo-two-versions-20260911.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-two-versions-20260911.zip
- ku-fudo-mypage-20260911.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-mypage-20260911.zip
- ku-fudo-curriculum-20260911.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-curriculum-20260911.zip
- ku-fudo-curriculum-OLD-20260911.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-curriculum-OLD-20260911.zip
- ku-fudo-complete.zip（初回設置用）
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-complete.zip
- ku-fudo-chat-update.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-chat-update.zip
- ku-fudo-redo-update.zip
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-redo-update.zip

## 「ウイルスを検出しました」と出てダウンロードできない場合
ZIPの中身は index.php / chat.js / operations.php / operations.css / operations.js と説明テキストだけで、危険なコードは入っていません。Windows Defender の機械学習による誤検知です。次のいずれかで回避できます。

### 方法1: 別形式のZIP（圧縮なし・英数字ファイル名）
- ku-fudo-operations-20260912b.zip（中身は同じ。説明は SETUP-ja.txt）
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/updates/ku-fudo-operations-20260912b.zip

### 方法2: ZIPを使わず5ファイルを個別に保存する
リンクを右クリック→「名前を付けてリンク先を保存」で、ファイル名はそのままにして保存してください。5ファイルとも taf-design.com/public_html/ku-fudo-chat にアップロードします。
- index.php
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/ku-fudo-chat/index.php
- chat.js
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/ku-fudo-chat/chat.js
- operations.php
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/ku-fudo-chat/operations.php
- operations.css
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/ku-fudo-chat/operations.css
- operations.js
  https://raw.githubusercontent.com/810eigo-droid/ku-fudo/main/xserver-chat/ku-fudo-chat/operations.js

設置手順テキスト: [xserver-chat/OPERATIONS-guide.md](xserver-chat/OPERATIONS-guide.md)

### 方法3: Windows セキュリティで許可する
1. スタート→「Windows セキュリティ」→「ウイルスと脅威の防止」→「保護の履歴」を開きます。
2. ku-fudo-operations-20260912.zip の項目を開き、「操作」→「許可」または「復元」を選びます。
3. もう一度ダウンロードします。

## GitHubの画面から取る場合
1. リポジトリで xserver-chat → updates → 目的のZIPをクリックします。
2. 「View raw」または右上のダウンロードアイコン（下向き矢印）を押します。
   スマホ表示ではボタンが出ないことがあります。その場合は上の直リンクを使ってください。

## ダウンロードページ
GitHub Pagesが有効な場合は次のページからも取れます。
https://810eigo-droid.github.io/ku-fudo/downloads.html

ZIPには会員情報・パスワード・config.php・データベースは含まれていません。
