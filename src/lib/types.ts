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
  /** e.g. "240", "CBF" */
  fps: string | null;
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
  /** bonus points from completed packs (already included in `points`) */
  pack_bonus: number;
  packs_completed: number;
}

export interface LevelSubmission {
  id: number;
  submitter_id: string;
  gd_id: number;
  /** e.g. "240", "CBF" */
  fps: string;
  name: string;
  creator: string;
  /** account that uploaded the level */
  publisher: string;
  verifier: string;
  video_url: string;
  /** player's opinion on where the level belongs */
  placement: string;
  telegram: string;
  status: RecordStatus;
  review_note: string | null;
  level_id: number | null;
  created_at: string;
  reviewed_at: string | null;
}

export type NotificationKind = "record_approved" | "record_rejected" | "level_approved" | "level_rejected" | "pack_completed" | "role_changed";

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** site path, e.g. "/level/12" */
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type StaffAction =
  | "record_approved" | "record_rejected" | "record_deleted" | "record_revoked"
  | "level_added" | "level_moved" | "level_removed" | "level_edited"
  | "submission_approved" | "submission_rejected" | "submission_deleted"
  | "pack_created" | "pack_edited" | "pack_deleted"
  | "role_changed" | "user_banned" | "user_unbanned" | "password_reset"
  | "rules_updated";

export interface StaffLogEntry {
  id: number;
  actor_id: string | null;
  /** "System" for changes made directly in the database */
  actor_name: string;
  action: StaffAction;
  target_id: string | null;
  target_name: string | null;
  level_id: number | null;
  level_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
