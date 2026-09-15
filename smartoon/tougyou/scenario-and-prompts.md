# WEBマンガ「統一行（とうぎょう）」シナリオ＆AIプロンプト

作品名：心をリセットする究極の瞑想〜空不動（岩根和朗）先生の「統一行」〜

作成日：2026-09-15
形式：Smartoon／縦スクロール・全10コマ
状態：制作準備稿（画像生成・Webページ実装は未実施）

## この企画の位置づけ

ユーザー提供の全10コマ原稿を、既存スマートゥーンと画風を合わせて制作できるよう整理したもの。既存の人生編「第1話〜第10話」とは別企画として扱い、話数を勝手に割り当てない。

画風の指定先：[既存第1話](https://taf-design.com/ku-fudo-smartoon/episode-01/index.html?v=20260914-finale)。公開URLの画像は今回直接確認できなかったため、GitHub上の同ページのHTML、[共通人物設定](../README.md)、[既存第10話の画像プロンプト](../episode-10/image-prompts.json)を確認して整合させた。画像生成時は実画像を添付して目視照合する。

## 原稿の扱い

以下の「原案のト書き」「原案のセリフ」はユーザーの文言を保持。英語プロンプトは既存シリーズへの画風調整版。

原文中の[1]〜[5]に対応する資料は今回未添付。出典確認済みの引用として扱わず、出典番号を保持した確認待ちの原稿とする。時間、印、用語、実践手順は資料が得られた段階で照合する。

「潜在意識が清められる」「命のエネルギーがフル充電」等は原案における教え・体験の表現であり、本書で科学的効果を検証したものではない。絵の光も内面を示す比喩として扱う。

## 画風・人物の固定

- 先生の顔：第1話の参照画像の目鼻立ち、眼鏡、横へ流す髪型を維持。一般的な「ハンサムな先生」に置き換えない。
- 体型：身長180cm、細身。肩幅・胸板・胴回りを太くしない。
- 年代：今回は独自の年齢を設定せず既存参照の姿を継承する。
- 衣装：後半話の既存設定に合わせ、濃紺スーツ・淡い青の細縞シャツ・青の小紋ネクタイ・控えめなタイピン。コマ2と10で一致させる。
- 読者役：短いダークブラウンの髪、グレーブルーの無地スウェット、ベージュのパンツ。コマ1と4〜9で同一人物。
- 絵柄：大人向けセミフラット2D、整理した濃色輪郭、控えめな陰影。背景は既存話のような奥行きのある室内描写。
- 配色：温かいベージュ、スカイブルー、控えめな金色。原案の太い黒線・完全なフラットベクター指定は既存画風に合わせて調整。

## 生成方法

1. 先生の顔・画風参照として `../episode-01/assets/panel-02.webp` または `panel-01.webp` を添付する。衣装参照には既存第10話の先生の画像を用い、顔の基準とは区別する。
2. 下の「共通プロンプト」＋対象コマの「場面プロンプト」を一緒に入力する。
3. 読者役が初めて生成できたら、以降のコマにもその画像を添付する。部屋・椅子もコマ3の生成画像で固定する。
4. 縦横比9:16、仕上がり目標1080×1920。生成画像の実寸は確認し、引き伸ばして比率を合わせない。
5. 日本語は画像生成後にHTMLまたは編集ソフトで配置。原案の長いセリフは句点で2〜3ブロックに分ける。先生の顔・手には文字を重ねない。

## 共通プロンプト

```text
Create ONE vertical 9:16 Japanese smartoon illustration for the established Ku-fudo series. Use the attached episode-01 character image as the mandatory face and illustration reference; match the existing series rather than inventing a generic handsome anime teacher. Adult-oriented semi-flat 2D illustration, clean moderately bold black-to-dark-grey contours, restrained flat warm skin colors and minimal shadows, natural small eyes, realistic simplified proportions. Backgrounds are warm illustrated everyday rooms with spatial depth, consistent with the existing series. Ku-fudo, when present: the SAME Japanese man as the reference, gently long rounded face, familiar slim rectangular glasses, short dark hair swept sideways in broad masses, 180cm tall and very slim with slender limbs and natural shoulders; preserve reference age. Wardrobe matches the later existing episodes: dark navy single-breasted suit, very pale blue fine striped shirt, blue small-pattern tie, subtle silver tie bar and black dress shoes. Recurring reader, when present: ordinary Japanese adult with short dark-brown hair, grey-blue crewneck sweatshirt and beige trousers, identical face and clothes across panels. Warm beige base with sky-blue and restrained honey-gold accents. Natural anatomy. No photorealistic skin, 3D, glossy anime rendering, chibi, oversized eyes, muscular torso, extreme jawline or generic faceless vector people. No generated text, captions, lettering, speech bubbles, logo or watermark. Keep main subjects away from edges and reserve quiet space for Japanese text added afterward. Spiritual light and clouds are poetic illustrations of inner experience.
```

## コマ1｜現代人の悩み（頭の中のパンク）

**原案のト書き**

スマホやPCに囲まれ、頭の上に「仕事」「人間関係」「将来の不安」といった黒い雑念の渦が巻き起こり、頭を抱えている現代人のシルエット。

**原案のセリフ（ナレーション）**

> 仕事、人間関係、将来の不安……現代人の頭の中は、毎日『雑念』でパンクしそうになっていませんか？

**場面プロンプト（上の共通プロンプトと併用）**

```text
The recurring reader character, an ordinary Japanese adult with short dark-brown hair, a grey-blue crewneck sweatshirt and beige trousers, sits at a desk with a laptop and smartphone, holding their head. Three dark loosely swirling clouds suggest work, relationships and uncertainty. Show the person partly in silhouette but retain recognizable hair and clothing. Muted blue-grey evening room, warm beige desk. Medium-wide three-quarter view. Leave clear space above for narration; do not draw labels or speech bubbles.
```

## コマ2｜空不動（岩根）先生の登場と「統一行」の提示

**原案のト書き**

スーツを着た知的な空不動（岩根和朗）先生が、穏やかで安心感のある笑顔で画面中央に登場。背景にはすっきりとしたスカイブルーの光が広がっている。

**原案のセリフ（岩根先生）**

> 大丈夫です。自分の本質（主体）に帰り、心身を静かにリセットする瞑想——それが『統一行（とうぎょう）』です！

**場面プロンプト（上の共通プロンプトと併用）**

```text
Ku-fudo stands centrally, facing the reader with the same modest reassuring smile as the established character reference. Waist-up view, relaxed shoulders, one hand open near waist level. Soft sky-blue daylight enters a warm illustrated study. His familiar glasses, swept hair and slender face must remain consistent. Keep the upper and lower edges visually quiet for later Japanese dialogue.
```

## コマ3｜時間・場所のセッティング

**原案のト書き**

静かで落ち着いた部屋の一角。壁のシンプルな時計が「20分」を指している室内イラスト[1]。

**原案のセリフ（岩根先生）**

> まずは時間と場所を決めましょう。基本は1日20分（または週1〜2回、30分ずつ）[1]。自分だけの『瞑想空間』を作ることが習慣化のコツです[2]。

**場面プロンプト（上の共通プロンプトと併用）**

```text
A quiet corner of a real Japanese home, a firm chair beside a window, a small plant and a simple timer on a side table. Wide establishing view with warm natural daylight and restrained sky-blue accents. Leave the timer display blank so '20:00' can be typeset afterward. Suggest a repeatable everyday setting with neatly put-away devices. No text, no numerals. Reserve a calm upper area for two short text blocks.
```

## コマ4｜正しい姿勢（3つの座り方と脱力）

**原案のト書き**

正座・結跏趺坐（座禅）・固めの椅子の3パターンで背筋を伸ばし、肩の力を抜いて座る人物のピクトグラム・イラスト[1]。

**原案のセリフ（岩根先生）**

> 姿勢は正座・結跏趺坐・固めの椅子の3つから安定するものを選びます[1]。背筋を伸ばしたら、一気に肩の力を抜いてリラックス！

**場面プロンプト（上の共通プロンプトと併用）**

```text
One vertical instructional illustration showing three clearly separated full-body demonstrations by the SAME recurring reader character: seiza kneeling at the top, full lotus at the middle, and sitting on a firm straight chair at the bottom with both feet flat on the floor. Keep all three in the established semi-flat character style rather than faceless pictograms. Upright comfortable spine, relaxed shoulders, anatomically accurate legs and feet, no exaggerated posture. Three-quarter views, plain warm beige ground, ample spacing and empty areas for labels to be added later. No arrows or labels generated.
```

## コマ5｜手の結び方（「印」の形）

**原案のト書き**

手元のアップ。両手の親指と人差し指で綺麗な円（輪）をつくり、他の指は自然のまま手のひらを上にして膝に乗せている美しいポーズ[1]。

**原案のセリフ（岩根先生）**

> 両手の親指と人差し指で綺麗な円をつくり、他の指は自然のまま、手のひらを上にして軽く膝に乗せます[1]。これで基本の印の完成です[1]。

**場面プロンプト（上の共通プロンプトと併用）**

```text
Close-up looking diagonally down at the recurring reader's two hands resting separately on their own knees, grey-blue sweatshirt cuffs and beige trousers visible. Each palm faces upward. On EACH hand the thumb tip touches the index fingertip to form one soft closed circle; middle, ring and little fingers remain naturally relaxed. Exactly five anatomically correct fingers per hand, correct left and right orientation, no interlocking hands. Make the finger contact unmistakable at smartphone size. Warm soft light and plain background, no symbols.
```

## コマ6｜瞑想の入り方と心構え（気負わない）

**原案のト書き**

静かに目を閉じてリラックスして座る人物。頭上から守護神（超越人格）を象徴するやわらかなゴールドとスカイブルーの光が降り注ぐ[1][2]。

**原案のセリフ（岩根先生）**

> 『うまく統一しよう』と気負う必要はありません[1]。守護神をお呼びし、感謝の言葉を唱えながら、ただ身と心を自分の本質（主体）に委ね切るのです[1][2]。

**場面プロンプト（上の共通プロンプトと併用）**

```text
The same reader sits comfortably on the firm chair established earlier, feet on the floor, eyes gently closed, shoulders relaxed, palms upward on knees with thumb and index fingertips touching. Medium-wide left-facing three-quarter view. A faint warm gold and sky-blue wash descends from the upper window area as a poetic representation of inner experience. Retain the tangible room, plant and timer; do not depict a literal deity, halo, laser or supernatural figure. Generous negative space above.
```

## コマ7｜雑念・現象への対処（重要なポイント）

**原案のト書き**

瞑想する人物の周りを、思考の泡や雲のような雑念が通り過ぎていく。人物は目を閉じたまま動じず静かに座っている[3]。

**原案のセリフ（岩根先生）**

> もし瞑想中に雑念や不思議な感覚が湧いてきても、絶対に意味を詮索しないこと！[3]『ただの消えていく姿』として一切無視して通り越します[3]。

**場面プロンプト（上の共通プロンプトと併用）**

```text
The same seated reader in a calm near-frontal medium view, eyes closed without strain. Soft grey thought-cloud shapes drift sideways past the person and gradually become translucent. Keep the person grounded in the same real room and chair, identical clothing and hand position. No pushing, fighting or distressed expression. The drifting clouds are visual metaphors. Quiet sky-blue background accents. Leave clean upper and lower space for dialogue.
```

## コマ8｜『自明の光！』の照射

**原案のト書き**

湧き出た雑念や不調和な想念に、まばゆいマスタードイエローの『自明の光！』が照らされ、一瞬で浄化・消滅していく演出[4][5]。

**原案のセリフ（岩根先生）**

> 邪魔な想念が出たら、心の中で『自明の光！』と唱えてリセット[5]。あとの処理は守護神にお任せすれば良いのです[3][5]。

**場面プロンプト（上の共通プロンプトと併用）**

```text
A single poetic close scene of the same reader meditating in the familiar room as a broad soft honey-gold and muted mustard-yellow light suffuses the surrounding grey thought clouds, which gently dissolve into the sky-blue daylight. Keep warm white at the center without harsh contrast. The light represents an inner image, never a weapon, laser, explosion or externally verified event. Reader remains relaxed and anatomically normal. Reserve clear top-center space for the separately typeset Japanese phrase.
```

## コマ9｜瞑想後の変化（命の充電）

**原案のト書き**

瞑想を終えてパッと目を開けた人物のすっきりとした表情。胸の奥から温かい輝きが溢れ、エネルギーが満ちている[2]。

**原案のセリフ（ナレーション）**

> たった20分。潜在意識が清められ、命のエネルギーがフル充電される至福のひととき[2]。

**場面プロンプト（上の共通プロンプトと併用）**

```text
The SAME reader opens their eyes after meditation, with a small unforced refreshed smile and relaxed shoulders. Three-quarter close-to-medium view facing screen right, identical grey-blue sweatshirt and hairstyle. A very subtle warm glow near the chest represents the character's subjective feeling. Same chair and everyday room in soft morning daylight. Preserve facial identity from panel 1; no transformation of body, no battery icon and no clinical or scientific diagrams. Quiet lower margin for narration.
```

## コマ10｜読者へのおすすめメッセージ（ラストショット）

**原案のト書き**

スーツ姿の岩根（空不動）先生が、あたたかい笑顔で読者に向かって優しく手を差し出しているラストカット。

**原案のセリフ（岩根先生）**

> 自分を愛し、命の故郷（超越意識）へと還る『統一行』[1]。あなたも今日から、この安心と平穏を体験してみませんか？

**場面プロンプト（上の共通プロンプトと併用）**

```text
Ku-fudo faces the viewer in a welcoming final medium-full shot, extending one relaxed open hand toward the reader with mild perspective, the other arm resting naturally. Identical established face, glasses, swept hair, tall very slim proportions and navy suit. A bright ordinary garden beyond the study window, soft sky-blue and warm gold daylight. Modest reassuring smile, no exaggerated charisma or heroic pose. Keep the extended hand anatomically correct and fully visible. Leave ample clean space at top and bottom for final dialogue.
```

## コマ固有の制作確認

| コマ | 確認事項 |
| --- | --- |
| 1 | 「仕事」「人間関係」「将来の不安」は後から文字で配置する。 |
| 2 | タイトルや初出の「統一行」に「とうぎょう」の読みを付ける。 |
| 3 | 通常の壁時計では所要時間20分が明確にならないため、制作案ではタイマーに変更し「20:00」を後入れする。 |
| 4 | 3姿勢を縦に並べる。結跏趺坐の脚、椅子の足裏、背筋と肩の位置を個別に目視確認する。 |
| 5 | 両手それぞれで親指と人差し指を接触させる。指の数、手の左右、掌の向きを拡大確認する。 |
| 6 | 守護神の具体的な容貌は新設しない。原案の象徴的な光で表現する。 |
| 7 | 「一切無視」の対象は原文の雑念・現象。別種の危険や現実の問題全般への指示に広げない。 |
| 8 | 「自明の光！」は文字を後入れする。攻撃魔法のような強いビームにしない。 |
| 9 | 原案の効果表現は出典確認待ち。掲載用に弱める場合の候補は「静かに自分と向き合う20分。心に、ひと息つける時間を。」。原文は上に保持。 |
| 10 | コマ2と先生の顔・眼鏡・スーツを照合。手の指と遠近法を確認する。 |

## 制作ファイルの命名案

画像：`assets/panel-01.webp` 〜 `assets/panel-10.webp`

本書は企画書のみ。画像、公開ページ、既存話へのメニュー追加は未制作。

