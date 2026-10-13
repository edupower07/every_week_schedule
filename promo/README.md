# インスタ告知用 PR動画・カバー（週案作成くん）

インスタのリール用（9:16・1080×1920・約74秒・30fps）。**Remotion** で作る。
音は入れていない（インスタのアプリ内でBGMを付ける前提。後から足す手順は下）。

```
promo/
├── capture.cjs        アプリをモックで動かして「決め絵」を撮る（架空の5年1組）
├── 投稿文.txt          リールに付けるキャプション（受け取り方・できること20個・ハッシュタグ）
├── shots/             撮った静止画（撮り直せるのでコミットしない）
├── fonts/             アプリの書体 BIZ UDPゴシック（取り直せるのでコミットしない）
└── remotion/
    ├── src/Reel.tsx   動画本体（フック → 全景 → できること20個 → まとめ → 配布の案内）
    ├── src/Cover.tsx  リールのカバー画像
    ├── src/parts.tsx  画像の切り抜き・ロゴ・ボタン演出などの部品
    ├── src/theme.tsx  フォント読み込み・色・動きの補助
    ├── stills.mjs     要所の静止画をまとめて書き出す（確認用）
    └── public/        素材（shots と fonts のコピー。コミットしない）
```

## 作り直す手順

```bash
# 0. アプリの書体を手元に落とす（Chromium は Google Fonts に直接つながらないため）
python3 <remotion-app-video スキル>/scripts/fetch_fonts.py "BIZ UDPGothic:wght@400;700" -o promo/fonts

# 1. 決め絵を撮る（promo/shots/ に約30枚と rects.json）
NODE_PATH=$(npm root -g) node promo/capture.cjs

cd promo/remotion
npm ci

# 2. 素材を public/ に置く
mkdir -p public/fonts public/shots
for f in yusei-magic zen-kaku-gothic-new zen-maru-gothic; do
  cp -r <Fukuda-app>/packages/fonts/$f public/fonts/
done
cp -r ../fonts/biz-udpgothic public/fonts/
cp ../shots/*.png public/shots/ && cp ../shots/rects.json src/rects.json

# 3. 静止画で確認（秒を並べる）
SCALE=0.5 node stills.mjs 9.1 12 37.1 70

# 4. 書き出し
npm run render                                   # → out/reel.mp4（約10分）
npx remotion still src/index.ts cover out/cover.png \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

## 変えたくなりそうな所

| 何を | どこを |
|---|---|
| コメントで書いてもらう合言葉（いまは「週案」） | `src/Reel.tsx` の `KEYWORD` |
| アカウント名（カバー右下） | `src/Cover.tsx` の `HANDLE` |
| 機能の見出し・補足・秒数 | `src/Reel.tsx` の `FEATURES`（1つ＝1機能） |
| 最後の案内（フォロー／いいね／リポスト／コメント） | `src/Reel.tsx` の `STEPS` と `Cta` |

## BGMを後から入れる

```bash
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
$FF -y -i out/reel.mp4 -i BGM.mp3 -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest \
  -af "afade=t=out:st=71:d=2.5" out/reel-bgm.mp4
```

## 構成

| 秒 | 中身 |
|---|---|
| 0.0–3.6 | フック。黒地に「週案は手書き、時数はExcel、メモは付せん…」→ 白フラッシュで「ぜんぶ、これ1つで。」 |
| 3.6–6.8 | アプリ名と全景。「できること20個 ぜんぶ見せます👇」 |
| 6.8–63.0 | できること 01〜20。章（つくる／書く／数える／印刷する／ためる／Geminiと／守る）ごとに色を変える |
| 63.0–66.0 | まとめ。20個を並べて「これ全部、無料。」 |
| 66.0–73.5 | 配布の案内。①フォロー ②いいね ③リポスト ④コメントに「週案」→ DMで配布リンク |

## つくりの方針

- **素材は実画面の静止画、動きは Remotion 側で毎フレーム計算。** 録画は使わない（25fps由来のカクつきが出る）
- **CMなのでカーソルは映さない。** 押したボタンは切り抜いて拡大し、波紋で示す
- **データはすべて架空。** 5年1組・児童名は「Aさん」のような記号のみ。学校名は出さない
- 撮影時の画面は 1180×1000・deviceScaleFactor 2。`rects.json` に各コマ・ボタンの位置（画像のピクセル座標）を
  書き出しているので、動画側はそれを使って寄ったり囲んだりする
- リールの上（約220px）と下（約450px）、右のボタン列は文字を置かない
- カバーは `instagram-cover-image` スキルの「型I カラーブロック（校務効率化の配色）」。
  プロフィールのグリッドでは中央3:4（y=240〜1680）しか見えないので、文字と画面はすべてその中

## この環境での注意

- Remotion は `--browser-executable` に **headless_shell** を指定する（`npm run render` に入れてある）
- フォントは名前指定だけでは効かない。`public/fonts/` の実体を読ませ、読み終わるまで `delayRender` で止めている
- 撮影は時計を `2026-10-21 16:20 (JST)` に止めている。タイムゾーンを付けないと日付が1日ずれる
