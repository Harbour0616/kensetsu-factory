import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { scanInvoice, type OcrResult } from '../lib/ocr'

export default function InvoiceDemo() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    setResult(null)

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      setError('対応形式: PNG, JPEG, GIF, WebP, PDF')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      setPreview(dataUrl)

      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type

      setLoading(true)
      try {
        const res = await scanInvoice(base64, mediaType)
        setResult(res)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  return (
    <div className="min-h-screen bg-[#06100e] text-[#6effc4] font-dot">
      {/* Header */}
      <div className="border-b-2 border-[#1a3a2a] bg-[#050e0a] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-2xl">🧾</span>
          <h1 className="font-pixel text-xs leading-relaxed">
            請求書スキャナー<br />
            <span className="text-[8px] text-[#d4edd8]">INVOICE SCANNER DEMO</span>
          </h1>
        </div>
        <button
          onClick={() => navigate('/')}
          className="font-dot text-xs text-[#6effc4] border border-[#1a3a2a] px-4 py-2 hover:bg-[#0a2018] transition-colors"
        >
          ← 工場に戻る
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`
            border-2 border-dashed rounded-none p-12 text-center cursor-pointer transition-all
            ${dragging
              ? 'border-[#6effc4] bg-[#0a2018] shadow-[0_0_24px_rgba(110,255,196,0.3)]'
              : 'border-[#1a3a2a] hover:border-[#3a7a5a] bg-[#0a1410]'}
          `}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={onFileChange}
            className="hidden"
          />
          <div className="text-4xl mb-4">📄</div>
          <p className="font-dot text-sm mb-2">
            請求書の画像・PDFをドラッグ＆ドロップ
          </p>
          <p className="font-dot text-xs text-[#445544]">
            またはクリックしてファイルを選択（PNG, JPEG, PDF）
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 border-2 border-[#ff6b6b] bg-[#1a0a0a] p-4 font-dot text-sm text-[#ff6b6b]">
            ⚠ {error}
          </div>
        )}

        {/* Preview + Results */}
        {preview && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Image Preview */}
            <div className="border-2 border-[#1a3a2a] bg-[#0a1410] p-4">
              <h2 className="font-pixel text-[10px] mb-4 text-[#f9c74f]">▶ アップロード画像</h2>
              <img
                src={preview}
                alt="請求書プレビュー"
                className="w-full object-contain max-h-[400px]"
              />
            </div>

            {/* Results */}
            <div className="border-2 border-[#1a3a2a] bg-[#0a1410] p-4">
              <h2 className="font-pixel text-[10px] mb-4 text-[#f9c74f]">▶ OCR読取結果</h2>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="text-3xl mb-4 animate-pulse">⚙️</div>
                  <p className="font-dot text-sm animate-pulse">AIが読み取り中...</p>
                </div>
              ) : result ? (
                <div className="space-y-4">
                  <ResultRow label="取引先名" value={result.vendor} icon="🏢" />
                  <ResultRow label="請求金額" value={result.amount} icon="💰" />
                  <ResultRow label="請求日" value={result.date} icon="📅" />
                  <ResultRow label="振込先" value={result.bankAccount} icon="🏦" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-[#445544]">
                  <p className="font-dot text-sm">結果がここに表示されます</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage Note */}
        <div className="mt-8 border border-[#1a3a2a] bg-[#050e0a] p-6">
          <h3 className="font-pixel text-[8px] text-[#f9c74f] mb-3">▶ 使い方</h3>
          <ul className="font-dot text-xs text-[#d4edd8] space-y-2 leading-relaxed">
            <li>1. 請求書の写真またはPDFをドラッグ＆ドロップ</li>
            <li>2. AIが取引先名・金額・日付・振込先を自動読み取り</li>
            <li>3. 結果を確認して業務に活用</li>
          </ul>
          <p className="font-dot text-[10px] text-[#445544] mt-4">
            ※ デモ版です。読み取り精度は画像品質に依存します。
          </p>
        </div>
      </div>
    </div>
  )
}

function ResultRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="border border-[#1a3a2a] bg-[#050e0a] p-3">
      <div className="font-dot text-[10px] text-[#445544] mb-1">{icon} {label}</div>
      <div className="font-dot text-sm text-[#6effc4]">{value}</div>
    </div>
  )
}
