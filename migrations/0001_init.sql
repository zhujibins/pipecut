PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT 'round' CHECK (profile IN ('round', 'square', 'rect')),
  outer_diameter REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 0,
  height REAL NOT NULL DEFAULT 0,
  wall_thickness REAL NOT NULL,
  length REAL NOT NULL,
  grade TEXT NOT NULL,
  density REAL NOT NULL DEFAULT 7.85,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  length REAL NOT NULL CHECK (length > 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parts_material_id ON parts(material_id);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cut_method TEXT NOT NULL CHECK (cut_method IN ('laser', 'saw')),
  kerf_mm REAL NOT NULL,
  clamp_mm REAL NOT NULL,
  total_bars INTEGER NOT NULL,
  utilization REAL NOT NULL,
  part_weight_kg REAL NOT NULL,
  piece_count INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at DESC);
