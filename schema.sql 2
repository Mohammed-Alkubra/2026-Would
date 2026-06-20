CREATE TABLE IF NOT EXISTS participants (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'PLAYER', active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS teams (
  id BIGINT PRIMARY KEY, external_id BIGINT UNIQUE, name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL, code TEXT NOT NULL, flag TEXT NOT NULL DEFAULT '⚽', group_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS fixtures (
  id BIGSERIAL PRIMARY KEY, external_id BIGINT NOT NULL UNIQUE,
  home_team_id BIGINT NOT NULL REFERENCES teams(id), away_team_id BIGINT NOT NULL REFERENCES teams(id),
  stage TEXT NOT NULL, group_name TEXT, venue TEXT, kickoff_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED', home_score INTEGER, away_score INTEGER,
  qualified_team_id BIGINT REFERENCES teams(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS predictions (
  id BIGSERIAL PRIMARY KEY, participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL, away_score INTEGER NOT NULL, qualified_team_id BIGINT REFERENCES teams(id),
  points INTEGER NOT NULL DEFAULT 0, distance INTEGER, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id, fixture_id)
);
CREATE TABLE IF NOT EXISTS stage_picks (
  id BIGSERIAL PRIMARY KEY, participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  stage TEXT NOT NULL, team_id BIGINT NOT NULL REFERENCES teams(id), points INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(participant_id, stage, team_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, actor_id BIGINT REFERENCES participants(id), action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO participants(name,code_hash,role) VALUES
('محمد','158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab','PLAYER'),
('المدير','ba79e8a64b1b62b6ec8f0211c35e3014965540899ced32251e801e2ec89ba021','ADMIN')
ON CONFLICT(code_hash) DO NOTHING;
INSERT INTO teams(id,external_id,name_ar,name_en,code,flag,group_name) VALUES
(1,1,'الأرجنتين','Argentina','ARG','🇦🇷','J'),(2,2,'فرنسا','France','FRA','🇫🇷','I'),
(3,3,'إنجلترا','England','ENG','🏴','L'),(4,4,'البرازيل','Brazil','BRA','🇧🇷','C'),
(5,5,'إسبانيا','Spain','ESP','🇪🇸','H'),(6,6,'البرتغال','Portugal','POR','🇵🇹','K'),
(7,7,'ألمانيا','Germany','GER','🇩🇪','E'),(8,8,'هولندا','Netherlands','NED','🇳🇱','F'),
(9,9,'المغرب','Morocco','MAR','🇲🇦','C'),(10,10,'السعودية','Saudi Arabia','KSA','🇸🇦','H'),
(11,11,'المكسيك','Mexico','MEX','🇲🇽','A'),(12,12,'اليابان','Japan','JPN','🇯🇵','F'),
(13,13,'كرواتيا','Croatia','CRO','🇭🇷','L'),(14,14,'بلجيكا','Belgium','BEL','🇧🇪','G'),
(15,15,'أوروغواي','Uruguay','URU','🇺🇾','H'),(16,16,'كولومبيا','Colombia','COL','🇨🇴','K')
ON CONFLICT(id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('participants','id'), COALESCE(MAX(id),1)) FROM participants;
INSERT INTO fixtures(id,external_id,home_team_id,away_team_id,stage,group_name,venue,kickoff_at) VALUES
(1,900001,3,13,'Group Stage','L','دالاس','2026-06-24T19:00:00Z'),
(2,900002,6,14,'Group Stage','K','هيوستن','2026-06-24T22:00:00Z'),
(3,900003,1,10,'Group Stage','J','ميامي','2026-06-25T19:00:00Z'),
(4,900004,4,9,'Group Stage','C','نيويورك','2026-06-25T22:00:00Z')
ON CONFLICT(id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('fixtures','id'), COALESCE(MAX(id),1)) FROM fixtures;
