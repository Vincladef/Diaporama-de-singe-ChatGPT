import { useEffect, useState } from 'react'

const slides = [
  { id: '01', title: 'Ouverture', caption: 'Titre photographique', kind: 'cover' },
  { id: '02', title: 'Concept', caption: 'Apparitions au clic', kind: 'concept' },
  { id: '03', title: 'Conclusion', caption: 'Composition éditoriale', kind: 'editorial' },
] as const

function SlideContent({ kind, reveal }: { kind: string; reveal: number }) {
  if (kind === 'cover') return (
    <div className="slide-cover">
      <img className="cover-image" src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=85" alt="Paysage de montagnes au bord d'un lac" />
      <div className="cover-shade" />
      <div className="cover-content">
        <span className="cover-kicker">Une présentation qui respire</span>
        <h2>Les idées méritent<br /><em>une mise en scène.</em></h2>
        <p>Photographie, composition, rythme.</p>
      </div>
      <span className="cover-corner">DIAPORAMA DE SINGE / DÉMO</span>
    </div>
  )

  if (kind === 'concept') return (
    <div className="slide-concept">
      <span className="slide-eyebrow">EXEMPLE 02</span>
      <h2>Une idée.<br />Trois dimensions.</h2>
      <div className="concept-network">
        <div className="concept-center">L'idée</div>
        <div className={'concept-orbit orbit-one ' + (reveal > 0 ? 'visible' : '')}><span>Le sens</span></div>
        <div className={'concept-orbit orbit-two ' + (reveal > 1 ? 'visible' : '')}><span>La forme</span></div>
        <div className={'concept-orbit orbit-three ' + (reveal > 2 ? 'visible' : '')}><span>Le rythme</span></div>
      </div>
      <span className="concept-hint">{reveal < 3 ? 'Cliquer sur Suivant pour révéler les éléments' : 'Trois apparitions au clic'}</span>
    </div>
  )

  return (
    <div className="slide-editorial">
      <div className="editorial-left"><span className="slide-eyebrow">EXEMPLE 03</span><h2>Moins<br />de décor.<br /><i>Plus de sens.</i></h2></div>
      <div className="editorial-right"><div className="editorial-rule" /><p>Une présentation n'est pas un document découpé en rectangles. C'est une succession d'idées que l'on donne à voir.</p><span>DIAPORAMA DE SINGE</span></div>
    </div>
  )
}

type Status = 'checking' | 'connected' | 'error'

export default function App() {
  const [active, setActive] = useState(0)
  const [reveal, setReveal] = useState(0)
  const [status, setStatus] = useState<Status>('checking')
  const slide = slides[active]

  useEffect(() => {
    const controller = new AbortController()
    fetch('/.netlify/functions/health', { signal: controller.signal, cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error('API indisponible'); return response.json() })
      .then((data) => setStatus(data.database === 'connected' ? 'connected' : 'error'))
      .catch((error) => { if (error.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [])

  const choose = (index: number) => { setActive(index); setReveal(0) }
  const next = () => {
    if (slide.kind === 'concept' && reveal < 3) { setReveal((r) => r + 1); return }
    choose((active + 1) % slides.length)
  }
  const previous = () => choose((active - 1 + slides.length) % slides.length)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return
        event.preventDefault()
        next()
      }
      if (event.key === 'ArrowLeft') previous()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◆</span><div><strong>Diaporama<br />de singe</strong><small>ATELIER GRAPHIQUE</small></div></div>
        <div className="side-heading">ESPACE DE TRAVAIL</div>
        <div className="side-active"><span>▦</span> Présentation de démo</div>
        <div className="side-divider" />
        <div className="side-heading">DIAPOSITIVES</div>
        <div className="slide-list">
          {slides.map((item, index) => (
            <button key={item.id} type="button" onClick={() => choose(index)} className={'slide-entry ' + (active === index ? 'selected' : '')} aria-current={active === index ? 'true' : undefined}>
              <span className="slide-number">{item.id}</span>
              <span className="slide-entry-copy"><b>{item.title}</b><small>{item.caption}</small></span>
              <span className="slide-entry-arrow">↗</span>
            </button>
          ))}
        </div>
        <div className="side-bottom"><div className="small-symbol">◉</div><span>Version ChatGPT<br /><small>Version 0.1.0</small></span></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">Atelier <span>/</span> Présentation de démo</div>
          <span className="top-pill"><span className="pill-dot" />VERSION CHATGPT · HTML + CSS</span>
        </header>

        <section className="intro">
          <div><div className="micro-label">LE POINT DE DÉPART</div><h1>L'atelier est ouvert.</h1><p>Un premier canevas de présentations Web. Le moteur graphique et la connexion à la base constituent notre point de départ.</p></div>
          <div className="intro-index">001 <span>/</span> FONDATIONS</div>
        </section>

        <section className="editor">
          <div className="section-label"><span>APERÇU · 16:9</span><span>{slide.id} / 0{slides.length}</span></div>
          <div className="slide-stage"><SlideContent kind={slide.kind} reveal={reveal}/></div>
          <div className="editor-toolbar">
            <div><strong>{slide.title}</strong><span>{slide.caption}</span></div>
            <div className="nav-controls"><button onClick={previous} aria-label="Diapositive précédente">←</button><button onClick={next}>Suivant <span>→</span></button></div>
          </div>
        </section>

        <footer className="bottom-bar">
          <div className="status-item"><span className={'status-dot ' + status} /><span>{status === 'connected' ? 'Neon connecté' : status === 'checking' ? 'Vérification Neon…' : 'Connexion Neon à vérifier'}</span></div>
          <div className="bottom-meta">ChatGPT · React · Vite · Netlify · Neon</div>
        </footer>
      </main>
    </div>
  )
}
