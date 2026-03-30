import { useState, useCallback, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { scanInvoice, type OcrResult } from '../lib/ocr'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

const createSteps = [
  '📋 データを入力中...',
  '🔢 金額を計算中...',
  '📄 請求書を生成中...',
  '✅ 粗利マネージャーに反映中...',
]

export default function InvoiceDemo() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'scan' | 'create'>('scan')
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'loading' | 'result'>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Create tab state
  const [createPhase, setCreatePhase] = useState<'form' | 'loading' | 'done'>('form')
  const [form, setForm] = useState({
    vendor: '',
    amount: '',
    date: '',
    constructionName: '',
    constructionItems: '',
  })
  const [createStep, setCreateStep] = useState(0)

  // Create loading animation
  useEffect(() => {
    if (createPhase !== 'loading') return
    setCreateStep(0)
    const timer = setInterval(() => {
      setCreateStep(prev => {
        if (prev >= createSteps.length - 1) {
          clearInterval(timer)
          setTimeout(() => setCreatePhase('done'), 800)
          return prev
        }
        return prev + 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [createPhase])

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

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0a1a14', border: '1px solid #2a4a3a', color: '#d4edd8',
    fontFamily: "'DotGothic16',monospace", fontSize: 14, padding: '10px 14px',
    outline: 'none', boxSizing: 'border-box',
  }

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

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a3a2a', background: '#050e0a' }}>
        {(['scan', 'create'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: "'DotGothic16',monospace", fontSize: 13,
            padding: '12px 32px', cursor: 'pointer', border: 'none',
            background: tab === t ? '#0a2018' : 'transparent',
            color: tab === t ? '#6effc4' : '#3a6a4a',
            borderBottom: tab === t ? '2px solid #6effc4' : '2px solid transparent',
          }}>
            {t === 'scan' ? '📥 スキャン' : '📝 作成'}
          </button>
        ))}
      </div>

      {/* ===== Scan Tab ===== */}
      {tab === 'scan' && (
        <>
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
        </>
      )}

      {/* ===== Create Tab ===== */}
      {tab === 'create' && (
        <>
          {createPhase === 'form' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', padding: '32px 40px', overflow: 'auto',
            }}>
              <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <h2 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: '#f9c74f', marginBottom: 4 }}>
                  ▶ 請求書を作成
                </h2>

                <FormField label="🏢 取引先名" value={form.vendor}
                  onChange={v => setForm(f => ({ ...f, vendor: v }))} inputStyle={inputStyle} />
                <FormField label="💰 請求金額" value={form.amount}
                  onChange={v => setForm(f => ({ ...f, amount: v }))} inputStyle={inputStyle} />
                <FormField label="📅 請求日" value={form.date}
                  onChange={v => setForm(f => ({ ...f, date: v }))} inputStyle={inputStyle} />
                <FormField label="🏗️ 工事名" value={form.constructionName}
                  onChange={v => setForm(f => ({ ...f, constructionName: v }))} inputStyle={inputStyle} />

                <div>
                  <div style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#6effc4', marginBottom: 6, letterSpacing: 1 }}>
                    📋 工事内容
                  </div>
                  <textarea
                    value={form.constructionItems}
                    onChange={e => setForm(f => ({ ...f, constructionItems: e.target.value }))}
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical' }}
                    onFocus={e => { e.target.style.borderColor = '#6effc4' }}
                    onBlur={e => { e.target.style.borderColor = '#2a4a3a' }}
                  />
                </div>

                <button
                  onClick={() => setCreatePhase('loading')}
                  style={{
                    width: '100%', fontFamily: "'Press Start 2P',monospace", fontSize: 11,
                    color: '#0a1a14', background: '#6effc4', border: 'none',
                    padding: '16px 20px', cursor: 'pointer', marginTop: 8,
                  }}
                >
                  ▶ 請求書を作成
                </button>
              </div>
            </div>
          )}

          {createPhase === 'loading' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: 40,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 320 }}>
                {createSteps.map((step, i) => (
                  <div key={i} style={{
                    fontFamily: "'DotGothic16',monospace", fontSize: 14,
                    color: i <= createStep ? '#6effc4' : '#2a4a3a',
                    transition: 'color 0.3s',
                  }}>
                    {i < createStep ? '✅' : i === createStep ? '⏳' : '⬜'} {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {createPhase === 'done' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', padding: 40,
            }}>
              <div style={{
                width: '100%', maxWidth: 520, background: '#0a1a14',
                border: '2px solid #6effc4', padding: 32,
                boxShadow: '0 0 40px rgba(110,255,196,0.2)',
              }}>
                <div style={{
                  fontFamily: "'Press Start 2P',monospace", fontSize: 12, color: '#6effc4',
                  textShadow: '0 0 12px #6effc4', marginBottom: 24, textAlign: 'center',
                }}>
                  ✅ 請求書を作成しました
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  <SummaryRow label="取引先" value={form.vendor || '未入力'} />
                  <SummaryRow label="金額" value={form.amount ? `¥${form.amount}` : '未入力'} />
                  <SummaryRow label="請求日" value={form.date || '未入力'} />
                  <SummaryRow label="工事名" value={form.constructionName || '未入力'} />
                </div>

                <div style={{
                  fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#6effc4',
                  textShadow: '0 0 8px rgba(110,255,196,0.5)', marginBottom: 8, textAlign: 'center',
                }}>
                  🎉 粗利マネージャーに反映されました！
                </div>
                <div style={{
                  fontFamily: "'DotGothic16',monospace", fontSize: 11, color: '#4a8a6a',
                  textAlign: 'center', marginBottom: 24,
                }}>
                  → <a
                    href="https://grosspro.vercel.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#6effc4', textDecoration: 'underline' }}
                  >grosspro.vercel.app</a> で確認できます
                </div>

                <button
                  onClick={() => {
                    setCreatePhase('form')
                    setForm({ vendor: '', amount: '', date: '', constructionName: '', constructionItems: '' })
                  }}
                  style={{
                    width: '100%', fontFamily: "'DotGothic16',monospace", fontSize: 12,
                    color: '#6effc4', background: 'transparent',
                    border: '1px solid #2a4a3a', padding: '12px 20px', cursor: 'pointer',
                  }}
                >
                  🔄 もう一度作成する
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FormField({ label, value, onChange, inputStyle }: {
  label: string; value: string; onChange: (v: string) => void; inputStyle: React.CSSProperties
}) {
  return (
    <div>
      <div style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#6effc4', marginBottom: 6, letterSpacing: 1 }}>
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = '#6effc4' }}
        onBlur={e => { e.target.style.borderColor = '#2a4a3a' }}
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DotGothic16',monospace", fontSize: 13 }}>
      <span style={{ color: '#4a8a6a' }}>{label}</span>
      <span style={{ color: '#d4edd8' }}>{value}</span>
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
