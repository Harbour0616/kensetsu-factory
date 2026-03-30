import { useState, useCallback, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { scanInvoice, type OcrResult } from '../lib/ocr'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

export default function InvoiceDemo() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileData, setFileData] = useState<{ base64: string; mediaType: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setResult(null)
    setFileData(null)

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      setError('対応形式: PNG, JPEG, GIF, WebP, PDF')
      return
    }

    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const context = canvas.getContext('2d')!
        await page.render({ canvasContext: context, viewport, canvas }).promise
        const pngDataUrl = canvas.toDataURL('image/png')
        setPreview(pngDataUrl)
        setFileData({ base64: pngDataUrl.split(',')[1], mediaType: 'image/png' })
      } catch {
        setError('PDFの読み込みに失敗しました')
      }
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setPreview(dataUrl)
      setFileData({ base64: dataUrl.split(',')[1], mediaType: file.type })
    }
    reader.readAsDataURL(file)
  }, [])

  const startScan = useCallback(async () => {
    if (!fileData) return
    setLoading(true)
    setError(null)
    try {
      const res = await scanInvoice(fileData.base64, fileData.mediaType)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [fileData])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#06100e', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 32px', borderBottom: '2px solid #1a3a2a', background: '#050e0a', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28 }}>🧾</span>
          <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 18, color: '#6effc4', textShadow: '0 0 12px #6effc4', letterSpacing: 1 }}>
            請求書スキャナー
          </span>
        </div>
        <button
          onClick={() => { window.location.href = '/' }}
          style={{
            fontFamily: "'DotGothic16',monospace", fontSize: 12, color: '#6effc4', background: 'transparent',
            border: '1px solid #1a3a2a', padding: '8px 18px', cursor: 'pointer',
          }}
        >
          ← 工場に戻る
        </button>
      </header>

      {/* Main 2-column */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Upload */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, borderRight: '1px solid #1a3a2a', overflow: 'auto' }}>
          {!preview ? (
            <>
            {/* Sample download */}
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <a
                href="/jura_invoice_sample.pdf"
                download="jura_invoice_sample.pdf"
                style={{
                  display: 'inline-block', fontFamily: "'DotGothic16',monospace", fontSize: 13,
                  color: '#0a1a14', background: '#6effc4', padding: '10px 24px',
                  border: '2px solid #3a7a5a', textDecoration: 'none', cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(110,255,196,0.3)',
                }}
              >
                📄 サンプル請求書をダウンロード
              </a>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#4a8a6a', marginTop: 8 }}>
                ← まずこれをダウンロードして、下のエリアにドロップしてみてください
              </p>
            </div>
            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: `2px dashed ${dragging ? '#6effc4' : '#2a4a3a'}`, background: dragging ? '#0a2018' : '#0a1a14',
                cursor: 'pointer', transition: 'all 0.3s',
                boxShadow: dragging ? '0 0 24px rgba(110,255,196,0.3)' : 'none',
              }}
            >
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFileChange} style={{ display: 'none' }} />
              <div style={{ fontSize: 60, marginBottom: 20 }}>🧾</div>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 14, color: '#6effc4', marginBottom: 12 }}>
                請求書をドロップ
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                style={{
                  fontFamily: "'DotGothic16',monospace", fontSize: 11, color: '#6effc4', background: 'transparent',
                  border: '1px solid #3a7a5a', padding: '8px 20px', cursor: 'pointer',
                }}
              >
                またはファイルを選択
              </button>
            </div>
            </>
          ) : (
            /* Preview + Scan button */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1a14', border: '1px solid #1a3a2a', marginBottom: 16 }}>
                <img src={preview ?? ''} alt="プレビュー" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => { setPreview(null); setFileData(null); setResult(null); setError(null) }}
                  style={{
                    fontFamily: "'DotGothic16',monospace", fontSize: 11, color: '#6effc4', background: 'transparent',
                    border: '1px solid #2a4a3a', padding: '12px 20px', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  別のファイル
                </button>
                <button
                  onClick={startScan}
                  disabled={loading}
                  style={{
                    flex: 1, fontFamily: "'Press Start 2P',monospace", fontSize: 11,
                    color: loading ? '#4a9e7a' : '#0a1a14', background: loading ? '#1a3a2a' : '#6effc4',
                    border: 'none', padding: '14px 20px', cursor: loading ? 'default' : 'pointer',
                  }}
                >
                  {loading ? '読み取り中...' : '▶ 読み取り開始'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, overflow: 'auto' }}>
          {error && (
            <div style={{ border: '2px solid #ff6b6b', background: '#1a0a0a', padding: 16, marginBottom: 20, fontFamily: "'DotGothic16',monospace", fontSize: 12, color: '#ff6b6b' }}>
              ⚠ {error}
            </div>
          )}

          {loading ? (
            /* Loading */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} style={{
                    width: 14, height: 14, background: '#6effc4',
                    animation: `blink 1s step-end infinite`, animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
              </div>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 14, color: '#6effc4' }}>
                AIが読み取り中...
              </p>
            </div>
          ) : result ? (
            /* Results */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: '#f9c74f', marginBottom: 4 }}>
                ▶ 読取結果
              </h2>
              <ResultCard icon="🏢" label="取引先名" value={result.vendor} />
              <ResultCard icon="💰" label="請求金額" value={result.amount} />
              <ResultCard icon="📅" label="請求日" value={result.date} />
              <ResultCard icon="🏦" label="振込先" value={result.bankAccount} />
              {result.raw && result.raw !== JSON.stringify({ vendor: result.vendor, amount: result.amount, date: result.date, bankAccount: result.bankAccount }) && (
                <ResultCard icon="📝" label="その他備考" value={result.raw.replace(/\{[\s\S]*\}/, '').trim() || 'なし'} />
              )}
            </div>
          ) : (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 14, color: '#334433' }}>
                ← 請求書をアップロードしてください
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #1a3a2a', background: '#0a1a14', padding: '14px 18px' }}>
      <div style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#6effc4', marginBottom: 6, letterSpacing: 1 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: "'DotGothic16',monospace", fontSize: 16, color: '#d4edd8', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  )
}
