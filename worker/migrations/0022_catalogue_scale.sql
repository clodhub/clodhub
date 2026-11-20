-- The catalogue at scale. Entry rows are the listing: each holds the summary of its newest listed version, and every
-- facet and sort has an index, so a listing page reads about one page of rows. Each version's full entry (foundations,
-- recipe.json, settings and the rest) is a document in the CATALOGUE R2 bucket at documents/<kind>/<slug>/<version>/<sha256 of the document>.json;
-- version rows keep only what pages and checks read. Entries are format 2: every stored version is removed and published
-- again; entries keep their names and owners. Classes and the category tree are entries too. Images live in R2 by sha256.

DROP TABLE catalogue_fts;
DROP TABLE recipe_slots;
DROP TABLE component_dependencies;
DROP TABLE component_interfaces;
DROP TABLE recipe_versions;
DROP TABLE component_versions;

ALTER TABLE components RENAME TO components_before;
ALTER TABLE recipes RENAME TO recipes_before;

-- seq is the full-text search rowid. The columns after updated_at summarise the newest listed version (latest_version);
-- they are empty while no version is listed. platforms is space-delimited with a space at each end, for example
-- " web ios ". quality: 0 packaged, 1 reviewed, 2 integration-tested, 3 live-tested, NULL not assessed.
-- vulnerabilities: known advisories not waived, NULL until first checked. downloads is the last 30 days.
CREATE TABLE components (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  developer_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
  repo TEXT NOT NULL,
  latest_version TEXT,
  deprecated_at TEXT,
  deprecated_reason TEXT CHECK (deprecated_reason IN ('owner-deprecated', 'owner-deleted')),
  replacement TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  class_name TEXT,
  class_version TEXT,
  class_title TEXT,
  category TEXT,
  category_top TEXT,
  platforms TEXT NOT NULL DEFAULT ' ',
  targets_client TEXT NOT NULL DEFAULT '[]',
  targets_server TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '',
  licence TEXT,
  quality INTEGER,
  certified INTEGER NOT NULL DEFAULT 0,
  channel TEXT,
  vulnerabilities INTEGER,
  thumbnail TEXT,
  published_at TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  trending REAL NOT NULL DEFAULT 0,
  CHECK ((deprecated_at IS NULL) = (deprecated_reason IS NULL)),
  CHECK (developer_id IS NOT NULL OR COALESCE(deprecated_reason, '') = 'owner-deleted')
);

CREATE TABLE recipes (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  developer_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
  repo TEXT NOT NULL,
  latest_version TEXT,
  deprecated_at TEXT,
  deprecated_reason TEXT CHECK (deprecated_reason IN ('owner-deprecated', 'owner-deleted')),
  replacement TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  category TEXT,
  category_top TEXT,
  platforms TEXT NOT NULL DEFAULT ' ',
  targets_client TEXT NOT NULL DEFAULT '[]',
  targets_server TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '',
  licence TEXT,
  quality INTEGER,
  certified INTEGER NOT NULL DEFAULT 0,
  channel TEXT,
  vulnerabilities INTEGER,
  thumbnail TEXT,
  published_at TEXT,
  downloads INTEGER NOT NULL DEFAULT 0,
  trending REAL NOT NULL DEFAULT 0,
  CHECK ((deprecated_at IS NULL) = (deprecated_reason IS NULL)),
  CHECK (developer_id IS NOT NULL OR COALESCE(deprecated_reason, '') = 'owner-deleted')
);

INSERT INTO components (id, name, scope, slug, developer_id, repo, deprecated_at, deprecated_reason, replacement, created_at, updated_at)
  SELECT id, name, scope, slug, developer_id, repo, deprecated_at, deprecated_reason, replacement, created_at, updated_at FROM components_before;
INSERT INTO recipes (id, name, scope, slug, developer_id, repo, deprecated_at, deprecated_reason, replacement, created_at, updated_at)
  SELECT id, name, scope, slug, developer_id, repo, deprecated_at, deprecated_reason, replacement, created_at, updated_at FROM recipes_before;
DROP TABLE components_before;
DROP TABLE recipes_before;

CREATE INDEX components_developer ON components(developer_id, published_at DESC);
CREATE INDEX recipes_developer ON recipes(developer_id, published_at DESC);

-- Listing indexes: one per sort, and the category, top category, class, licence and publisher facets with a sort.
-- Quality, certified, channel, platform and no-known-vulnerabilities filter the rows an index gives. Keyset pagination continues from the last
-- row's sort value and seq, so every index ends in seq.
CREATE INDEX components_by_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_by_trending ON components(trending DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_by_updated ON components(published_at DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_by_name ON components(name, seq) WHERE latest_version IS NOT NULL;
CREATE INDEX components_category_downloads ON components(category, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_category_trending ON components(category, trending DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_category_updated ON components(category, published_at DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_category_name ON components(category, name, seq) WHERE latest_version IS NOT NULL;
CREATE INDEX components_top_downloads ON components(category_top, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_top_trending ON components(category_top, trending DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_top_updated ON components(category_top, published_at DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_top_name ON components(category_top, name, seq) WHERE latest_version IS NOT NULL;
CREATE INDEX components_publisher_downloads ON components(developer_id, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_class_downloads ON components(class_name, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX components_licence_downloads ON components(licence, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_by_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_by_trending ON recipes(trending DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_by_updated ON recipes(published_at DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_by_name ON recipes(name, seq) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_category_downloads ON recipes(category, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_category_trending ON recipes(category, trending DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_category_updated ON recipes(category, published_at DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_category_name ON recipes(category, name, seq) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_top_downloads ON recipes(category_top, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_top_trending ON recipes(category_top, trending DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_top_updated ON recipes(category_top, published_at DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_top_name ON recipes(category_top, name, seq) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_publisher_downloads ON recipes(developer_id, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;
CREATE INDEX recipes_licence_downloads ON recipes(licence, downloads DESC, seq DESC) WHERE latest_version IS NOT NULL;

-- Partial indexes for the facets of the default sort (most downloads): quality levels, platforms, channels, certified
-- and no known vulnerabilities. A query names the partial index's condition exactly, so the planner may use it.
CREATE INDEX components_quality1_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND quality >= 1;
CREATE INDEX components_quality2_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND quality >= 2;
CREATE INDEX components_quality3_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND quality >= 3;
CREATE INDEX components_platform_web_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% web %';
CREATE INDEX components_platform_server_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% server %';
CREATE INDEX components_platform_ios_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% ios %';
CREATE INDEX components_platform_macos_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% macos %';
CREATE INDEX components_platform_tvos_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% tvos %';
CREATE INDEX components_platform_android_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% android %';
CREATE INDEX components_platform_windows_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% windows %';
CREATE INDEX components_security_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND channel = 'security';
CREATE INDEX components_preview_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND channel = 'preview';
CREATE INDEX components_certified_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND certified = 1;
CREATE INDEX components_secure_downloads ON components(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND vulnerabilities = 0;
CREATE INDEX recipes_quality1_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND quality >= 1;
CREATE INDEX recipes_quality2_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND quality >= 2;
CREATE INDEX recipes_quality3_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND quality >= 3;
CREATE INDEX recipes_platform_web_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% web %';
CREATE INDEX recipes_platform_server_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% server %';
CREATE INDEX recipes_platform_ios_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% ios %';
CREATE INDEX recipes_platform_macos_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% macos %';
CREATE INDEX recipes_platform_tvos_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% tvos %';
CREATE INDEX recipes_platform_android_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% android %';
CREATE INDEX recipes_platform_windows_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND platforms LIKE '% windows %';
CREATE INDEX recipes_security_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND channel = 'security';
CREATE INDEX recipes_preview_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND channel = 'preview';
CREATE INDEX recipes_certified_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND certified = 1;
CREATE INDEX recipes_secure_downloads ON recipes(downloads DESC, seq DESC) WHERE latest_version IS NOT NULL AND vulnerabilities = 0;

-- Full-text search over name, title, summary, class and tags; rowid is the entry's seq.
CREATE VIRTUAL TABLE component_fts USING fts5(name, title, summary, class, tags, tokenize = 'unicode61', prefix = '2 3');
CREATE VIRTUAL TABLE recipe_fts USING fts5(name, title, summary, class, tags, tokenize = 'unicode61', prefix = '2 3');
-- The terms of each full-text index, to write a search prefix out as whole terms.
CREATE VIRTUAL TABLE component_vocab USING fts5vocab(component_fts, row);
CREATE VIRTUAL TABLE recipe_vocab USING fts5vocab(recipe_fts, row);

-- One row per version. document is the R2 key of the full entry.
CREATE TABLE component_versions (
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  digest TEXT NOT NULL,
  description TEXT NOT NULL,
  guardians TEXT NOT NULL DEFAULT '[]',
  suitability TEXT NOT NULL,
  class_name TEXT NOT NULL,
  class_version TEXT NOT NULL,
  class_digest TEXT NOT NULL,
  licence TEXT NOT NULL,
  platforms TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('security', 'features', 'preview')),
  fixes TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  waivers TEXT NOT NULL DEFAULT '[]',
  quality INTEGER,
  certified INTEGER NOT NULL DEFAULT 0,
  live_tested_at TEXT,
  live_tested_platform TEXT,
  vulnerabilities INTEGER,
  vulnerabilities_checked_at TEXT,
  -- when the vulnerability check next looks at this version (NULL: it names no purl); osv_alone: OSV once refused a
  -- batch holding it, so its purls are only ever sent in batches of their own; osv_runs: runs spent finding the purls
  -- OSV refuses since it was last finished
  osv_due TEXT,
  osv_alone INTEGER NOT NULL DEFAULT 0,
  osv_runs INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  source_repo TEXT NOT NULL,
  source_tag TEXT NOT NULL,
  bundle_asset TEXT NOT NULL,
  bundle_digest TEXT NOT NULL,
  document TEXT NOT NULL,
  -- what the entry row shows while this is the newest listed version
  listing TEXT NOT NULL CHECK (json_valid(listing)),
  published_at TEXT NOT NULL,
  unlisted_at TEXT,
  PRIMARY KEY (component_id, version)
);
CREATE INDEX component_versions_class ON component_versions(class_name, class_version);
CREATE INDEX component_versions_osv_due ON component_versions(osv_due) WHERE osv_due IS NOT NULL;

CREATE TABLE recipe_versions (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  digest TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  licence TEXT NOT NULL,
  platforms TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('security', 'features', 'preview')),
  fixes TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  waivers TEXT NOT NULL DEFAULT '[]',
  quality INTEGER,
  certified INTEGER NOT NULL DEFAULT 0,
  live_tested_at TEXT,
  live_tested_platform TEXT,
  vulnerabilities INTEGER,
  vulnerabilities_checked_at TEXT,
  -- when the vulnerability check next looks at this version (NULL: it names no purl); osv_alone: OSV once refused a
  -- batch holding it, so its purls are only ever sent in batches of their own; osv_runs: runs spent finding the purls
  -- OSV refuses since it was last finished
  osv_due TEXT,
  osv_alone INTEGER NOT NULL DEFAULT 0,
  osv_runs INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  has_diagram INTEGER NOT NULL DEFAULT 0,
  source_repo TEXT NOT NULL,
  source_tag TEXT NOT NULL,
  bundle_asset TEXT NOT NULL,
  bundle_digest TEXT NOT NULL,
  document TEXT NOT NULL,
  listing TEXT NOT NULL CHECK (json_valid(listing)),
  published_at TEXT NOT NULL,
  unlisted_at TEXT,
  PRIMARY KEY (recipe_id, version)
);
CREATE INDEX recipe_versions_osv_due ON recipe_versions(osv_due) WHERE osv_due IS NOT NULL;

-- One row per interface a component version provides or requires, for ?provides= and ?requires=.
CREATE TABLE component_interfaces (
  component_id TEXT NOT NULL,
  version TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('provides', 'requires')),
  port_id TEXT NOT NULL,
  type TEXT NOT NULL,
  interface_version TEXT NOT NULL,
  PRIMARY KEY (component_id, version, direction, port_id),
  FOREIGN KEY (component_id, version) REFERENCES component_versions(component_id, version) ON DELETE CASCADE
);
CREATE INDEX component_interfaces_type ON component_interfaces(type, direction);
CREATE INDEX component_interfaces_port ON component_interfaces(port_id, direction);

CREATE TABLE component_dependencies (
  component_id TEXT NOT NULL,
  version TEXT NOT NULL,
  dependency_name TEXT NOT NULL,
  dependency_version TEXT NOT NULL,
  PRIMARY KEY (component_id, version, dependency_name),
  FOREIGN KEY (component_id, version) REFERENCES component_versions(component_id, version) ON DELETE CASCADE
);
CREATE INDEX component_dependencies_name ON component_dependencies(dependency_name);

CREATE TABLE recipe_slots (
  recipe_id TEXT NOT NULL,
  version TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_version TEXT NOT NULL,
  preferred INTEGER NOT NULL CHECK (preferred IN (0, 1)),
  included_when TEXT,
  PRIMARY KEY (recipe_id, version, slot_id, component_name, component_version),
  FOREIGN KEY (recipe_id, version) REFERENCES recipe_versions(recipe_id, version) ON DELETE CASCADE
);
CREATE INDEX recipe_slots_component ON recipe_slots(component_name, component_version);

-- The category tree (classes/categories.json). The counts cover the node and its descendants and are kept by the
-- worker as entries are listed, moved and unlisted.
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent TEXT REFERENCES categories(id),
  classes INTEGER NOT NULL DEFAULT 0,
  components INTEGER NOT NULL DEFAULT 0,
  recipes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX categories_parent ON categories(parent);

CREATE TABLE classes (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  developer_id TEXT REFERENCES developers(id) ON DELETE SET NULL,
  latest_version TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(id),
  presentation TEXT NOT NULL CHECK (presentation IN ('visual', 'none')),
  implementations INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX classes_category ON classes(category, name);
CREATE INDEX classes_by_implementations ON classes(implementations DESC, seq DESC);

CREATE TABLE class_versions (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  digest TEXT NOT NULL,
  descriptor TEXT NOT NULL CHECK (json_valid(descriptor)),
  published_at TEXT NOT NULL,
  PRIMARY KEY (class_id, version)
);

-- Uploaded images and thumbnails, by sha256 hex; the bytes are in R2 at images/<sha256>.
-- claimed_at is set when a published entry names the image; an image nobody names within a day of its latest upload
-- (last_upload_at, by any uploader) is removed.
CREATE TABLE images (
  digest TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('png', 'webp')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  last_upload_at TEXT NOT NULL,
  claimed_at TEXT
);
CREATE INDEX images_unclaimed ON images(last_upload_at) WHERE claimed_at IS NULL;

-- Every developer who uploaded an image's bytes, the first time; each may name the image in an entry.
CREATE TABLE image_uploaders (
  digest TEXT NOT NULL REFERENCES images(digest) ON DELETE CASCADE,
  developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (digest, developer_id)
) WITHOUT ROWID;
CREATE INDEX image_uploaders_developer ON image_uploaders(developer_id, uploaded_at);

-- Download links issued per version and day (UTC), for the 30-day count and trending.
CREATE TABLE downloads_daily (
  kind TEXT NOT NULL CHECK (kind IN ('recipe', 'component')),
  entry_id TEXT NOT NULL,
  version TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (kind, entry_id, version, day)
);
CREATE INDEX downloads_daily_day ON downloads_daily(day);

-- Who fetched a download link today, as a salted sha256 of the address: one download per address, version and day.
CREATE TABLE downloads_seen (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  version TEXT NOT NULL,
  visitor TEXT NOT NULL,
  PRIMARY KEY (day, kind, entry_id, version, visitor)
) WITHOUT ROWID;

-- The GitHub organisations a developer was an active member of at their last sign-in (a JSON array of lowercase
-- logins), read with the sign-in token's read:org scope. Class scopes are organisations.
CREATE TABLE developer_orgs (
  developer_id TEXT PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
  orgs TEXT NOT NULL CHECK (json_valid(orgs)),
  checked_at TEXT NOT NULL
);

-- Requests per key and minute, for rate limits.
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  minute TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (key, minute)
) WITHOUT ROWID;

-- Listing totals per kind and filter combination, kept for ten minutes (the hourly job removes older rows and keeps at
-- most 100,000).
CREATE TABLE listing_totals (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  approximate INTEGER NOT NULL,
  computed_at TEXT NOT NULL
);
CREATE INDEX listing_totals_computed ON listing_totals(computed_at);

-- Where a job that runs in chunks has got to: its pass (for example the day) and the last seq done.
CREATE TABLE job_progress (
  job TEXT PRIMARY KEY,
  pass TEXT NOT NULL,
  after INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);

-- Package URLs a version bundles or downloads (from its foundations upstream records), checked at OSV.
-- unqueryable: OSV refused the purl, so its advisories are unknown.
CREATE TABLE purls (
  purl TEXT PRIMARY KEY,
  checked_at TEXT,
  advisories TEXT NOT NULL DEFAULT '[]',
  unqueryable INTEGER NOT NULL DEFAULT 0
);

-- unresolved: the check gave up finding whether OSV can read this purl for this version (its requests ran out), so the
-- version's vulnerabilities are unknown; the purl itself is not marked, and other versions naming it are unaffected.
CREATE TABLE version_purls (
  kind TEXT NOT NULL CHECK (kind IN ('recipe', 'component')),
  entry_id TEXT NOT NULL,
  version TEXT NOT NULL,
  purl TEXT NOT NULL,
  unresolved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, entry_id, version, purl)
);
CREATE INDEX version_purls_purl ON version_purls(purl);

CREATE TABLE advisories (
  id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  severity TEXT,
  -- package name (as OSV names it) to the versions that fix it
  fixed TEXT NOT NULL DEFAULT '{}',
  modified TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
