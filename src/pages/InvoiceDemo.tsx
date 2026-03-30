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
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runScan = useCallback(async (base64: string, mediaType: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await scanInvoice(base64, mediaType)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setResult(null)

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
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const context = canvas.getContext('2d')!
        await page.render({ canvasContext: context, viewport, canvas }).promise
        const pngDataUrl = canvas.toDataURL('image/png')
        runScan(pngDataUrl.split(',')[1], 'image/png')
      } catch {
        setError('PDFの読み込みに失敗しました')
      }
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      runScan(dataUrl.split(',')[1], file.type)
    }
    reader.readAsDataURL(file)
  }, [runScan])

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

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#06100e' }}>
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

      {/* Main: 1カラム中央寄せ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 40px', maxWidth: 640, margin: '0 auto', width: '100%',
        overflow: 'auto',
      }}>
        {error && (
          <div style={{ border: '2px solid #ff6b6b', background: '#1a0a0a', padding: 16, marginBottom: 20, fontFamily: "'DotGothic16',monospace", fontSize: 12, color: '#ff6b6b', width: '100%' }}>
            ⚠ {error}
          </div>
        )}

        {loading ? (
          /* Loading */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
            <h2 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: '#f9c74f', marginBottom: 4 }}>
              ▶ 読取結果
            </h2>
            <ResultCard icon="🏢" label="取引先名" value={result.vendor} />
            <ResultCard icon="💰" label="請求金額" value={result.amount} />
            <ResultCard icon="📅" label="請求日・支払期日" value={result.date} />
            <ResultCard icon="🏗" label="工事名" value={result.constructionName} />
            <ResultCard icon="📋" label="工事内容" value={result.constructionItems} />
            <button
              onClick={reset}
              style={{
                fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#6effc4', background: 'transparent',
                border: '1px solid #3a7a5a', padding: '14px 20px', cursor: 'pointer', marginTop: 8,
              }}
            >
              もう一度試す
            </button>
          </div>
        ) : (
          /* Initial: Download + Drop zone */
          <>
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
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
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', height: 200, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                border: `2px dashed ${dragging ? '#6effc4' : '#2a4a3a'}`, background: dragging ? '#0a2018' : '#0a1a14',
                cursor: 'pointer', transition: 'all 0.3s',
                boxShadow: dragging ? '0 0 24px rgba(110,255,196,0.3)' : 'none',
              }}
            >
              <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFileChange} style={{ display: 'none' }} />
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 14, color: '#6effc4', marginBottom: 10 }}>
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
        )}
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
