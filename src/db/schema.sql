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

create index if not exists idx_creatives_experiment on creatives(experiment_id);
create index if not exists idx_evaluations_creative on evaluations(creative_id);
create index if not exists idx_performance_creative on performance(creative_id);
create index if not exists idx_ledger_created on budget_ledger(created_at);
