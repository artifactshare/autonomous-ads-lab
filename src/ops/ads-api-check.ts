// Connectivity check: GET /accounts/{id} and list campaigns. Prints no secrets.
import { accountIdFromEnv, adsGet, credsFromEnv, listCampaigns } from '../ads/x-ads-api.ts'

const creds = credsFromEnv()
if (!creds) {
  console.error('missing X_ADS_* secrets')
  process.exit(2)
}
const accountId = accountIdFromEnv()
const acct = await adsGet<{ data: { id: string; name: string; timezone: string; approval_status: string } }>(creds, `/accounts/${accountId}`)
console.log('account', acct.data.id, acct.data.name, acct.data.timezone, acct.data.approval_status)
for (const c of await listCampaigns(creds, accountId)) console.log('campaign', c.id, c.entity_status, c.name)
