# PLAB 実験室（携帯電話向け）

Polygon Amoyのテスト用PLABで、単純送金、Vault（本人別の預入・引出）、Escrow（期限付きの資金保留・決済・返金）を体験する静的サイトです。Splitterは決済額をBへ70%、Cへ30%に分配します。

[予備試験を開く](https://deasuke.github.io/plab-lab/?invite=self-a-20261020)

## 現在の準備状況

- 画面、MetaMask接続処理、11操作の順序制御、取引検証、結果JSON出力を実装。
- 既存PLAB・Vault・Splitterを利用。参加者ごとに専用Escrowを用意する設計。
- ご自身の予備試験用にAを登録。実験サイトの公開承認を受領。新規デプロイ・資金配布は未実行。
- 初期対応はMetaMask。他のウォレットアプリは未対応。iOS/Android実機での接続・署名・アプリ往復確認は残っています。

## 実験の流れ

| 操作 | 内容 |
|---|---|
| 1 | 自分からBへ10 PLABを送金 |
| 2–5 | Vaultへ200 PLABの利用許可 → 200預入 → 50引出 → 150引出 |
| 6–8 | 専用Escrowへ100 PLABの利用許可 → 注文作成 → Bへ70/Cへ30を決済 |
| 9–11 | 専用Escrowへ40 PLABの利用許可 → 注文作成 → 180秒経過後に返金 |

開始400 PLAB、正常終了290 PLAB。Bへ合計80、Cへ30 PLABが移動します。POLは手数料に使い、画面からPOL送金は行いません。承認上限はその操作に必要な数量に限定します。

決済用100 PLAB注文の期限は24時間です。期限を過ぎた場合は100 PLABを本人へ返金でき、その回は「決済実験未完了」で終了します。

## 文書

- [ご自身の携帯で行う予備試験](PRETRIAL.md)
- [主催者の準備・公開手順](OPERATOR.md)
- [参加者の操作手順](PARTICIPANT.md)
- [検証結果と残る確認](VALIDATION.md)

## 開発

Node.js 24 / pnpm 11.25.0を使用します。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm build
pnpm preview
```

`public/lab.json`は公開用設定です。Chain ID・コントラクトアドレス・公開アドレス・公開RPCのみを含めます。秘密鍵、APIキー、専用RPC、キーストアは入れません。トークンはChain ID 80002とPLABコントラクトアドレスの組で識別します。

初期画面の「見本」はウォレット接続・取引なしで11操作の画面遷移を確認できます。見本はチェーン上の実験成功を示しません。
