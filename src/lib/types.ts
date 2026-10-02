export type Role = "player" | "helper" | "moderator" | "admin" | "owner";
export type RecordStatus = "pending" | "approved" | "rejected";

export interface Socials {
  social_telegram: string | null;
  social_discord: string | null;
  social_youtube: string | null;
  social_twitch: string | null;
}

export interface Profile extends Socials {
  id: string;
  username: string;
  country: string | null;
  bio: string | null;
  role: Role;
  banned: boolean;
  ban_reason: string | null;
  created_at: string;
}

export interface Level {
  id: number;
  name: string;
  creator: string;
  verifier: string;
  verifier_id: string | null;
  gd_id: number | null;
  video_url: string | null;
  position: number;
  created_at: string;
}

export interface ChangelogEntry {
  id: number;
  kind: "added" | "moved" | "removed";
  level_id: number | null;
  level_name: string;
  old_position: number | null;
  new_position: number | null;
  prev_name: string | null;
  next_name: string | null;
  created_at: string;
}

export interface RecordRow {
  id: number;
  level_id: number;
  player_id: string;
  video_url: string;
  note: string | null;
  status: RecordStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface LeaderboardRow {
  /** null for players without an account */
  id: string | null;
  username: string;
  country: string | null;
  points: number;
  completions: number;
  verifications: number;
  hardest_position: number;
  hardest_name: string;
  rank: number;
  registered: boolean;
}
