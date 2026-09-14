// Keyframe shot list for the 14s "file → URL → comment → fix, same URL" ad (4:5, 1080x1350 — X Ads rejects 3:4; allowed: 2:3, 4:5, 191:100, 1:1, 9:16, 16:9).
// Each shot has a start and end HTML frame; H3 Max Turbo interpolates between them. Brand tokens = LP design system.
import { readFileSync } from 'node:fs'

const FOOT = 'data/footage/loop-2026-09-14'
const font = (w) => `@font-face{font-family:Geist;font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(`${FOOT}/Geist-${w}.ttf`).toString('base64')})}`
const LOGO = 'data:image/png;base64,' + readFileSync('/Users/coji/progs/artifactshare/public/docs/brand/png/icon-512.png').toString('base64')

const CSS = `
${font(400)}${font(500)}${font(600)}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1350px;overflow:hidden;background:#f7f6f3;font-family:Geist,system-ui,sans-serif;color:#37352f}
.pill{position:absolute;top:44px;left:48px;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.92);border:1px solid rgba(55,53,47,.12);border-radius:999px;padding:10px 18px 10px 12px}
.pill img{width:28px;height:28px;border-radius:7px}.pill b{font-weight:600;font-size:26px}.pill span{font-size:24px;color:rgba(55,53,47,.7)}
.h1{font-weight:600;font-size:132px;line-height:1.02;letter-spacing:-.02em}
.coral{color:#F76B58}.muted{color:rgba(55,53,47,.7)}
.term{position:absolute;left:80px;right:80px;background:#1b1a17;border-radius:12px;padding:40px 44px;font-family:Menlo,monospace;font-size:34px;line-height:1.55;color:#c9d1d9;box-shadow:0 20px 60px rgba(55,53,47,.18)}
.term .p{color:#8b93a7}.term .ok{color:#7ee787}.term .cmd{color:#c9b8ff}
.cur{display:inline-block;width:18px;height:36px;background:#c9d1d9;vertical-align:-6px}
.browser{position:absolute;left:60px;right:60px;top:220px;bottom:200px;background:#fff;border:1px solid rgba(55,53,47,.12);border-radius:12px;box-shadow:0 24px 70px rgba(55,53,47,.16);overflow:hidden}
.bar{height:76px;background:#f7f6f3;border-bottom:1px solid rgba(55,53,47,.12);display:flex;align-items:center;padding:0 24px;gap:14px}
.bar i{width:16px;height:16px;border-radius:50%;background:rgba(55,53,47,.18)}
.url{flex:1;margin-left:14px;height:46px;border-radius:8px;background:#fff;border:1px solid rgba(55,53,47,.12);font-size:24px;display:flex;align-items:center;padding:0 18px;color:#37352f}
.url b{font-weight:500}.url span{color:rgba(55,53,47,.55)}
.doc{padding:56px 64px}
.meta{font-size:18px;color:#1766ad;margin-bottom:14px}.meta span{color:rgba(55,53,47,.55);margin-left:10px}
.title{font-weight:600;font-size:44px;line-height:1.15;margin-bottom:14px}
.lead{font-size:22px;color:rgba(55,53,47,.7);line-height:1.5;margin-bottom:36px}
.sec{font-weight:600;font-size:24px;margin-bottom:14px}
.box{background:#f7f6f3;border:1px solid rgba(55,53,47,.12);border-radius:6px;padding:22px 26px}
.lab{font-size:15px;letter-spacing:.08em;color:rgba(55,53,47,.55);margin-bottom:10px}
.sent{font-size:26px;line-height:1.45;margin-bottom:22px}
.hl{background:#cfe3f7;box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:2px 0}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.tile{background:#fff;border:1px solid rgba(55,53,47,.12);border-radius:6px;padding:18px 16px}
.tile b{display:block;font-weight:600;font-size:30px;margin-bottom:4px}.tile span{font-size:15px;color:rgba(55,53,47,.55)}
.bubble{position:absolute;background:rgba(55,53,47,.94);color:#fff;font-size:30px;font-weight:500;padding:18px 26px;border-radius:8px;box-shadow:0 10px 30px rgba(55,53,47,.3)}
.bubble:after{content:'';position:absolute;left:36px;top:-14px;border:14px solid transparent;border-top:0;border-bottom-color:rgba(55,53,47,.94)}
.btn{display:inline-block;background:#37352f;color:#fff;font-weight:600;font-size:40px;padding:22px 48px;border-radius:8px}
`
const pill = `<div class="pill"><img src="${LOGO}"><b>Artifact Share</b><span>artifactshare.com</span></div>`
const page = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}${extra}</style></head><body>${body}</body></html>`

const docCard = ({ weeks = '6 weeks', cost = '$38k', lift = '+11%', sentence = 'Approve a 6-week rebuild of checkout as a single page with saved payment methods.', hl = false, bubble = false, version = 'v1' } = {}) => `
<div class="browser">
  <div class="bar"><i></i><i></i><i></i><div class="url"><b>artifactshare.com</b><span>/a/lgf2tlfml3</span></div></div>
  <div class="doc">
    <div class="meta">● Drafted by Claude Code <span>from PRs #412–#438 · ${version} · Sep 2026</span></div>
    <div class="title">Checkout redesign: one-page checkout with saved payment</div>
    <div class="lead">Why we should replace the 4-step checkout, what it costs, and the one decision this doc needs from the team.</div>
    <div class="sec">The decision</div>
    <div class="box"><div class="lab">DECISION NEEDED</div>
      <div class="sent">${hl ? `<span class="hl">${sentence}</span>` : sentence}</div>
      <div class="tiles"><div class="tile"><b>${weeks}</b><span>engineering</span></div><div class="tile"><b>2 engineers</b><span>+ design review</span></div><div class="tile"><b>${cost}</b><span>fully loaded</span></div><div class="tile"><b>${lift}</b><span>projected checkout completion</span></div></div>
    </div>
  </div>
  ${bubble ? `<div class="bubble" style="left:150px;top:612px">Give me the 3-week cut.</div>` : ''}
</div>`

const termTop = (inner, top = 300) => `<div class="term" style="top:${top}px">${inner}</div>`
const okLine = `<div><span class="p">~/docs % </span><span class="cmd">claude -p "write the checkout spec"</span></div><div><span class="ok">✓</span> wrote <b style="color:#fff">checkout-spec.html</b></div>`

// Zoomed fragments: one element per screen, sized to survive 360px feed width.
const urlBar = (path, top = 200) => `<div style="position:absolute;left:60px;right:60px;top:${top}px;height:110px;background:#fff;border:1px solid rgba(55,53,47,.12);border-radius:16px;box-shadow:0 18px 50px rgba(55,53,47,.14);display:flex;align-items:center;padding:0 34px;font-size:44px"><b style="font-weight:500">artifactshare.com</b><span style="color:rgba(55,53,47,.55)">${path}</span></div>`
const bigFile = (top, size = 84) => `<div style="position:absolute;left:60px;right:60px;top:${top}px;font-family:Menlo,monospace;font-size:${size}px;line-height:1.05;letter-spacing:-.04em;color:#37352f;white-space:nowrap">checkout-spec<span style="color:rgba(55,53,47,.5)">.html</span></div>`
const bigSentence = (text, hl) => `<div style="position:absolute;left:80px;right:80px;top:470px;font-size:66px;line-height:1.3;font-weight:500">${hl ? `<span class="hl">${text}</span>` : text}</div>`
const bigTiles = (weeks, cost, lift, top = 560) => `<div style="position:absolute;left:60px;right:60px;top:${top}px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px">${[[weeks,'engineering'],[cost,'fully loaded'],[lift,'checkout completion']].map(([b,l])=>`<div style="background:#fff;border:1px solid rgba(55,53,47,.12);border-radius:12px;padding:40px 18px;box-shadow:0 12px 36px rgba(55,53,47,.1)"><div style="font-weight:600;font-size:72px;line-height:1;margin-bottom:14px;letter-spacing:-.03em;white-space:nowrap">${b}</div><div style="font-size:26px;color:rgba(55,53,47,.55)">${l}</div></div>`).join('')}</div>`
const docBg = () => ''
const bubble = (top) => `<div class="bubble" style="left:80px;top:${top}px;font-size:56px;padding:26px 34px;border-radius:12px">Give me the 3-week cut.</div>`
const endCard = (main) => `<img src="${LOGO}" style="position:absolute;left:430px;top:380px;width:220px;height:220px"><div style="position:absolute;left:0;right:0;top:650px;text-align:center;font-weight:600;font-size:104px;letter-spacing:-.02em">Artifact Share</div><div style="position:absolute;left:0;right:0;top:790px;text-align:center;font-size:44px" class="muted">Any agent. One URL.</div>${main}`

export const shots = [
  { id: 'hook-a', durationSec: 1,
    start: page(`<div style="position:absolute;inset:0;background:#1b1a17"></div>` + `<div class="pill" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)"><img src="${LOGO}"><b style="color:#fff">Artifact Share</b><span style="color:#c9d1d9">artifactshare.com</span></div>`),
    end: page(`<div style="position:absolute;inset:0;background:#1b1a17"></div>` + `<div class="pill" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)"><img src="${LOGO}"><b style="color:#fff">Artifact Share</b><span style="color:#c9d1d9">artifactshare.com</span></div>` + `<div style="position:absolute;left:60px;top:400px;font-family:Menlo,monospace;font-size:44px;color:#8b93a7"><span style="color:#7ee787">✓</span> wrote</div><div style="position:absolute;left:60px;right:60px;top:470px;font-family:Menlo,monospace;font-size:84px;line-height:1.05;letter-spacing:-.04em;color:#fff;white-space:nowrap">checkout-spec<span style="color:#8b93a7">.html</span></div>`),
    prompt: 'Dark terminal screen. The line "✓ wrote" and the big filename type themselves in fast, left to right, like a terminal. Nothing else appears.' },
  { id: 'hook-b', durationSec: 2,
    start: page(`<div style="position:absolute;inset:0;background:#1b1a17"></div>` + `<div class="pill" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)"><img src="${LOGO}"><b style="color:#fff">Artifact Share</b><span style="color:#c9d1d9">artifactshare.com</span></div>` + `<div style="position:absolute;left:60px;top:400px;font-family:Menlo,monospace;font-size:44px;color:#8b93a7"><span style="color:#7ee787">✓</span> wrote</div><div style="position:absolute;left:60px;right:60px;top:470px;font-family:Menlo,monospace;font-size:84px;line-height:1.05;letter-spacing:-.04em;color:#fff;white-space:nowrap">checkout-spec<span style="color:#8b93a7">.html</span></div>`),
    end: page(`<div style="position:absolute;inset:0;background:#1b1a17"></div>` + `<div class="pill" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)"><img src="${LOGO}"><b style="color:#fff">Artifact Share</b><span style="color:#c9d1d9">artifactshare.com</span></div>` + `<div style="position:absolute;left:60px;top:400px;font-family:Menlo,monospace;font-size:44px;color:#8b93a7"><span style="color:#7ee787">✓</span> wrote</div><div style="position:absolute;left:60px;right:60px;top:470px;font-family:Menlo,monospace;font-size:84px;line-height:1.05;letter-spacing:-.04em;color:#fff;white-space:nowrap">checkout-spec<span style="color:#8b93a7">.html</span></div>` + `<div class="h1 coral" style="position:absolute;left:60px;right:60px;top:800px;font-size:150px">Who<br>reviews it?</div>`),
    prompt: 'Everything already on screen stays fixed. Below the filename, the coral headline drops in from above with a heavy thud and slight overshoot: the word "Who" first, then "reviews it?" under it. No other change.' },
  { id: 'to-url', durationSec: 2,
    start: page(`<div style="position:absolute;inset:0;background:#1b1a17"></div>` + `<div class="pill" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)"><img src="${LOGO}"><b style="color:#fff">Artifact Share</b><span style="color:#c9d1d9">artifactshare.com</span></div>` + `<div style="position:absolute;left:60px;top:400px;font-family:Menlo,monospace;font-size:44px;color:#8b93a7"><span style="color:#7ee787">✓</span> wrote</div><div style="position:absolute;left:60px;right:60px;top:470px;font-family:Menlo,monospace;font-size:84px;line-height:1.05;letter-spacing:-.04em;color:#fff;white-space:nowrap">checkout-spec<span style="color:#8b93a7">.html</span></div>` + `<div class="h1 coral" style="position:absolute;left:60px;right:60px;top:800px;font-size:150px">Who<br>reviews it?</div>`),
    end: page(pill + urlBar('/a/lgf2tlfml3', 330) + `<div style="position:absolute;left:80px;right:80px;top:500px;font-weight:600;font-size:56px;line-height:1.15">Checkout redesign: one-page checkout with saved payment</div>` + bigSentence('Approve a 6-week rebuild of checkout as a single page with saved payment methods.', false).replace('top:470px','top:680px') + bigTiles('6 weeks', '$38k', '+11%', 980)),
    prompt: 'Whip-pan: the dark screen wipes away to warm paper. The big filename shrinks and glides into a browser address bar that appears at the top; then the page title, the sentence and the three stat tiles unfold beneath it one after another. All text stays crisp and identical to the end frame; no extra text. Snappy elastic easing.' },
  { id: 'comment', durationSec: 2.5,
    start: page(pill + docBg() + urlBar('/a/lgf2tlfml3', 200) + bigSentence('Approve a 6-week rebuild of checkout as a single page with saved payment methods.', false)),
    end: page(pill + docBg() + urlBar('/a/lgf2tlfml3', 200) + bigSentence('Approve a 6-week rebuild of checkout as a single page with saved payment methods.', true) + bubble(860)),
    prompt: 'Camera is pushed in on one sentence of the page. A cursor sweeps across it and a pale blue highlight fills left to right; then a dark comment bubble pops in below with elastic easing. Background page stays still.' },
  { id: 'agent', durationSec: 1.5,
    start: page(pill + `<div style="position:absolute;left:0;right:0;top:0;bottom:0;background:#1b1a17"></div>` + `<div style="position:absolute;left:60px;right:60px;top:560px;font-family:Menlo,monospace;font-size:64px;line-height:1.25;color:#c9d1d9"><span style="color:#8b93a7">~/docs %</span> <span class="cur" style="height:64px;background:#c9d1d9"></span></div>`),
    end: page(pill + `<div style="position:absolute;left:0;right:0;top:0;bottom:0;background:#1b1a17"></div>` + `<div style="position:absolute;left:60px;right:60px;top:560px;font-family:Menlo,monospace;font-size:64px;line-height:1.25;color:#c9d1d9"><span style="color:#8b93a7">~/docs %</span> <span style="color:#c9b8ff">claude -p "apply the comments"</span><span class="cur" style="height:64px;background:#c9d1d9"></span></div>`),
    prompt: 'Dark terminal full screen. The command types itself fast, character by character, cursor blinking. At the very end a very brief, thin coral flash along the bottom edge only. Nothing else moves.' },
  { id: 'flip', durationSec: 2.5,
    start: page(pill + docBg() + urlBar('/a/lgf2tlfml3', 200) + bigTiles('6 weeks', '$38k', '+11%')),
    end: page(pill + docBg() + urlBar('/a/lgf2tlfml3', 200) + bigTiles('3 weeks', '$19k', '+9%') + `<div class="h1" style="position:absolute;left:60px;right:60px;top:960px;font-size:120px">Same URL.</div>`),
    prompt: 'Same address bar stays fixed at the top. The three big tiles flip like a split-flap board: 6 weeks becomes 3 weeks, $38k becomes $19k, +11% becomes +9%, with mechanical clicks. Then the headline "Same URL." slams in below. Text stays sharp.' },
  { id: 'end', durationSec: 2.5, holdSec: 1.2,
    start: page(`<img src="${LOGO}" style="position:absolute;left:430px;top:560px;width:220px;height:220px">`),
    end: page(endCard(`<div style="position:absolute;left:0;right:0;top:940px;text-align:center"><span class="btn" style="font-size:52px;padding:30px 64px;border-radius:12px">Try it free</span></div><div style="position:absolute;left:0;right:0;top:1100px;text-align:center;font-size:40px" class="muted">artifactshare.com</div>`)),
    prompt: 'The coral logo tile bounces up with a spring; the wordmark, tagline, big black "Try it free" button and URL slide up and fade in, staggered. Subtle light sweep across the button. Still background.' },
]
