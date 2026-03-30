export interface OcrResult {
  vendor: string
  amount: string
  date: string
  constructionName: string
  constructionItems: string
}

export async function scanInvoice(base64: string, mediaType: string): Promise<OcrResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('VITE_ANTHROPIC_API_KEY が設定されていません。.env.local にキーを追加してください。')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: `この請求書画像から以下の情報を読み取ってJSON形式で返してください。
読み取れない項目は "不明" としてください。

- vendor: 請求書の宛先（「御中」の前の会社名）
- amount: 税込合計金額
- date: 請求日と支払期日（例: "請求日：2026/03/31 / 支払期日：2026/04/30"）
- constructionName: 「工事名：」の後に書かれたテキスト
- constructionItems: 明細テーブルの各行を「品目名 / 数量 単位 / 単価 / 金額」の形式で1行ずつ箇条書き

{
  "vendor": "株式会社ティラノ工務店",
  "amount": "1,650,000",
  "date": "請求日：2026/03/31 / 支払期日：2026/04/30",
  "constructionName": "横浜市港北区A棟外壁改修工事",
  "constructionItems": "・外壁塗装工事（A棟） / 1式 / 800,000円 / 800,000円\\n・防水シート施工 / 250m² / 2,200円 / 550,000円\\n・足場設置・解体 / 1式 / 150,000円 / 150,000円"
}

JSONのみ返してください。説明文は不要です。`,
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API Error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text: string = data.content[0].text

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { vendor: '不明', amount: '不明', date: '不明', constructionName: '不明', constructionItems: '不明' }
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    vendor: parsed.vendor || '不明',
    amount: parsed.amount || '不明',
    date: parsed.date || '不明',
    constructionName: parsed.constructionName || '不明',
    constructionItems: parsed.constructionItems || '不明',
  }
}
