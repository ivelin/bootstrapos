/**
 * Thin Cos-set board watch. Agents call enable_board_watch after invite.
 * Founders never paste a URL. Do not log env values.
 */
import type { JourneyActor } from "./journey-auth.js";
import type { JourneyStore } from "./journey.js";
import { isHttpsWebhookUrl } from "./journey-notify.js";

export const BOARD_WATCH_URL_ENV = "BOOTSTRAP_BOARD_WATCH_URL";
export const BOARD_WATCH_PRINCIPAL_ENV = "BOOTSTRAP_BOARD_WATCH_PRINCIPAL";
export const BOARD_WATCH_PRINCIPAL_KIND_ENV = "BOOTSTRAP_BOARD_WATCH_PRINCIPAL_KIND";
export const BOARD_WATCH_UNSET = "board_watch_unset";

export type BoardWatchConfig = {
  url: string;
  principal: string;
  principalKind: "email" | "sub";
};

export type BoardWatchResolve =
  | { ok: true; config: BoardWatchConfig }
  | { ok: false; error: typeof BOARD_WATCH_UNSET };

function readTrimmed(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? "";
}

/** Fail closed. Never return or log the raw secret values. */
export function resolveBoardWatchConfig(
  env: NodeJS.ProcessEnv = process.env,
): BoardWatchResolve {
  const url = readTrimmed(env, BOARD_WATCH_URL_ENV);
  const principal = readTrimmed(env, BOARD_WATCH_PRINCIPAL_ENV);
  const kindRaw = readTrimmed(env, BOARD_WATCH_PRINCIPAL_KIND_ENV) || "email";
  if (!url || !principal) {
    return { ok: false, error: BOARD_WATCH_UNSET };
  }
  if (kindRaw !== "email" && kindRaw !== "sub") {
    return { ok: false, error: BOARD_WATCH_UNSET };
  }
  if (!isHttpsWebhookUrl(url)) {
    return { ok: false, error: BOARD_WATCH_UNSET };
  }
  return {
    ok: true,
    config: { url, principal, principalKind: kindRaw },
  };
}

export async function enableBoardWatch(
  store: Pick<JourneyStore, "subscribeBoard">,
  actor: JourneyActor,
  input: { companySlug: string; ideaSlug?: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const resolved = resolveBoardWatchConfig(env);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  return store.subscribeBoard(actor, {
    companySlug: input.companySlug,
    ideaSlug: input.ideaSlug,
    principal: resolved.config.principal,
    principalKind: resolved.config.principalKind,
    webhookUrl: resolved.config.url,
  });
}
