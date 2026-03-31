import { useState, useCallback, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { scanInvoice, type OcrResult } from '../lib/ocr'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

const createSteps = [
  '📋 データを検証中...',
  '🔢 金額を計算中...',
  '📄 請求書を生成中...',
  '✅ 粗利マネージャーに反映中...',
]

type Phase = 'top' | 'scan' | 'scan-loading' | 'scan-result' | 'create' | 'create-loading' | 'done'

export default function InvoiceDemo() {
  const fileRef = useRef<HTMLInputElement>(null)
  const pteranoRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('top')
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    vendor: '',
    amount: '',
    date: '',
    constructionName: '',
    constructionItems: '',
  })
  const [createStep, setCreateStep] = useState(0)

  // Pteranodon canvas animation
  useEffect(() => {
    if (phase !== 'top') return
    const canvas = pteranoRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const pteros = [
      { x: window.innerWidth + 100, y: 80,  speed: 1.2, size: 36, flap: 0 },
      { x: window.innerWidth + 400, y: 140, speed: 0.9, size: 24, flap: 1 },
      { x: window.innerWidth + 700, y: 60,  speed: 1.5, size: 20, flap: 2 },
    ]

    let animId: number
    let frame = 0

    const drawPtero = (p: typeof pteros[0]) => {
      const flapY = Math.sin(frame * 0.12 + p.flap) * p.size * 0.6
      ctx.fillStyle = 'rgba(110, 255, 196, 0.7)'

      // 胴体
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.size * 0.8, p.size * 0.25, 0, 0, Math.PI * 2)
      ctx.fill()

      // 左翼（進行方向と逆）
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.quadraticCurveTo(p.x + p.size * 1.4, p.y - flapY - p.size * 0.3, p.x + p.size * 2.4, p.y - flapY)
      ctx.quadraticCurveTo(p.x + p.size * 1.4, p.y + p.size * 0.2, p.x, p.y)
      ctx.fill()

      // 右翼
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.quadraticCurveTo(p.x - p.size * 1.4, p.y - flapY - p.size * 0.3, p.x - p.size * 2.4, p.y - flapY)
      ctx.quadraticCurveTo(p.x - p.size * 1.4, p.y + p.size * 0.2, p.x, p.y)
      ctx.fill()

      // くちばし（左向き）
      ctx.beginPath()
      ctx.moveTo(p.x - p.size * 0.75, p.y - p.size * 0.08)
      ctx.lineTo(p.x - p.size * 1.5, p.y)
      ctx.lineTo(p.x - p.size * 0.75, p.y + p.size * 0.08)
      ctx.closePath()
      ctx.fill()

      // 頭のトサカ
      ctx.beginPath()
      ctx.moveTo(p.x - p.size * 0.5, p.y - p.size * 0.2)
      ctx.lineTo(p.x + p.size * 0.3, p.y - p.size * 0.6)
      ctx.lineTo(p.x + p.size * 0.1, p.y - p.size * 0.2)
      ctx.closePath()
      ctx.fill()
    }

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++

      pteros.forEach(p => {
        p.x -= p.speed
        if (p.x < -p.size * 3) {
          p.x = window.innerWidth + 200 + Math.random() * 400
          p.y = 50 + Math.random() * 180
        }
        drawPtero(p)
      })

      animId = requestAnimationFrame(loop)
    }

    loop()

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [phase])

  // Create loading animation
  useEffect(() => {
    if (phase !== 'create-loading') return
    setCreateStep(0)
    const timer = setInterval(() => {
      setCreateStep(prev => {
        if (prev >= createSteps.length - 1) {
          clearInterval(timer)
          setTimeout(() => setPhase('done'), 800)
          return prev
        }
        return prev + 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [phase])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setResult(null)
    setPhase('scan-loading')

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      setError('対応形式: PNG, JPEG, GIF, WebP, PDF')
      setPhase('scan')
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
      setPhase('scan-result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
      setPhase('scan')
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

  const formatAmount = (v: string) => {
    const n = Number(v.replace(/,/g, ''))
    return isNaN(n) || !v ? '' : n.toLocaleString()
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

      {/* ===== TOP: 選択画面 ===== */}
      {phase === 'top' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40,
          position: 'relative',
        }}>
          <canvas
            ref={pteranoRef}
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
          <p style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 16, color: '#6effc4',
            textShadow: '0 0 20px #6effc4', marginBottom: 48, letterSpacing: 2, zIndex: 1, position: 'relative' }}>
            請求書をどうしますか？
          </p>
          <div style={{ display: 'flex', gap: 40, zIndex: 1, position: 'relative' }}>
            <div
              onClick={() => setPhase('scan')}
              style={{
                width: 340, padding: '48px 36px', border: '2px solid #2a4a3a', background: '#0a1a14',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#6effc4'
                e.currentTarget.style.background = '#0d2a1e'
                e.currentTarget.style.boxShadow = '0 0 32px rgba(110,255,196,0.15)'
                e.currentTarget.style.transform = 'translateY(-4px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#2a4a3a'
                e.currentTarget.style.background = '#0a1a14'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ fontSize: 72, marginBottom: 8 }}>📥</div>
              <p style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: '#6effc4', textAlign: 'center', lineHeight: 2.2 }}>
                既存の請求書を<br />読み込む
              </p>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#4a8a6a', textAlign: 'center', lineHeight: 2 }}>
                エクセル・手書き・既存フォーマット<br />
                アップロードするだけで<br />
                自動でデータ化されます
              </p>
            </div>

            <div
              onClick={() => setPhase('create')}
              style={{
                width: 340, padding: '48px 36px', border: '2px solid #2a4a3a', background: '#0a1a14',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#6effc4'
                e.currentTarget.style.background = '#0d2a1e'
                e.currentTarget.style.boxShadow = '0 0 32px rgba(110,255,196,0.15)'
                e.currentTarget.style.transform = 'translateY(-4px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#2a4a3a'
                e.currentTarget.style.background = '#0a1a14'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ fontSize: 72, marginBottom: 8 }}>📝</div>
              <p style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: '#6effc4', textAlign: 'center', lineHeight: 2.2 }}>
                請求書を作成して<br />粗利に反映
              </p>
              <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#4a8a6a', textAlign: 'center', lineHeight: 2 }}>
                ここで作った請求書が<br />
                そのまま粗利マネージャーに<br />
                自動で連携されます
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== SCAN: ドロップゾーン ===== */}
      {phase === 'scan' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 40,
        }}>
          <button
            onClick={() => setPhase('top')}
            style={{
              position: 'absolute', top: 80, left: 32,
              fontFamily: "'DotGothic16',monospace", fontSize: 11, color: '#4a8a6a',
              background: 'transparent', border: '1px solid #1a3a2a', padding: '8px 16px', cursor: 'pointer',
            }}
          >
            ← 戻る
          </button>

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

      {/* ===== SCAN-LOADING ===== */}
      {phase === 'scan-loading' && (
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

      {/* ===== SCAN-RESULT ===== */}
      {phase === 'scan-result' && (
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
              onClick={() => { setPhase('top'); setPreview(null); setResult(null) }}
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

      {/* ===== CREATE: 左プレビュー + 右フォーム ===== */}
      {phase === 'create' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左：請求書プレビュー */}
          <div style={{
            flex: '0 0 50%', background: '#fff', color: '#111', padding: '32px 28px',
            fontFamily: 'sans-serif', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8,
            overflow: 'auto',
          }}>
            <h2 style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, marginBottom: 16, color: '#111' }}>請　求　書</h2>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 'bold', color: '#111' }}>{form.vendor || '取引先名'} 御中</p>
                <p style={{ fontSize: 11, color: '#666', marginTop: 4 }}>工事名：{form.constructionName || '　'}</p>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: '#444' }}>
                <p>請求日：{form.date || '　'}</p>
                <p style={{ marginTop: 4 }}>ジュラ建設株式会社</p>
              </div>
            </div>

            <div style={{ background: '#f5f5f5', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#333' }}>今回ご請求金額（税込）</span>
              <span style={{ fontSize: 20, fontWeight: 'bold', color: '#0a6644' }}>
                ¥ {formatAmount(form.amount) || '　'}
              </span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#1a4a2e', color: '#fff' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>品目・工事内容</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {form.constructionItems && form.constructionItems.split('\n').filter(Boolean).length > 0
                  ? form.constructionItems.split('\n').filter(Boolean).map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                      <td style={{ padding: '6px 8px', color: '#111' }}>{item}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#111' }}>　</td>
                    </tr>
                  ))
                  : (
                    <tr><td colSpan={2} style={{ padding: '12px 8px', color: '#aaa', textAlign: 'center' }}>明細を入力してください</td></tr>
                  )
                }
              </tbody>
            </table>
          </div>

          {/* 右：フォーム */}
          <div style={{
            flex: '0 0 50%', display: 'flex', flexDirection: 'column',
            padding: 24, borderLeft: '1px solid #1a3a2a', overflow: 'auto', gap: 16,
          }}>
            <p style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 9, color: '#6effc4', marginBottom: 8 }}>
              請求書を入力
            </p>

            {([
              { key: 'vendor', label: '🏢 取引先名', placeholder: '株式会社〇〇' },
              { key: 'amount', label: '💰 請求金額（税込）', placeholder: '1,650,000' },
              { key: 'date', label: '📅 請求日', placeholder: '2026/04/01' },
              { key: 'constructionName', label: '🏗️ 工事名', placeholder: '〇〇新築工事' },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#6effc4', display: 'block', marginBottom: 6 }}>
                  {label}
                </label>
                <input
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{
                    width: '100%', background: '#0a1a14', border: '1px solid #2a4a3a',
                    color: '#d4edd8', fontFamily: "'DotGothic16',monospace", fontSize: 13,
                    padding: '10px 12px', outline: 'none', boxSizing: 'border-box' as const,
                  }}
                  onFocus={e => { e.target.style.borderColor = '#6effc4' }}
                  onBlur={e => { e.target.style.borderColor = '#2a4a3a' }}
                />
              </div>
            ))}

            <div>
              <label style={{ fontFamily: "'DotGothic16',monospace", fontSize: 10, color: '#6effc4', display: 'block', marginBottom: 6 }}>
                📋 工事内容（1行1項目）
              </label>
              <textarea
                value={form.constructionItems}
                onChange={e => setForm(f => ({ ...f, constructionItems: e.target.value }))}
                placeholder={'外壁塗装工事\n防水シート施工\n足場設置・解体'}
                rows={5}
                style={{
                  width: '100%', background: '#0a1a14', border: '1px solid #2a4a3a',
                  color: '#d4edd8', fontFamily: "'DotGothic16',monospace", fontSize: 12,
                  padding: '10px 12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const,
                }}
                onFocus={e => { e.target.style.borderColor = '#6effc4' }}
                onBlur={e => { e.target.style.borderColor = '#2a4a3a' }}
              />
            </div>

            <button
              onClick={() => setPhase('create-loading')}
              disabled={!form.vendor || !form.amount}
              style={{
                fontFamily: "'Press Start 2P',monospace", fontSize: 10,
                color: '#0a1a14', background: (!form.vendor || !form.amount) ? '#2a4a3a' : '#6effc4',
                border: 'none', padding: '14px', cursor: (!form.vendor || !form.amount) ? 'default' : 'pointer',
                marginTop: 8,
              }}
            >
              ▶ 請求書を作成
            </button>

            <button
              onClick={() => setPhase('top')}
              style={{
                fontFamily: "'DotGothic16',monospace", fontSize: 11, color: '#4a8a6a',
                background: 'transparent', border: '1px solid #1a3a2a', padding: '10px', cursor: 'pointer',
              }}
            >
              ← 戻る
            </button>
          </div>
        </div>
      )}

      {/* ===== CREATE-LOADING ===== */}
      {phase === 'create-loading' && (
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

      {/* ===== DONE ===== */}
      {phase === 'done' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <p style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 14, color: '#6effc4', textShadow: '0 0 20px #6effc4' }}>
            ✅ 請求書を作成しました
          </p>

          <div style={{ border: '1px solid #2a4a3a', background: '#0a1a14', padding: '20px 28px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#d4edd8' }}>取引先：{form.vendor}</p>
            <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#d4edd8' }}>金額：¥{formatAmount(form.amount)}</p>
            <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 13, color: '#d4edd8' }}>工事名：{form.constructionName}</p>
          </div>

          <p style={{ fontFamily: "'DotGothic16',monospace", fontSize: 14, color: '#f9c74f', textShadow: '0 0 12px #f9c74f' }}>
            🎉 粗利マネージャーに反映されました！
          </p>

          <a
            href="https://grosspro.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "'DotGothic16',monospace", fontSize: 12, color: '#6effc4', textDecoration: 'underline' }}
          >
            → grosspro.vercel.app で確認する
          </a>

          <button
            onClick={() => { setPhase('top'); setForm({ vendor: '', amount: '', date: '', constructionName: '', constructionItems: '' }) }}
            style={{
              fontFamily: "'DotGothic16',monospace", fontSize: 12, color: '#6effc4',
              background: 'transparent', border: '1px solid #2a4a3a', padding: '12px 24px', cursor: 'pointer', marginTop: 8,
            }}
          >
            🔄 もう一度試す
          </button>
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
