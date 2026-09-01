-- Autonomous Ads Lab - Experience DB schema
-- All money values are USD. All timestamps are ISO 8601 UTC strings.

create table if not exists experiments (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status text not null default 'draft', -- draft | running | completed | aborted
  domain text not null,                 -- e.g. 'artifact_share'
  objective text not null,
  hypothesis text not null,
  budget_allocated_usd real not null default 0,
  parent_experiment_id integer references experiments(id)
);

create table if not exists creatives (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  experiment_id integer not null references experiments(id),
  parent_creative_id integer references creatives(id), -- lineage: mutation parent
  role text not null default 'challenger',             -- champion | mutation | challenger
  concept text not null,
  hook text not null,
  message text not null,
  cta text not null,
  prompt text not null,
  expanded_prompt text,
  seed integer,
  generation_model text,
  generation_settings text, -- JSON
  generation_request_id text, -- provider job id, persisted before polling for crash recovery
  asset_url text,
  generation_cost_usd real,
  generation_latency_ms integer
);

create table if not exists evaluations (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  creative_id integer not null references creatives(id),
  harness_version text not null default 'v0',
  hook_score real,
  product_clarity real,
  message_clarity real,
  product_salience real,
  cta_intent real,
  visual_quality real,
  artifact_score real,
  overall_score real,
  disqualified integer not null default 0, -- hard constraint violation
  failure_modes text,                      -- JSON array
  critic_notes text
);

create table if not exists deployments (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  creative_id integer not null references creatives(id),
  platform text not null default 'x',
  campaign_id text,
  ad_group_id text,
  ad_id text,
  status text not null default 'pending', -- pending | active | paused | stopped | rejected
  targeting text,                         -- JSON
  post_url text,                          -- public URL of the promoted post
  budget_usd real,
  started_at text,
  stopped_at text
);

create table if not exists performance (
  id integer primary key,
  creative_id integer not null references creatives(id),
  observed_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  spend_usd real not null default 0,
  impressions integer not null default 0,
  video_views integer not null default 0,
  clicks integer not null default 0,
  landing_views integer not null default 0,
  signups integer not null default 0,
  first_shares integer not null default 0
);

create table if not exists learnings (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  experiment_id integer not null references experiments(id),
  observation text not null,
  hypothesis text,
  evidence text,
  confidence text not null default 'low', -- low | medium | high | insufficient_data
  lesson text,
  recommended_action text
);

-- Research: raw observations from Grok / web (daily monitoring + weekly research).
create table if not exists research_observations (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  kind text not null,          -- 'mentions' | 'pain_points' | 'ad_trends' | 'techniques'
  query text not null,
  source text not null,        -- 'grok' | 'web'
  summary text not null,
  raw text,                    -- JSON: citations, source posts
  cost_usd real not null default 0,
  run_id text not null
);

-- Technique Library: normalized, evidence-gated knowledge.
-- Popularity is not validation: discovered -> experimental -> validated | rejected.
create table if not exists techniques (
  id integer primary key,
  discovered_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name text not null,
  source text not null,
  description text not null,
  applicable_domains text,     -- JSON array
  hypothesis text not null,
  implementation_hint text,
  evidence text,
  confidence text not null default 'low',
  status text not null default 'discovered', -- discovered | experimental | validated | rejected
  observation_id integer references research_observations(id)
);

-- Harness self-modification history (Phase 8). Every autonomous change to the
-- harness itself is recorded here for auditability and rollback.
create table if not exists harness_versions (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  change_type text not null,   -- 'fix' | 'improvement' | 'policy_change'
  description text not null,
  reason text not null,
  pr_url text,
  commit_sha text,
  status text not null default 'deployed' -- proposed | deployed | rolled_back
);

-- Budget ledger: append-only record of every authorized spend.
create table if not exists budget_ledger (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  category text not null,      -- 'creative' | 'ads' | 'ai'
  amount_usd real not null,    -- estimated at authorize time; reconciled later if needed
  description text not null,
  run_id text not null,
  experiment_id integer references experiments(id),
  creative_id integer references creatives(id),
  idempotency_key text unique  -- prevents double-charging the same action
);

-- Structured run log. The JSONL files under logs/ are gitignored and the
-- Actions runner is destroyed after every job, so automated runs used to leave
-- no auditable trace beyond the journal prose. Mirroring log lines here puts
-- them on the existing `data/` commit path, so decisions survive the run and
-- the harness agent can query them with SQL.
create table if not exists run_logs (
  id integer primary key,
  ts text not null,
  run_id text not null,
  level text not null,         -- debug | info | warn | error
  event text not null,
  experiment_id integer,       -- deliberately not a FK: logs must never fail an insert
  creative_id integer,
  fields text                  -- JSON object of the remaining structured fields
);

-- fable-5 weekly usage counter. The in-process counter in llm/policy.ts resets
-- every job run, so daily jobs could burn the weekly limit 7x. This table makes
-- the cap survive across runs (week_start = Monday, ISO date).
create table if not exists fable_usage (
  week_start text primary key,
  calls integer not null default 0
);

create index if not exists idx_run_logs_ts on run_logs(ts);
create index if not exists idx_run_logs_run on run_logs(run_id);

create index if not exists idx_creatives_experiment on creatives(experiment_id);
create index if not exists idx_evaluations_creative on evaluations(creative_id);
create index if not exists idx_performance_creative on performance(creative_id);
create index if not exists idx_ledger_created on budget_ledger(created_at);
