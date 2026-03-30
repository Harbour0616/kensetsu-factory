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
  const [phase, setPhase] = useState<'idle' | 'loading' | 'result'>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setResult(null)
    setPhase('loading')

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      setError('対応形式: PNG, JPEG, GIF, WebP, PDF')
      setPhase('idle')
      return
    }

    try {
      let base64 = ''
      let mediaType = 'image/png'

      if (file.type === 'application/pdf') {
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
        setPreview(pngDataUrl)
        base64 = pngDataUrl.split(',')[1]
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        setPreview(dataUrl)
        base64 = dataUrl.split(',')[1]
        mediaType = file.type
      }

      const res = await scanInvoice(base64, mediaType)
      setResult(res)
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setPhase('idle')
    }
  }, [])

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

      {phase === 'idle' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 40,
        }}>
          <a
            href="/jura_invoice_sample.pdf"
            download="jura_invoice_sample.pdf"
            style={{
              display: 'inline-block', fontFamily: "'DotGothic16',monospace", fontSize: 13,
              color: '#0a1a14', background: '#6effc4', padding: '10px 24px',
              border: '2px solid #3a7a5a', textDecoration: 'none', marginBottom: 8,
              boxShadow: '0 0 12px rgba(110,255,196,0.3)',
            }}
          >
            📄 サンプル請求書をダウンロード
          </a>
          <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#4a8a6a', marginBottom: 32 }}>
            ← まずこれをダウンロードして、下のエリアにドロップしてみてください
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              width: '100%', maxWidth: 480, height: 200,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: `2px dashed ${dragging ? '#6effc4' : '#2a4a3a'}`,
              background: dragging ? '#0a2018' : '#0a1a14',
              cursor: 'pointer', transition: 'all 0.3s',
              boxShadow: dragging ? '0 0 24px rgba(110,255,196,0.3)' : 'none',
            }}
          >
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFileChange} style={{ display: 'none' }} />
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
            <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#6effc4', marginBottom: 8 }}>
              請求書をドロップ
            </p>
            <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#3a6a4a' }}>
              またはクリックして選択
            </p>
          </div>

          {error && (
            <div style={{ marginTop: 16, border: '2px solid #ff6b6b', background: '#1a0a0a', padding: 12, fontFamily: "'DotGothic16',monospace", fontSize: 12, color: '#ff6b6b' }}>
              ⚠ {error}
            </div>
          )}
        </div>
      )}

      {phase === 'loading' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                width: 14, height: 14, background: '#6effc4',
                animation: 'blink 1s step-end infinite',
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
          <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 14, color: '#6effc4' }}>
            AIが読み取り中...
          </p>
        </div>
      )}

      {phase === 'result' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左：画像 */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 28, borderRight: '1px solid #1a3a2a', background: '#050e0a',
          }}>
            <img
              src={preview ?? ''}
              alt="プレビュー"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </div>

          {/* 右：結果 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 28, overflow: 'auto' }}>
            <h2 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: '#f9c74f', marginBottom: 20 }}>
              ▶ 読取結果
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              <ResultCard icon="🏢" label="取引先名" value={result?.vendor ?? ''} />
              <ResultCard icon="💰" label="請求金額" value={result?.amount ?? ''} />
              <ResultCard icon="📅" label="請求日・支払期日" value={result?.date ?? ''} />
              <ResultCard icon="🏗️" label="工事名" value={result?.constructionName ?? ''} />
              <ResultCard icon="📋" label="工事内容" value={result?.constructionItems ?? ''} />
            </div>
            <button
              onClick={() => { setPhase('idle'); setPreview(null); setResult(null) }}
              style={{
                marginTop: 20, fontFamily: "'DotGothic16',monospace", fontSize: 12,
                color: '#6effc4', background: 'transparent',
                border: '1px solid #2a4a3a', padding: '12px 20px', cursor: 'pointer',
              }}
            >
              🔄 もう一度試す
            </button>
          </div>
        </div>
      )}
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
