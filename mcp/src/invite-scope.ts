/**
 * Company-scoped invite grants.
 * Tiers: viewer < commenter < editor. owner sits above editor and is not grantable.
 * An omitted tier is viewer. Editors grant viewer or commenter. Owners grant up to editor.
 */

export const BOARD_TIERS = ["viewer", "commenter", "editor"] as const;
export type BoardTier = (typeof BOARD_TIERS)[number];
export type AclRank = BoardTier | "owner";

const RANK: Record<AclRank, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

export type HeldBoard = {
  slug: string;
  rank: AclRank;
};

export type RequestedGrant = {
  slug: string;
  role?: string;
};

export type PlannedGrant = {
  slug: string;
  role: BoardTier;
};

export type DeniedGrant = {
  slug: string;
  reason: "not_held" | "tier_forbidden" | "invalid_label" | "owner_forbidden";
};

export type ScopePlan =
  | {
      ok: true;
      grants: PlannedGrant[];
      dropped: PlannedGrant[];
    }
  | { ok: false; reason: "already_member" }
  | {
      ok: false;
      reason: "invite_partial_authority";
      allowed: string[];
      denied: DeniedGrant[];
    };

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function legacyRank(role: string | undefined): AclRank | null {
  switch (role) {
    case "founder":
    case "owner":
      return "owner";
    case "founder_authorized":
    case "editor":
      return "editor";
    case "advisor":
    case "mentor":
    case "commenter":
      return "commenter";
    case "viewer":
      return "viewer";
    default:
      return null;
  }
}

export function aclRoleForTier(tier: BoardTier): "viewer" | "advisor" | "founder_authorized" {
  if (tier === "editor") return "founder_authorized";
  if (tier === "commenter") return "advisor";
  return "viewer";
}

export function tierLine(tier: BoardTier): string {
  if (tier === "editor") return "can edit bet cards";
  if (tier === "commenter") return "can read and comment on bet cards";
  return "can read bet cards";
}

function normalizeTier(raw: string | undefined): BoardTier | "owner" | "invalid" {
  if (raw === undefined || raw === "") return "viewer";
  if (raw === "viewer" || raw === "commenter" || raw === "editor") return raw;
  if (raw === "owner") return "owner";
  return "invalid";
}

function ceiling(rank: AclRank): BoardTier[] {
  if (rank === "owner") return ["viewer", "commenter", "editor"];
  if (rank === "editor") return ["viewer", "commenter"];
  return [];
}

export function planScopedInvite(input: {
  held: HeldBoard[];
  inviteeHeld: HeldBoard[];
  requested: RequestedGrant[];
}): ScopePlan {
  const heldBySlug = new Map(input.held.map((row) => [row.slug, row.rank]));
  const inviteeBySlug = new Map(input.inviteeHeld.map((row) => [row.slug, row.rank]));
  const seen = new Set<string>();
  const allowed: string[] = [];
  const denied: DeniedGrant[] = [];
  const grants: PlannedGrant[] = [];
  const dropped: PlannedGrant[] = [];

  for (const row of input.requested) {
    const slug = row.slug.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    if (!SLUG_RE.test(slug)) {
      denied.push({ slug: slug || row.slug, reason: "invalid_label" });
      continue;
    }
    const tier = normalizeTier(row.role);
    if (tier === "owner" || tier === "invalid") {
      denied.push({ slug, reason: "owner_forbidden" });
      continue;
    }
    const rank = heldBySlug.get(slug);
    if (!rank || !ceiling(rank).includes(tier)) {
      denied.push({ slug, reason: rank ? "tier_forbidden" : "not_held" });
      if (rank && ceiling(rank).length > 0) allowed.push(slug);
      continue;
    }
    allowed.push(slug);
    const current = inviteeBySlug.get(slug);
    if (current !== undefined && RANK[current] >= RANK[tier]) {
      dropped.push({ slug, role: tier });
      continue;
    }
    grants.push({ slug, role: tier });
  }

  if (denied.length > 0) {
    return { ok: false, reason: "invite_partial_authority", allowed, denied };
  }
  if (input.requested.length > 0 && grants.length === 0) {
    return { ok: false, reason: "already_member" };
  }
  return { ok: true, grants, dropped };
}
