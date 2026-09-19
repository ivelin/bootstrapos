/**
 * Hosted 0-1 board: membership (company labels) is who can see a company.
 * Lazy-ensure company + default idea. Production persists via SECURITY DEFINER RPCs.
 * Preview never attaches. Tests inject this store.
 */
import { hostedProdIdentityAllowed } from "./identity.js";
import type { JourneyActor } from "./journey-auth.js";
import {
  parseWebhookDeliveries,
  postBoardWebhookDeliveries,
  type BoardNotifyEventType,
} from "./journey-notify.js";
import {
  MemoryJourneyStore,
  normalizeSlug,
  type GateDecision,
  type GateEnrichment,
  type JourneyStore,
  type KillPostmortem,
  type PortfolioScore,
  type Scoreboard,
} from "./journey.js";

function supabaseUrl(): string | undefined {
  return process.env.BOOTSTRAP_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

function supabaseAnonKey(): string | undefined {
  return (
    process.env.BOOTSTRAP_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

export class HostedMembershipJourneyStore implements JourneyStore {
  readonly kind = "memory" as const;
  private readonly inner = new MemoryJourneyStore([], [], [], [], []);

  constructor(private readonly labelsFor: (actor: JourneyActor) => string[]) {
    this.inner.allowMemberComments = true;
  }

  actorOnAllowlist(actor: JourneyActor): boolean {
    return Boolean(actor.authenticated && actor.principal && this.labelsFor(actor).length > 0);
  }

  private held(actor: JourneyActor, slug: string): boolean {
    return this.labelsFor(actor).includes(normalizeSlug(slug));
  }

  /** Invite-only: unauthenticated or a label the actor does not hold — never another company's rows. */
  private denyUnlessHeld(
    actor: JourneyActor,
    slug: string | undefined,
  ): { ok: false; error: string } | null {
    if (!actor.authenticated || !actor.principal) {
      return { ok: false, error: "unauthenticated" };
    }
    if (!slug) {
      return { ok: false, error: "company required" };
    }
    if (!this.held(actor, slug)) {
      return { ok: false, error: "company not visible" };
    }
    return null;
  }

  async getJourney(
    actor: JourneyActor,
    query: { companySlug?: string; ideaSlug?: string; expandMeetingDoc?: boolean },
  ): Promise<unknown> {
    const denied = this.denyUnlessHeld(actor, query.companySlug);
    if (denied) return denied;
    const slug = normalizeSlug(query.companySlug!);
    this.inner.ensureCompanyForMember(slug, actor);
    const result = (await this.inner.getJourney(actor, { ...query, companySlug: slug })) as {
      ok?: boolean;
      acl?: Array<{ principal: string; role: string }>;
      owners?: Array<{ principal: string; role: string }>;
    };
    if (result?.ok && Array.isArray(result.acl)) {
      result.owners = result.acl.map((row) => ({ principal: row.principal, role: row.role }));
    }
    return result;
  }

  async createIdea(
    actor: JourneyActor,
    input: Parameters<JourneyStore["createIdea"]>[1],
  ): Promise<unknown> {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.createIdea(actor, input);
  }

  async putJourney(
    actor: JourneyActor,
    input: Parameters<JourneyStore["putJourney"]>[1],
  ): Promise<unknown> {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.putJourney(actor, {
      ...input,
      ideaSlug: input.ideaSlug || "default",
    });
  }

  async postComment(
    actor: JourneyActor,
    input: Parameters<JourneyStore["postComment"]>[1],
  ): Promise<unknown> {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.postComment(actor, { ...input, ideaSlug: input.ideaSlug || "default" });
  }

  async changeAcl(actor: JourneyActor, input: Parameters<JourneyStore["changeAcl"]>[1]) {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.changeAcl(actor, input);
  }

  async subscribeBoard(actor: JourneyActor, input: Parameters<JourneyStore["subscribeBoard"]>[1]) {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.subscribeBoard(actor, input);
  }

  async unsubscribeBoard(
    actor: JourneyActor,
    input: Parameters<JourneyStore["unsubscribeBoard"]>[1],
  ) {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    return this.inner.unsubscribeBoard(actor, input);
  }

  async listSubscribers(
    actor: JourneyActor,
    input: Parameters<JourneyStore["listSubscribers"]>[1],
  ) {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.listSubscribers(actor, input);
  }

  async putPortfolioScore(
    actor: JourneyActor,
    input: Parameters<JourneyStore["putPortfolioScore"]>[1],
  ) {
    const denied = this.denyUnlessHeld(actor, input.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(input.companySlug, actor);
    return this.inner.putPortfolioScore(actor, {
      ...input,
      ideaSlug: input.ideaSlug || "default",
    });
  }

  async listProvenance(
    actor: JourneyActor,
    query: Parameters<JourneyStore["listProvenance"]>[1],
  ) {
    const denied = this.denyUnlessHeld(actor, query.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(query.companySlug, actor);
    return this.inner.listProvenance(actor, query);
  }

  async listKilledIdeas(
    actor: JourneyActor,
    query: Parameters<JourneyStore["listKilledIdeas"]>[1],
  ) {
    const denied = this.denyUnlessHeld(actor, query.companySlug);
    if (denied) return denied;
    this.inner.ensureCompanyForMember(query.companySlug, actor);
    return this.inner.listKilledIdeas(actor, query);
  }
}

export class SupabaseJourneyStore implements JourneyStore {
  readonly kind = "supabase" as const;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly accessToken: string,
  ) {}

  actorOnAllowlist(actor: JourneyActor): boolean {
    return Boolean(actor.authenticated && (actor.email || actor.sub));
  }

  private async rpc(name: string, body: Record<string, unknown>): Promise<{ raw: unknown } | { error: string }> {
    const base = this.url.replace(/\/+$/, "");
    const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let raw: unknown = text;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = text;
    }
    if (!res.ok) return { error: `journey_rpc_failed:${res.status}` };
    return { raw };
  }

  async getJourney(
    _actor: JourneyActor,
    query: { companySlug?: string; ideaSlug?: string; expandMeetingDoc?: boolean },
  ): Promise<unknown> {
    if (!query.companySlug) return { ok: false, error: "company required" };
    const hit = await this.rpc("bootstrap_os_get_journey", {
      p_company: query.companySlug,
      p_idea: query.ideaSlug ?? null,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async createIdea(
    _actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug: string;
      name?: string;
      founderYes: boolean;
      why?: string;
      client?: string;
    },
  ): Promise<unknown> {
    const hit = await this.rpc("bootstrap_os_create_idea", {
      p_company: input.companySlug,
      p_idea: input.ideaSlug,
      p_name: input.name ?? null,
      p_founder_yes: input.founderYes,
      p_why: input.why ?? null,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async putJourney(
    _actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      journeyPhase?: number;
      loopStage?: number;
      currentGate?: GateDecision;
      scoreboard?: Scoreboard;
      constraintThisWeek?: string;
      why: string;
      founderYes: boolean;
      founderWrittenDecision?: string;
      client?: string;
      gateEnrichment?: GateEnrichment;
      killPostmortem?: Omit<KillPostmortem, "why"> & { why?: string };
      portfolioScore?: PortfolioScore;
    },
  ): Promise<unknown> {
    const idea = input.ideaSlug ?? "default";
    const scoreboard = {
      ...(input.scoreboard ?? {}),
      ...(input.gateEnrichment ? { gateEnrichment: input.gateEnrichment } : {}),
      ...(input.killPostmortem
        ? { killPostmortem: { why: input.why, ...input.killPostmortem } }
        : {}),
      ...(input.portfolioScore ? { portfolioScore: input.portfolioScore } : {}),
    };
    const hit = await this.rpc("bootstrap_os_put_journey", {
      p_company: input.companySlug,
      p_idea: idea,
      p_journey_phase: input.journeyPhase ?? null,
      p_loop_stage: input.loopStage ?? null,
      p_current_gate: input.currentGate ?? null,
      p_constraint: input.constraintThisWeek ?? null,
      p_scoreboard: Object.keys(scoreboard).length ? scoreboard : null,
      p_why: input.why,
      p_founder_yes: input.founderYes,
      p_founder_written_decision: input.founderWrittenDecision ?? null,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    await this.fireWebhooksAfterWrite(hit.raw, {
      company: input.companySlug,
      idea,
      event: "put_journey",
    });
    return hit.raw;
  }

  async postComment(
    _actor: JourneyActor,
    input: { companySlug: string; ideaSlug?: string; body: string; client?: string },
  ): Promise<unknown> {
    const idea = input.ideaSlug ?? "default";
    const hit = await this.rpc("bootstrap_os_post_comment", {
      p_company: input.companySlug,
      p_idea: idea,
      p_body: input.body,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    await this.fireWebhooksAfterWrite(hit.raw, {
      company: input.companySlug,
      idea,
      event: "post_comment",
    });
    return hit.raw;
  }

  async changeAcl(
    _actor: JourneyActor,
    input: {
      companySlug: string;
      principal: string;
      principalKind: "email" | "sub";
      role: "founder" | "founder_authorized" | "advisor";
      op: "grant" | "revoke";
      client?: string;
    },
  ) {
    const hit = await this.rpc("bootstrap_os_change_acl", {
      p_company: input.companySlug,
      p_principal: input.principal,
      p_principal_kind: input.principalKind,
      p_role: input.role,
      p_op: input.op,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async subscribeBoard(
    _actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      principal: string;
      principalKind: "email" | "sub";
      webhookUrl: string;
      emailOptIn?: boolean;
    },
  ) {
    const hit = await this.rpc("bootstrap_os_subscribe_board", {
      p_company: input.companySlug,
      p_idea: input.ideaSlug ?? null,
      p_principal: input.principal,
      p_principal_kind: input.principalKind,
      p_webhook_url: input.webhookUrl,
      p_email_opt_in: Boolean(input.emailOptIn),
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async unsubscribeBoard(
    _actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      principal: string;
      principalKind: "email" | "sub";
    },
  ) {
    const hit = await this.rpc("bootstrap_os_unsubscribe_board", {
      p_company: input.companySlug,
      p_idea: input.ideaSlug ?? null,
      p_principal: input.principal,
      p_principal_kind: input.principalKind,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async listSubscribers(
    _actor: JourneyActor,
    input: { companySlug: string },
  ) {
    const hit = await this.rpc("bootstrap_os_list_subscribers", {
      p_company: input.companySlug,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async putPortfolioScore(
    _actor: JourneyActor,
    input: {
      companySlug: string;
      ideaSlug?: string;
      impact: number;
      evidence: number;
      leverage: number;
      why: string;
      founderYes: boolean;
      client?: string;
    },
  ) {
    const hit = await this.rpc("bootstrap_os_put_portfolio_score", {
      p_company: input.companySlug,
      p_idea: input.ideaSlug ?? "default",
      p_impact: input.impact,
      p_evidence: input.evidence,
      p_leverage: input.leverage,
      p_why: input.why,
      p_founder_yes: input.founderYes,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async listProvenance(
    _actor: JourneyActor,
    query: { companySlug: string; ideaSlug?: string; from?: string; to?: string },
  ) {
    const hit = await this.rpc("bootstrap_os_list_provenance", {
      p_company: query.companySlug,
      p_idea: query.ideaSlug ?? null,
      p_from: query.from ?? null,
      p_to: query.to ?? null,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  async listKilledIdeas(
    _actor: JourneyActor,
    query: { companySlug: string },
  ) {
    const hit = await this.rpc("bootstrap_os_list_killed_ideas", {
      p_company: query.companySlug,
    });
    if ("error" in hit) return { ok: false, error: hit.error };
    return hit.raw;
  }

  private async fireWebhooksAfterWrite(
    raw: unknown,
    query: { company: string; idea: string; event: BoardNotifyEventType },
  ): Promise<void> {
    try {
      let deliveries = parseWebhookDeliveries(raw);
      if (
        deliveries.length === 0 &&
        raw &&
        typeof raw === "object" &&
        (raw as { ok?: boolean }).ok === true
      ) {
        const extra = await this.rpc("bootstrap_os_list_webhook_deliveries_for_event", {
          p_company: query.company,
          p_idea: query.idea,
          p_event: query.event,
        });
        if (!("error" in extra)) {
          deliveries = parseWebhookDeliveries(extra.raw);
        }
      }
      await postBoardWebhookDeliveries(deliveries);
    } catch {
      // Delivery failure must not mutate board state.
    }
  }
}

export function createJourneyStore(accessToken?: string): JourneyStore | null {
  if (!hostedProdIdentityAllowed()) return null;
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key || !accessToken) return null;
  return new SupabaseJourneyStore(url, key, accessToken);
}
