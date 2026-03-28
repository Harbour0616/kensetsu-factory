import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

// ===== Machine Data =====
interface Machine {
  icon: string
  name: string
  active: boolean
  desc: string
  demo?: string
}

const machines: Record<string, Machine> = {
  A: { icon: '🧾', name: '請求書スキャナー', active: true, demo: '/demo/invoice',
       desc: '請求書PDFや画像をアップロードするだけで\n取引先・金額・日付を自動読み取り。\n現場でOCR精度を確認できるデモです。' },
  B: { icon: '📱', name: 'レシートスキャン', active: true,
       desc: '現場で撮ったレシート写真を送信するだけ。\n金額・店舗名・日付を即座に認識し\n工事番号に紐付けて自動仕分けします。' },
  C: { icon: '📊', name: '粗利マネージャー', active: true,
       desc: '工事ごとの売上・原価・粗利率をリアルタイム表示。\n危険な工事に自動アラートが飛び\n社長が即座に判断できる設計です。' },
  D: { icon: '🏦', name: '資金繰りナビ', active: false,
       desc: '来月・再来月の入出金を自動予測。\nヤバい月が一目でわかる\n建設業専用の資金繰り管理ツール。' },
  E: { icon: '📋', name: '工事台帳', active: false,
       desc: '現場ごとの原価・請求・入金をまとめて管理。\n建設業の複雑な台帳を\nシンプルに整理します。' },
  F: { icon: '👷', name: '労務費日報', active: false,
       desc: '職人の日報を集計して労務費を自動計算。\n現場別・職人別のコスト把握が\n簡単にできます。' },
  G: { icon: '💳', name: 'クレカ照合', active: false,
       desc: '法人カード明細とレシートを自動照合。\n二重計上・未照合の警告で\n経費管理を完璧に。' },
  H: { icon: '🏗️', name: '現場管理', active: false,
       desc: '現場ごとの進捗・原価・担当者を一元管理。\n建設会社の現場を\nまるごとデジタル化。' },
  I: { icon: '⚙️', name: '開発中...', active: false,
       desc: '次のアプリを鋭意開発中です。\nお楽しみに！' },
}

// ===== Bubble Data =====
const bubbleData: [number, number, string, string][] = [
  [3,  38, 'いらっしゃい！どのアプリを触る？', 'right'],
  [90, 15, '新機能、続々開発中だよ！', 'bottom'],
  [2,  62, '建設業の社長、お待ちしてました！', 'right'],
  [92, 58, 'マシンをクリックしてみて！', 'left'],
  [5,  20, 'こういうのでいいんだよ。', 'right'],
  [88, 78, '原価管理、任せてください！', 'left'],
  [4,  50, '請求書はもうAIに読ませよう', 'right'],
  [91, 35, '粗利が一目でわかる！', 'left'],
  [6,  75, '現場の経費、スマホで完結！', 'right'],
  [93, 68, '資金繰り、見える化します', 'left'],
]

// ===== Dino Config =====
const patrolRoute = [
  { x: 360, y: 400 },
  { x: 480, y: 455 },
  { x: 600, y: 500 },
  { x: 720, y: 455 },
  { x: 850, y: 405 },
  { x: 720, y: 455 },
  { x: 600, y: 500 },
  { x: 480, y: 455 },
]

const machineTargets: Record<string, { x: number; y: number }> = {
  A: { x: 560, y: 310 },
  B: { x: 670, y: 350 },
  C: { x: 615, y: 370 },
  D: { x: 780, y: 310 },
  E: { x: 725, y: 340 },
  F: { x: 450, y: 310 },
  G: { x: 560, y: 370 },
  H: { x: 505, y: 390 },
  I: { x: 670, y: 420 },
}

type DinoApi = { moveTo: (x: number, y: number, cb?: () => void) => void; moveClimbJumpNavigate: (navigateFn: () => void) => void }

export default function App() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const dinoApiRef = useRef<DinoApi | null>(null)
  const [modal, setModal] = useState<{ open: boolean; id: string }>({ open: false, id: '' })

  const currentMachine = modal.id ? machines[modal.id] : null

  // ===== Starfield =====
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let animId: number

    function init() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
      const stars = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height * 0.6,
        r: Math.random() < 0.3 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 1.2,
      }))
      function draw(t: number) {
        ctx.clearRect(0, 0, canvas!.width, canvas!.height)
        stars.forEach(s => {
          const a = 0.3 + 0.7 * Math.abs(Math.sin(s.phase + t * s.speed * 0.001))
          ctx.fillStyle = `rgba(160,255,200,${a})`
          ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.r, s.r)
        })
        animId = requestAnimationFrame(draw)
      }
      animId = requestAnimationFrame(draw)
    }

    init()
    window.addEventListener('resize', init)
    return () => {
      window.removeEventListener('resize', init)
      cancelAnimationFrame(animId)
    }
  }, [])

  // ===== Bubble System =====
  useEffect(() => {
    const sceneEl = sceneRef.current
    if (!sceneEl) return

    let queue = [...bubbleData].sort(() => Math.random() - 0.5)
    let idx = 0
    let intervalId: ReturnType<typeof setInterval> | null = null

    function showBubble() {
      if (idx >= queue.length) {
        queue = [...bubbleData].sort(() => Math.random() - 0.5)
        idx = 0
      }
      const [lp, tp, text] = queue[idx++]

      const el = document.createElement('div')
      el.className = 'bubble'
      el.style.left = lp + '%'
      el.style.top = tp + '%'

      const textSpan = document.createElement('span')
      const cursor = document.createElement('span')
      cursor.className = 'bubble-cursor'
      el.appendChild(textSpan)
      el.appendChild(cursor)
      sceneEl!.appendChild(el)

      let i = 0
      setTimeout(() => el.classList.add('visible'), 50)
      const timer = setInterval(() => {
        textSpan.textContent += text[i]
        i++
        if (i >= text.length) {
          clearInterval(timer)
          cursor.style.display = 'none'
          setTimeout(() => {
            el.classList.remove('visible')
            setTimeout(() => el.remove(), 500)
          }, 2500)
        }
      }, 70)
    }

    const startTimeout = setTimeout(() => {
      showBubble()
      intervalId = setInterval(showBubble, 2500)
    }, 1000)

    return () => {
      clearTimeout(startTimeout)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  // ===== Dino Walk Animation (rAF) =====
  useEffect(() => {
    const svg = document.getElementById('factory-svg') as SVGSVGElement | null
    if (!svg) return

    const state = {
      x: 360, y: 400,
      targetX: 360, targetY: 400,
      moving: false,
      speed: 2.5,
      frameCount: 0,
    }
    let routeIndex = 0
    let onArrival: (() => void) | null = null
    let patrolTimeout: ReturnType<typeof setTimeout> | null = null

    // Create SVG elements
    const dinoEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    dinoEl.setAttribute('font-size', '58')
    dinoEl.setAttribute('text-anchor', 'middle')
    dinoEl.style.filter = 'drop-shadow(0 0 6px #6effc4)'
    dinoEl.textContent = '🦖'
    svg.appendChild(dinoEl)

    const helmetEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    helmetEl.setAttribute('font-size', '32')
    helmetEl.setAttribute('text-anchor', 'middle')
    helmetEl.textContent = '⛑️'
    svg.appendChild(helmetEl)

    function setDinoPos(x: number, y: number, facingRight: boolean) {
      const bob = Math.sin(state.frameCount * 0.3) * (state.moving ? 2 : 0)
      dinoEl.setAttribute('x', String(x))
      dinoEl.setAttribute('y', String(y + bob))
      helmetEl.setAttribute('x', String(x + (facingRight ? 2 : -2)))
      helmetEl.setAttribute('y', String(y - 40 + bob))
      if (!facingRight) {
        dinoEl.setAttribute('transform', `translate(${x * 2}, 0) scale(-1, 1)`)
        helmetEl.setAttribute('transform', `translate(${x * 2}, 0) scale(-1, 1)`)
      } else {
        dinoEl.removeAttribute('transform')
        helmetEl.removeAttribute('transform')
      }
    }

    function moveTo(tx: number, ty: number, callback?: () => void) {
      if (patrolTimeout) { clearTimeout(patrolTimeout); patrolTimeout = null }
      state.targetX = tx
      state.targetY = ty
      state.moving = true
      onArrival = callback || null
    }

    function gameLoop() {
      state.frameCount++
      const dx = state.targetX - state.x
      const dy = state.targetY - state.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > state.speed) {
        state.x += (dx / dist) * state.speed
        state.y += (dy / dist) * state.speed
        setDinoPos(state.x, state.y, dx > 0)
      } else {
        state.x = state.targetX
        state.y = state.targetY
        if (state.moving) {
          state.moving = false
          if (onArrival) {
            const cb = onArrival
            onArrival = null
            cb()
          }
        }
        setDinoPos(state.x, state.y, true)
      }

      rafId = requestAnimationFrame(gameLoop)
    }

    function patrol() {
      if (state.moving) return
      routeIndex = (routeIndex + 1) % patrolRoute.length
      const next = patrolRoute[routeIndex]
      moveTo(next.x, next.y, () => {
        patrolTimeout = setTimeout(patrol, 800)
      })
    }

    // Expose moveTo and moveJumpNavigate to other handlers
    dinoApiRef.current = {
      moveTo(x: number, y: number, cb?: () => void) {
        moveTo(x, y, () => {
          cb?.()
          // Resume patrol after rush
          patrolTimeout = setTimeout(patrol, 1500)
        })
      },
      moveClimbJumpNavigate(navigateFn: () => void) {
        // Stop patrol, clear any pending arrival
        onArrival = null
        if (patrolTimeout) { clearTimeout(patrolTimeout); patrolTimeout = null }

        // Step1: ブロック手前まで歩く
        moveTo(600, 290, () => {
          // Step2: ブロックをよじ登る
          let climbFrame = 0
          const climbTotal = 40
          const startY = state.y
          const targetClimbY = 200

          function climbAnim() {
            climbFrame++
            const progress = climbFrame / climbTotal
            const eased = progress * progress
            const currentY = startY + (targetClimbY - startY) * eased

            state.x = 600
            state.y = currentY
            dinoEl.setAttribute('x', '600')
            dinoEl.setAttribute('y', String(currentY))
            helmetEl.setAttribute('x', '602')
            helmetEl.setAttribute('y', String(currentY - 40))

            if (climbFrame < climbTotal) {
              requestAnimationFrame(climbAnim)
            } else {
              // Step3: 上に着いたら0.5秒待ってジャンプ
              setTimeout(() => {
                let jumpFrame = 0
                const jumpTotal = 30
                const jumpHeight = 40
                const baseY = state.y

                function jumpAnim() {
                  jumpFrame++
                  const progress = jumpFrame / jumpTotal
                  const offsetY = -Math.sin(Math.PI * progress) * jumpHeight
                  dinoEl.setAttribute('y', String(baseY + offsetY))
                  helmetEl.setAttribute('y', String(baseY - 40 + offsetY))
                  if (jumpFrame < jumpTotal) {
                    requestAnimationFrame(jumpAnim)
                  } else {
                    // Step4: ジャンプ完了→0.3秒後に遷移
                    setTimeout(() => navigateFn(), 300)
                  }
                }
                requestAnimationFrame(jumpAnim)
              }, 500)
            }
          }
          requestAnimationFrame(climbAnim)
        })
      },
    }

    setDinoPos(state.x, state.y, true)
    let rafId = requestAnimationFrame(gameLoop)
    patrolTimeout = setTimeout(patrol, 1000)

    return () => {
      cancelAnimationFrame(rafId)
      if (patrolTimeout) clearTimeout(patrolTimeout)
      dinoEl.remove()
      helmetEl.remove()
    }
  }, [])

  // ===== Modal Handlers =====
  const openModal = useCallback((id: string) => {
    const target = machineTargets[id]
    if (target) dinoApiRef.current?.moveTo(target.x, target.y)
    setModal({ open: true, id })
  }, [])

  const handleDemo = useCallback(() => {
    if (currentMachine?.active && currentMachine.demo) {
      setModal({ open: false, id: '' })
      navigate(currentMachine.demo)
    } else {
      alert('デモ準備中！もうしばらくお待ちください。')
    }
  }, [currentMachine, navigate])

  return (
    <>
      <div id="app" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div className="header-logo">建設アプリ<br />ファクトリー</div>
            <div className="header-badge">▶ MEMBERS ONLY ◀</div>
          </div>
          <div className="header-right">
            <div className="header-sub">こういうのでいいんだよ。</div>
            <div className="status-pill"><span className="live-dot" />稼働中 3台 ／ 開発待ち 6台</div>
          </div>
        </div>

        {/* Ticker */}
        <div className="ticker-wrap">
          <span className="ticker">
            ▶ 建設業向け管理会計ツール専門　▶ 伊藤謙佑のアプリ工場　▶ 新機能続々開発中　▶ マシンをクリックしてデモを体験　▶ KENJIRO'S APP FACTORY　▶ こういうのでいいんだよ。　▶ 建設会社の社長が「お金で悩まない」会社をつくる
          </span>
        </div>

        {/* Scene */}
        <div className="scene" ref={sceneRef}>
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
          />
          <svg id="factory-svg" viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: 'pixelated' }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-sm">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <pattern id="grass-grid" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill="#4ade80" />
                <rect x="0" y="0" width="4" height="4" fill="#3ecf70" opacity="0.5" />
                <rect x="4" y="4" width="4" height="4" fill="#3ecf70" opacity="0.5" />
              </pattern>
            </defs>

            {/* Floor Tiles */}
            <g id="floor">
              <polygon points="600,180 655,207 600,234 545,207" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="655,207 710,234 655,261 600,234" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="710,234 765,261 710,288 655,261" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="765,261 820,288 765,315 710,288" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="820,288 875,315 820,342 765,315" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="875,315 930,342 875,369 820,342" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="545,207 600,234 545,261 490,234" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="600,234 655,261 600,288 545,261" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="655,261 710,288 655,315 600,288" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="710,288 765,315 710,342 655,315" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="765,315 820,342 765,369 710,342" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="820,342 875,369 820,396 765,369" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="490,234 545,261 490,288 435,261" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="545,261 600,288 545,315 490,288" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="600,288 655,315 600,342 545,315" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="655,315 710,342 655,369 600,342" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="710,342 765,369 710,396 655,369" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="765,369 820,396 765,423 710,396" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="435,261 490,288 435,315 380,288" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="490,288 545,315 490,342 435,315" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="545,315 600,342 545,369 490,342" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="600,342 655,369 600,396 545,369" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="655,369 710,396 655,423 600,396" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="710,396 765,423 710,450 655,423" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="380,288 435,315 380,342 325,315" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="435,315 490,342 435,369 380,342" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="490,342 545,369 490,396 435,369" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="545,369 600,396 545,423 490,396" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="600,396 655,423 600,450 545,423" fill="#5a8a3a" stroke="#3a6a2a" strokeWidth="1" />
              <polygon points="655,423 710,450 655,477 600,450" fill="#4a7a2a" stroke="#3a6a2a" strokeWidth="1" />
            </g>

            {/* Walls */}
            <polygon points="325,315 380,288 380,480 325,507" fill="#6b4423" stroke="#3a1e0e" strokeWidth="1" />
            <polygon points="930,342 930,507 875,534 875,369" fill="#4a2e15" stroke="#3a1e0e" strokeWidth="1" />
            <polygon points="325,507 380,480 545,561 490,588" fill="#6b4423" stroke="#3a1e0e" strokeWidth="1" />
            <polygon points="490,588 545,561 710,642 655,669" fill="#4a2e15" stroke="#3a1e0e" strokeWidth="1" />
            <polygon points="655,669 710,642 875,534 930,507" fill="#6b4423" stroke="#3a1e0e" strokeWidth="1" />

            {/* Chimney */}
            <rect x="895" y="120" width="22" height="90" fill="#1a2e1e" stroke="#2a4a2e" strokeWidth="1.5" />
            <ellipse cx="906" cy="118" rx="13" ry="6" fill="#243826" stroke="#3a5a3a" strokeWidth="1" />
            <circle cx="906" cy="100" r="8" fill="#2a4a3a" opacity="0.5">
              <animate attributeName="cy" values="100;80;60" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0.3;0" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="r" values="8;12;16" dur="2.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="910" cy="88" r="6" fill="#2a4a3a" opacity="0.4">
              <animate attributeName="cy" values="88;68;48" dur="3s" begin="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0.2;0" dur="3s" begin="0.8s" repeatCount="indefinite" />
              <animate attributeName="r" values="6;10;14" dur="3s" begin="0.8s" repeatCount="indefinite" />
            </circle>

            {/* ACTIVE A: 請求書スキャナー */}
            <g className="m-group" onClick={() => {
              dinoApiRef.current?.moveClimbJumpNavigate(() => navigate('/demo/invoice'))
            }}>
              <polygon points="655,127 655,207 600,234 600,154" fill="#5c3d1e" />
              <polygon points="545,127 600,154 600,234 545,207" fill="#3d2a0f" />
              <polygon className="m-top" points="600,100 655,127 600,154 545,127" fill="url(#grass-grid)" filter="url(#glow)" />
              <text x="600" y="128" textAnchor="middle" fontSize="28" filter="url(#glow)">🧾</text>
              <text x="600" y="112" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="11" fill="#9effd8">請求書スキャナー</text>
              <rect x="644" y="102" width="9" height="9" fill="#6effc4" filter="url(#glow)">
                <animate attributeName="opacity" values="1;0;1" dur="1s" calcMode="discrete" repeatCount="indefinite" />
              </rect>
            </g>

            {/* ACTIVE B: レシートスキャン */}
            <g className="m-group" onClick={() => openModal('B')}>
              <polygon points="765,181 765,261 710,288 710,208" fill="#5c3d1e" />
              <polygon points="655,181 710,208 710,288 655,261" fill="#3d2a0f" />
              <polygon className="m-top" points="710,154 765,181 710,208 655,181" fill="url(#grass-grid)" filter="url(#glow)" />
              <text x="710" y="182" textAnchor="middle" fontSize="28" filter="url(#glow)">📱</text>
              <text x="710" y="166" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="11" fill="#9effd8">レシートスキャン</text>
              <rect x="754" y="156" width="9" height="9" fill="#6effc4" filter="url(#glow)">
                <animate attributeName="opacity" values="1;0;1" dur="0.8s" calcMode="discrete" begin="0.3s" repeatCount="indefinite" />
              </rect>
            </g>

            {/* ACTIVE C: 粗利マネージャー */}
            <g className="m-group" onClick={() => openModal('C')}>
              <polygon points="710,208 710,288 655,315 655,235" fill="#5c3d1e" />
              <polygon points="600,208 655,235 655,315 600,288" fill="#3d2a0f" />
              <polygon className="m-top" points="655,181 710,208 655,235 600,208" fill="url(#grass-grid)" filter="url(#glow)" />
              <text x="655" y="209" textAnchor="middle" fontSize="28" filter="url(#glow)">📊</text>
              <text x="655" y="193" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="11" fill="#9effd8">粗利マネージャー</text>
              <rect x="699" y="183" width="9" height="9" fill="#6effc4" filter="url(#glow)">
                <animate attributeName="opacity" values="1;0;1" dur="1.2s" calcMode="discrete" begin="0.6s" repeatCount="indefinite" />
              </rect>
            </g>

            {/* LOCKED D: 資金繰りナビ */}
            <g className="m-group locked" onClick={() => openModal('D')} style={{ opacity: 0.5 }}>
              <polygon points="875,255 875,315 820,342 820,282" fill="#4a4a4a" />
              <polygon points="765,255 820,282 820,342 765,315" fill="#333333" />
              <polygon className="m-top" points="820,228 875,255 820,282 765,255" fill="#666666" />
              <text x="820" y="256" textAnchor="middle" fontSize="26">🏦</text>
              <text x="820" y="240" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="10" fill="#999999">資金繰りナビ</text>
              <text x="852" y="235" fontSize="14">🔒</text>
            </g>

            {/* LOCKED E: 工事台帳 */}
            <g className="m-group locked" onClick={() => openModal('E')} style={{ opacity: 0.5 }}>
              <polygon points="820,282 820,342 765,369 765,309" fill="#4a4a4a" />
              <polygon points="710,282 765,309 765,369 710,342" fill="#333333" />
              <polygon className="m-top" points="765,255 820,282 765,309 710,282" fill="#666666" />
              <text x="765" y="283" textAnchor="middle" fontSize="26">📋</text>
              <text x="765" y="267" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="10" fill="#999999">工事台帳</text>
              <text x="797" y="262" fontSize="14">🔒</text>
            </g>

            {/* LOCKED F: 労務費日報 */}
            <g className="m-group locked" onClick={() => openModal('F')} style={{ opacity: 0.5 }}>
              <polygon points="545,255 545,315 490,342 490,282" fill="#4a4a4a" />
              <polygon points="435,255 490,282 490,342 435,315" fill="#333333" />
              <polygon className="m-top" points="490,228 545,255 490,282 435,255" fill="#666666" />
              <text x="490" y="256" textAnchor="middle" fontSize="26">👷</text>
              <text x="490" y="240" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="10" fill="#999999">労務費日報</text>
              <text x="522" y="235" fontSize="14">🔒</text>
            </g>

            {/* LOCKED G: クレカ照合 */}
            <g className="m-group locked" onClick={() => openModal('G')} style={{ opacity: 0.5 }}>
              <polygon points="655,309 655,369 600,396 600,336" fill="#4a4a4a" />
              <polygon points="545,309 600,336 600,396 545,369" fill="#333333" />
              <polygon className="m-top" points="600,282 655,309 600,336 545,309" fill="#666666" />
              <text x="600" y="310" textAnchor="middle" fontSize="26">💳</text>
              <text x="600" y="294" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="10" fill="#999999">クレカ照合</text>
              <text x="632" y="289" fontSize="14">🔒</text>
            </g>

            {/* LOCKED H: 現場管理 */}
            <g className="m-group locked" onClick={() => openModal('H')} style={{ opacity: 0.5 }}>
              <polygon points="600,336 600,396 545,423 545,363" fill="#4a4a4a" />
              <polygon points="490,336 545,363 545,423 490,396" fill="#333333" />
              <polygon className="m-top" points="545,309 600,336 545,363 490,336" fill="#666666" />
              <text x="545" y="337" textAnchor="middle" fontSize="26">🏗️</text>
              <text x="545" y="321" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="10" fill="#999999">現場管理</text>
              <text x="577" y="316" fontSize="14">🔒</text>
            </g>

            {/* LOCKED I: 開発中 */}
            <g className="m-group locked" onClick={() => openModal('I')} style={{ opacity: 0.35 }}>
              <polygon points="765,363 765,423 710,450 710,390" fill="#4a4a4a" />
              <polygon points="655,363 710,390 710,450 655,423" fill="#333333" />
              <polygon className="m-top" points="710,336 765,363 710,390 655,363" fill="#666666" />
              <text x="710" y="364" textAnchor="middle" fontSize="26">⚙️</text>
              <text x="710" y="348" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="10" fill="#888888">開発中...</text>
            </g>

            {/* Mascots (🦖 is animated via JS, 🦕 stays static) */}
            <text x="960" y="460" fontSize="38" opacity="0.55">🦕</text>

            {/* Factory Name Plate */}
            <rect x="460" y="510" width="280" height="32" fill="#0a1a12" stroke="#6effc4" strokeWidth="2" />
            <text x="600" y="531" textAnchor="middle" fontFamily="'DotGothic16',monospace" fontSize="12" fill="#6effc4" letterSpacing="2">建設アプリファクトリー</text>

            {/* Entrance */}
            <text x="600" y="575" textAnchor="middle" fontFamily="'Press Start 2P',monospace" fontSize="10" fill="#f9c74f">▼  DEMO  ENTRANCE  ▼</text>
          </svg>
        </div>

        {/* Status Bar */}
        <div className="status-bar">
          <span><span className="live-dot" />稼働中 3台</span>
          <span style={{ color: '#445544' }}>🔒 開発待ち 6台</span>
          <span style={{ color: '#f9c74f' }}>KENJIRO'S APP FACTORY　VER 0.2</span>
        </div>
      </div>

      {/* Modal */}
      {currentMachine && (
        <div
          className={`modal-overlay${modal.open ? ' active' : ''}`}
          onClick={(e) => { if (e.target === e.currentTarget) setModal({ open: false, id: '' }) }}
        >
          <div className="modal">
            <span className="modal-icon">{currentMachine.icon}</span>
            <div className="modal-title">{currentMachine.name}</div>
            <div className="modal-desc">{currentMachine.desc}</div>
            {currentMachine.active && currentMachine.demo ? (
              <button className="modal-btn" onClick={handleDemo}>▶ デモを体験する</button>
            ) : currentMachine.active ? (
              <button className="modal-btn" style={{ background: '#1a3a2a', color: '#4a9e7a', cursor: 'default' }}>🔧 近日公開 - お楽しみに！</button>
            ) : (
              <button className="modal-btn locked-btn">🔒 開発中 - お楽しみに</button>
            )}
            <button className="modal-close" onClick={() => setModal({ open: false, id: '' })}>× 閉じる</button>
          </div>
        </div>
      )}
    </>
  )
}
