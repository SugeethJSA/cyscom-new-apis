-- 017_leaderboard.sql

CREATE TABLE IF NOT EXISTS leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    act_num INT NOT NULL,
    points INT DEFAULT 0,
    rating INT DEFAULT 0,
    contributions TEXT DEFAULT '',
    UNIQUE(user_id, act_num)
);
