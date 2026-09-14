// Chunked video upload for ads (media_category=amplify_video) over OAuth 1.0a.
// INIT → APPEND (multipart, 4MB chunks) → FINALIZE → STATUS poll until succeeded.
import { readFileSync } from 'node:fs'
import { oauthHeader, type AdsCreds } from './x-ads-api.ts'

const UPLOAD = 'https://upload.twitter.com/1.1/media/upload.json'
const CHUNK = 4 * 1024 * 1024

async function call(creds: AdsCreds, params: Record<string, string>, form?: FormData) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${UPLOAD}?${qs}`, {
    method: 'POST',
    headers: { Authorization: oauthHeader(creds, 'POST', UPLOAD, params) },
    body: form,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`media upload ${res.status} ${params.command}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : {}
}

export async function uploadAmplifyVideo(creds: AdsCreds, filePath: string, log: (m: string) => void = () => {}): Promise<string> {
  const buf = readFileSync(filePath)
  const init = await call(creds, {
    command: 'INIT',
    media_type: 'video/mp4',
    media_category: 'amplify_video',
    total_bytes: String(buf.length),
  })
  const mediaId: string = init.media_id_string
  const mediaKey: string = init.media_key
  log(`upload INIT media_key=${mediaKey} bytes=${buf.length}`)
  for (let i = 0, seg = 0; i < buf.length; i += CHUNK, seg++) {
    const form = new FormData()
    form.append('media', new Blob([buf.subarray(i, i + CHUNK)]), 'chunk')
    await call(creds, { command: 'APPEND', media_id: mediaId, segment_index: String(seg) }, form)
  }
  let st = await call(creds, { command: 'FINALIZE', media_id: mediaId })
  for (let tries = 0; st.processing_info && st.processing_info.state !== 'succeeded'; tries++) {
    if (st.processing_info.state === 'failed') throw new Error(`media processing failed: ${JSON.stringify(st.processing_info.error)}`)
    if (tries > 60) throw new Error('media processing timeout')
    await new Promise((r) => setTimeout(r, Math.max(1, st.processing_info.check_after_secs ?? 2) * 1000))
    const qs = new URLSearchParams({ command: 'STATUS', media_id: mediaId })
    const res = await fetch(`${UPLOAD}?${qs}`, { headers: { Authorization: oauthHeader(creds, 'GET', UPLOAD, { command: 'STATUS', media_id: mediaId }) } })
    st = JSON.parse(await res.text())
  }
  log(`upload done media_key=${mediaKey} state=${st.processing_info?.state ?? 'n/a'}`)
  return mediaKey
}
