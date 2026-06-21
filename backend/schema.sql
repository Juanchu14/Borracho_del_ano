-- Esquema de base de datos para "Borracho del año"
-- Ejecutar con: psql -U borracho_app -d borracho_del_ano -f schema.sql

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    username      VARCHAR(30)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leagues (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    description  VARCHAR(500),
    invite_code  VARCHAR(20)  NOT NULL UNIQUE,
    creator_id   INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS league_members (
    id         SERIAL PRIMARY KEY,
    league_id  INTEGER     NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, user_id)
);

CREATE TABLE IF NOT EXISTS scoring_items (
    id          SERIAL PRIMARY KEY,
    league_id   INTEGER      NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name        VARCHAR(60)  NOT NULL,
    emoji       VARCHAR(10)  NOT NULL,
    points      INTEGER      NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, name)
);

CREATE TABLE IF NOT EXISTS entries (
    id               SERIAL PRIMARY KEY,
    league_id        INTEGER     NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id          INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scoring_item_id  INTEGER     NOT NULL REFERENCES scoring_items(id) ON DELETE CASCADE,
    quantity         INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_league ON entries(league_id);
CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_user ON league_members(user_id);
