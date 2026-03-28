export interface OcrResult {
  vendor: string
  amount: string
  date: string
  bankAccount: string
  raw: string
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

{
  "vendor": "取引先名（請求元の会社名）",
  "amount": "請求金額（税込）",
  "date": "請求日（YYYY/MM/DD）",
  "bankAccount": "振込先口座情報"
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
    return { vendor: '不明', amount: '不明', date: '不明', bankAccount: '不明', raw: text }
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    vendor: parsed.vendor || '不明',
    amount: parsed.amount || '不明',
    date: parsed.date || '不明',
    bankAccount: parsed.bankAccount || '不明',
    raw: text,
  }
}
