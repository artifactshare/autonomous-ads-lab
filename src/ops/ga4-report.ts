// Ad-hoc GA4 report for agents without local keys. Runs in GitHub Actions (workflow ga4-report.yml)
// where GA4_SA_KEY_B64 exists; prints a table to the run log. Never writes to the DB.
//   GA4_DIMENSIONS=dateHourMinute,sessionSource,sessionMedium,country GA4_METRICS=sessions,activeUsers \
//   GA4_START=today GA4_END=today GA4_FILTER_DIM=country GA4_FILTER_VALUE=Singapore pnpm tsx src/ops/ga4-report.ts
import { accessToken } from './ga4.ts'

const propertyId = process.env.GA4_PROPERTY_ID
const keyB64 = process.env.GA4_SA_KEY_B64
if (!propertyId || !keyB64) { console.error('GA4_PROPERTY_ID / GA4_SA_KEY_B64 not set'); process.exit(2) }
const key = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8'))
const dims = (process.env.GA4_DIMENSIONS ?? 'dateHourMinute,sessionSource,sessionMedium,country').split(',').map((name) => ({ name }))
const mets = (process.env.GA4_METRICS ?? 'sessions,activeUsers').split(',').map((name) => ({ name }))
const body: Record<string, unknown> = {
  dateRanges: [{ startDate: process.env.GA4_START ?? 'today', endDate: process.env.GA4_END ?? 'today' }],
  dimensions: dims,
  metrics: mets,
  limit: Number(process.env.GA4_LIMIT ?? 200),
  orderBys: [{ dimension: { dimensionName: dims[0]!.name } }],
}
if (process.env.GA4_FILTER_DIM && process.env.GA4_FILTER_VALUE) {
  body.dimensionFilter = { filter: { fieldName: process.env.GA4_FILTER_DIM, stringFilter: { value: process.env.GA4_FILTER_VALUE, matchType: 'EXACT' } } }
}
const token = await accessToken(key)
const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
})
if (!res.ok) { console.error(`GA4 runReport failed: ${res.status} ${await res.text()}`); process.exit(1) }
const r = (await res.json()) as { rows?: Array<{ dimensionValues: { value: string }[]; metricValues: { value: string }[] }> }
console.log([...dims.map((d) => d.name), ...mets.map((m) => m.name)].join('\t'))
for (const row of r.rows ?? []) console.log([...row.dimensionValues.map((v) => v.value), ...row.metricValues.map((v) => v.value)].join('\t'))
console.log(`rows: ${r.rows?.length ?? 0}`)
