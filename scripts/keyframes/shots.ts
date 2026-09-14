import { readFileSync } from 'node:fs'

const PAPER = '#f7f6f3'
const WHITE = '#ffffff'
const INK = '#37352f'
const MUTED = 'rgba(55,53,47,0.86)'
const BLUE = '#1766ad'
const CORAL = '#F76B58'
const HAIRLINE = 'rgba(55,53,47,0.12)'
const TERMINAL = '#1b1a17'
const BLUE_HIGHLIGHT = '#cfe3f7'

const geistDataUri = (path: string) => `data:font/ttf;base64,${readFileSync(path).toString('base64')}`
const imageDataUri = (path: string, mime: string) => `data:${mime};base64,${readFileSync(path).toString('base64')}`

const font400 = geistDataUri('/Users/coji/progs/artifactshare/worktrees/standalone/autonomous-ads-lab/data/footage/loop-2026-09-14/Geist-400.ttf')
const font500 = geistDataUri('/Users/coji/progs/artifactshare/worktrees/standalone/autonomous-ads-lab/data/footage/loop-2026-09-14/Geist-500.ttf')
const font600 = geistDataUri('/Users/coji/progs/artifactshare/worktrees/standalone/autonomous-ads-lab/data/footage/loop-2026-09-14/Geist-600.ttf')
const logoDataUri = imageDataUri('/Users/coji/progs/artifactshare/public/docs/brand/png/icon-512.png', 'image/png')

const sharedCss = `
  @font-face {
    font-family: "Geist";
    src: url("${font400}") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "Geist";
    src: url("${font500}") format("truetype");
    font-weight: 500;
    font-style: normal;
    font-display: block;
  }
  @font-face {
    font-family: "Geist";
    src: url("${font600}") format("truetype");
    font-weight: 600;
    font-style: normal;
    font-display: block;
  }
  :root {
    --paper: ${PAPER};
    --white: ${WHITE};
    --ink: ${INK};
    --muted: ${MUTED};
    --blue: ${BLUE};
    --coral: ${CORAL};
    --hairline: ${HAIRLINE};
    --terminal: ${TERMINAL};
    --blue-highlight: ${BLUE_HIGHLIGHT};
  }
  * { box-sizing: border-box; }
  html, body {
    width: 1080px;
    height: 1440px;
    margin: 0;
    overflow: hidden;
    background: var(--paper);
  }
  body {
    color: var(--ink);
    font-family: "Geist", sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .page {
    position: relative;
    width: 1080px;
    height: 1440px;
    overflow: hidden;
    background: var(--paper);
  }
  .wordmark-pill {
    position: absolute;
    z-index: 10;
    top: 56px;
    left: 56px;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 50px;
    padding: 8px 15px 8px 8px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.74);
    box-shadow: 0 8px 20px rgba(55, 53, 47, 0.05);
  }
  .wordmark-pill img {
    display: block;
    width: 28px;
    height: 28px;
    border-radius: 6px;
  }
  .wordmark-copy {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    white-space: nowrap;
  }
  .wordmark-name {
    color: var(--ink);
    font-size: 16px;
    font-weight: 600;
    line-height: 18px;
    letter-spacing: -0.025em;
  }
  .wordmark-domain {
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
    line-height: 13px;
    letter-spacing: 0.01em;
  }
  .hero-line,
  .stack-line,
  .flip-line {
    position: absolute;
    left: 72px;
    z-index: 2;
    color: var(--ink);
    font-weight: 600;
    line-height: 0.88;
    letter-spacing: -0.075em;
    white-space: nowrap;
    transform-origin: left top;
  }
  .hero-line { font-size: 156px; transform: scaleX(0.77); }
  .hero-one { top: 354px; }
  .hero-two { top: 505px; transform: scaleX(0.70); }
  .hero-three {
    top: 664px;
    color: var(--coral);
    font-size: 172px;
    transform: scaleX(0.57);
  }
  .stack-line { font-size: 148px; transform: scaleX(0.73); }
  .stack-one { top: 330px; }
  .stack-two { top: 503px; transform: scaleX(0.60); }
  .stack-three {
    top: 676px;
    color: var(--coral);
  }
  .document-wrap {
    position: absolute;
    top: 294px;
    left: 110px;
    z-index: 2;
    width: 860px;
    height: 710px;
    transform-origin: center center;
  }
  .document-wrap.tilted {
    transform: perspective(1500px) rotateY(-8deg) rotateX(5deg) scale(0.85);
  }
  .document-wrap.flat { transform: none; }
  .document-card {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 50px;
    border: 1px solid var(--hairline);
    border-radius: 6px;
    background: var(--white);
    box-shadow: 0 30px 70px rgba(55, 53, 47, 0.12), 0 6px 16px rgba(55, 53, 47, 0.06);
  }
  .document-kicker {
    margin-bottom: 21px;
    color: var(--blue);
    font-family: Menlo, monospace;
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0.09em;
    line-height: 20px;
  }
  .document-title {
    max-width: 730px;
    margin: 0;
    color: var(--ink);
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.055em;
    line-height: 1.04;
  }
  .decision-box {
    margin-top: 38px;
    padding: 25px 28px 27px;
    border: 1px solid var(--hairline);
    border-radius: 6px;
  }
  .decision-label {
    margin-bottom: 15px;
    color: var(--blue);
    font-family: Menlo, monospace;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.08em;
    line-height: 18px;
  }
  .decision-sentence {
    max-width: 700px;
    margin: 0;
    color: var(--muted);
    font-size: 25px;
    font-weight: 400;
    letter-spacing: -0.025em;
    line-height: 1.3;
  }
  .sentence-text.highlighted {
    padding: 2px 6px 3px;
    border-radius: 3px;
    background: var(--blue-highlight);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .stat-row {
    display: grid;
    gap: 14px;
    margin-top: 36px;
  }
  .stat-row.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .stat-row.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat-tile {
    min-height: 97px;
    padding: 23px 20px;
    border: 1px solid var(--hairline);
    border-radius: 6px;
    background: rgba(247, 246, 243, 0.56);
  }
  .stat-value {
    color: var(--ink);
    font-size: 27px;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1.08;
    white-space: nowrap;
  }
  .comment-bubble {
    position: absolute;
    top: 389px;
    right: 37px;
    z-index: 4;
    padding: 17px 21px 18px;
    border-radius: 6px;
    background: var(--terminal);
    box-shadow: 0 16px 30px rgba(55, 53, 47, 0.18);
    color: var(--white);
    font-size: 21px;
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.15;
    white-space: nowrap;
  }
  .comment-bubble::after {
    position: absolute;
    right: 62px;
    bottom: -11px;
    width: 0;
    height: 0;
    border-top: 12px solid var(--terminal);
    border-right: 10px solid transparent;
    border-left: 10px solid transparent;
    content: "";
  }
  .terminal-card {
    position: absolute;
    top: 340px;
    left: 78px;
    z-index: 2;
    width: 924px;
    height: 570px;
    padding: 59px 58px;
    border-radius: 6px;
    background: var(--terminal);
    box-shadow: 0 28px 64px rgba(55, 53, 47, 0.16);
    color: var(--paper);
    font-family: Menlo, monospace;
  }
  .terminal-line {
    display: flex;
    align-items: baseline;
    min-height: 39px;
    color: var(--paper);
    font-size: 28px;
    font-weight: 400;
    letter-spacing: -0.035em;
    line-height: 1.35;
    white-space: nowrap;
  }
  .terminal-cursor {
    display: inline-block;
    width: 19px;
    height: 31px;
    margin-left: 8px;
    transform: translateY(4px);
    background: var(--paper);
  }
  .terminal-output {
    display: flex;
    flex-direction: column;
    gap: 22px;
    margin-top: 43px;
    color: rgba(247, 246, 243, 0.70);
    font-size: 20px;
    font-weight: 400;
    letter-spacing: -0.035em;
    line-height: 1.35;
    white-space: nowrap;
  }
  .terminal-output-line {
    display: flex;
    align-items: center;
  }
  .completion-mark {
    display: inline-block;
    width: 11px;
    height: 11px;
    margin-left: 15px;
    border-radius: 50%;
    background: var(--coral);
  }
  .flip-headline {
    position: absolute;
    top: 1078px;
    left: 72px;
    z-index: 3;
  }
  .flip-line {
    position: relative;
    left: 0;
    top: 0;
    font-size: 140px;
    line-height: 0.84;
    transform: scaleX(0.76);
  }
  .flip-line + .flip-line { margin-top: 11px; }
  .end-logo {
    position: absolute;
    top: 360px;
    left: 430px;
    z-index: 2;
    display: block;
    width: 220px;
    height: 220px;
    border-radius: 6px;
  }
  .end-wordmark {
    position: absolute;
    top: 625px;
    left: 0;
    width: 100%;
    color: var(--ink);
    font-size: 96px;
    font-weight: 600;
    letter-spacing: -0.065em;
    line-height: 1;
    text-align: center;
  }
  .end-domain {
    position: absolute;
    top: 750px;
    left: 0;
    width: 100%;
    color: var(--muted);
    font-size: 25px;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.2;
    text-align: center;
  }
  .end-button {
    position: absolute;
    top: 819px;
    left: 390px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 300px;
    height: 76px;
    border-radius: 999px;
    background: var(--terminal);
    color: var(--white);
    font-size: 25px;
    font-weight: 500;
    letter-spacing: -0.025em;
  }
`

const page = (body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1080, initial-scale=1" />
    <title>Artifact Share keyframe</title>
    <style>${sharedCss}</style>
  </head>
  <body>
    <main class="page">${body}</main>
  </body>
</html>`

const wordmark = () => `
  <div class="wordmark-pill">
    <img src="${logoDataUri}" alt="" />
    <div class="wordmark-copy">
      <div class="wordmark-name">Artifact Share</div>
      <div class="wordmark-domain">artifactshare.com</div>
    </div>
  </div>`

const emptyPaper = () => page(wordmark())

const hookHeadline = (withCoralLine: boolean) => page(`
  ${wordmark()}
  <div class="hero-line hero-one">YOUR AGENT</div>
  <div class="hero-line hero-two">WROTE THE SPEC.</div>
  ${withCoralLine ? '<div class="hero-line hero-three">WHO REVIEWS IT?</div>' : ''}
`)

const stackHeadline = () => page(`
  ${wordmark()}
  <div class="stack-line stack-one">SHARE ONCE.</div>
  <div class="stack-line stack-two">REVIEW AT ONE URL.</div>
  <div class="stack-line stack-three">ANY AGENT.</div>
`)

type DocumentCardOptions = {
  transform: 'tilted' | 'flat'
  stats: string[]
  sentence: string
  highlight?: boolean
  comment?: boolean
}

const documentCard = ({ transform, stats, sentence, highlight = false, comment = false }: DocumentCardOptions) => `
  ${wordmark()}
  <div class="document-wrap ${transform}">
    <article class="document-card">
      <div class="document-kicker">CHECKOUT · PRODUCT DECISION</div>
      <h1 class="document-title">Checkout redesign: one-page checkout with saved payment</h1>
      <div class="decision-box">
        <div class="decision-label">DECISION NEEDED</div>
        <p class="decision-sentence"><span class="sentence-text${highlight ? ' highlighted' : ''}">${sentence}</span></p>
      </div>
      <div class="stat-row ${stats.length === 4 ? 'four' : 'three'}">
        ${stats.map((stat) => `<div class="stat-tile"><div class="stat-value">${stat}</div></div>`).join('')}
      </div>
      ${comment ? '<div class="comment-bubble">Give me the 3-week cut.</div>' : ''}
    </article>
  </div>`

const originalDecision = 'Approve a 6-week rebuild of checkout as a single page with saved payment methods.'
const revisedDecision = 'Approve a 3-week cut: single-page checkout with saved payment, using the provider-hosted vault.'

const docStart = () => page(documentCard({
  transform: 'tilted',
  stats: ['6 weeks', '2 engineers', 'k', '+11%'],
  sentence: originalDecision,
}))

const docEnd = () => page(documentCard({
  transform: 'flat',
  stats: ['6 weeks', '2 engineers', 'k', '+11%'],
  sentence: originalDecision,
  highlight: true,
  comment: true,
}))

const terminalStart = () => page(`
  ${wordmark()}
  <section class="terminal-card">
    <div class="terminal-line"><span>~/docs %</span><span class="terminal-cursor"></span></div>
  </section>
`)

const terminalEnd = () => page(`
  ${wordmark()}
  <section class="terminal-card">
    <div class="terminal-line"><span>~/docs % claude -p &quot;apply the review comments&quot;</span></div>
    <div class="terminal-output">
      <div class="terminal-output-line"><span>Changed: 6 wk / k / +11%  →  3 wk / k / +9%</span><span class="completion-mark"></span></div>
      <div class="terminal-output-line"><span>New version: same URL · thread resolved</span></div>
    </div>
  </section>
`)

const flipStart = () => page(documentCard({
  transform: 'flat',
  stats: ['6 weeks', 'k', '+11%'],
  sentence: originalDecision,
}))

const flipEnd = () => page(`
  ${documentCard({
    transform: 'flat',
    stats: ['3 weeks', 'k', '+9%'],
    sentence: revisedDecision,
  })}
  <div class="flip-headline">
    <div class="flip-line">NEXT VERSION.</div>
    <div class="flip-line">SAME URL.</div>
  </div>
`)

const endStart = () => page(`<img class="end-logo" src="${logoDataUri}" alt="Artifact Share" />`)

const endEnd = () => page(`
  <img class="end-logo" src="${logoDataUri}" alt="Artifact Share" />
  <div class="end-wordmark">Artifact Share</div>
  <div class="end-domain">artifactshare.com</div>
  <div class="end-button">Try it free</div>
`)

export type KeyframeShot = {
  id: string
  durationSec: number
  startFrame: () => string
  endFrame: () => string
  prompt: string
}

export const shots: KeyframeShot[] = [
  {
    id: 'hook-a',
    durationSec: 2,
    startFrame: emptyPaper,
    endFrame: () => hookHeadline(false),
    prompt: 'Words slam in from the left with a bass hit, slight overshoot, micro camera shake; hard, elastic easing.',
  },
  {
    id: 'hook-b',
    durationSec: 2,
    startFrame: () => hookHeadline(false),
    endFrame: () => hookHeadline(true),
    prompt: 'Coral line drops from above with letters staggered and lands with a thud.',
  },
  {
    id: 'doc',
    durationSec: 3,
    startFrame: docStart,
    endFrame: docEnd,
    prompt: 'Card flies in and settles flat with parallax, cursor selects the sentence, comment bubble pops with elastic easing.',
  },
  {
    id: 'terminal',
    durationSec: 2.5,
    startFrame: terminalStart,
    endFrame: terminalEnd,
    prompt: 'Text types itself fast, cursor blinks, a coral flash at the end.',
  },
  {
    id: 'flip',
    durationSec: 2.5,
    startFrame: flipStart,
    endFrame: flipEnd,
    prompt: 'Numbers flip like a split-flap board, headline lines slide in staggered.',
  },
  {
    id: 'stack',
    durationSec: 2,
    startFrame: emptyPaper,
    endFrame: stackHeadline,
    prompt: 'Each line slams in with a hit, whip-pan feel.',
  },
  {
    id: 'end',
    durationSec: 1.5,
    startFrame: endStart,
    endFrame: endEnd,
    prompt: 'Logo bounces to scale, wordmark and button fade-slide up, subtle light sweep.',
  },
]

export default shots
