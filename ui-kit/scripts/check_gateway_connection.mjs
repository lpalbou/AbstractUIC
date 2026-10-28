#!/usr/bin/env node
/**
 * ui-primitives "shell" (backlog 0036): the behaviour of useGatewayConnection, the ONE
 * connection state machine every app's top-right cluster renders. No check drove it before.
 *
 * Driven through a minimal hook harness (the kit's checks have no DOM: the hook runs inside a
 * stand-in React dispatcher, effects run after each render, `fetch` is stubbed):
 * - probe ONCE at boot (GET api/connection/gateway); re-renders never re-probe; phase "loading"
 *   until the probe resolves; connected = ok && has_session;
 * - a thrown probe is UNKNOWN: phase stays "loading", no auto-open;
 * - blocking: a resolved disconnect opens the modal and onClose cannot dismiss it;
 * - dismissable: boot disconnect opens once, a dismissed episode stays dismissed on re-probe,
 *   a live session lost MID-USE does not auto-open (unless autoOpenMidSession), sign-out does;
 * - generation guard: a slow probe started before a sign-in never overwrites the sign-in;
 * - signOut: DELETE then a fresh probe; a failed DELETE is surfaced in signOutError (never
 *   silent) and signingOut returns to false.
 * Mutation-checked (see the PR): removing the generation guard, the probe-once ref or the
 * signOut error channel turns this red.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mountHook } from "./hook_harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const { useGatewayConnection, isGatewayConnected, GATEWAY_CONNECTION_PATH } = kit;
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
for (const [name, fn] of Object.entries({ useGatewayConnection, isGatewayConnected })) check(`export ${name}`, typeof fn === "function", typeof fn);
check("connection path", GATEWAY_CONNECTION_PATH === "api/connection/gateway", GATEWAY_CONNECTION_PATH);

// ------------------------------------------------------------------ fetch stub
const calls = [];
let respond = () => signedOut();
globalThis.fetch = async (path, init) => {
  const method = (init && init.method) || "GET";
  calls.push(`${method} ${path}`);
  const r = await respond(method, path);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};
const signedIn = (user = "alice") => ({ status: 200, body: { ok: true, gateway_url: "http://gw.local:8080", has_session: true, gateway: { ok: true, principal: { user_id: user, tenant_id: "default" } } } });
const signedOut = () => ({ status: 200, body: { ok: false, gateway_url: "http://gw.local:8080", has_session: false, gateway: { ok: false, error: "Gateway sign-in required" } } });
const reset = (fn) => {
  calls.length = 0;
  respond = fn;
};
const gets = () => calls.filter((c) => c.startsWith("GET ")).length;

// 1. Probe once; loading until resolved; connected = ok && has_session.
{
  reset(() => signedIn());
  const h = mountHook(useGatewayConnection, {});
  check("boot: loading until the probe resolves", h.current.phase === "loading" && h.current.connected === false, h.current.phase);
  await h.settle();
  check("boot: one GET of the connection route", calls.length === 1 && calls[0] === "GET api/connection/gateway", JSON.stringify(calls));
  check("boot: connected", h.current.phase === "connected" && h.current.connected === true && h.current.status?.gateway?.principal?.user_id === "alice", h.current.phase);
  check("boot: no modal over a live session", h.current.modalOpen === false);
  h.render();
  h.render();
  await h.settle();
  check("probe once: re-renders never re-probe", gets() === 1, JSON.stringify(calls));
  check("isGatewayConnected needs has_session", !isGatewayConnected({ ok: true, has_session: false, gateway_url: "" }) && isGatewayConnected({ ok: true, has_session: true, gateway_url: "" }));
}

// 2. A thrown probe is unknown: no auto-open, phase stays loading.
{
  reset(() => {
    throw new Error("app server down");
  });
  const h = mountHook(useGatewayConnection, { variant: "blocking" });
  await h.settle();
  check("thrown probe: phase stays loading", h.current.phase === "loading", h.current.phase);
  check("thrown probe: no auto-open (unknown is not a disconnect)", h.current.modalOpen === false);
}

// 3. Blocking: a resolved disconnect opens and cannot be dismissed.
{
  reset(() => signedOut());
  const h = mountHook(useGatewayConnection, { variant: "blocking" });
  await h.settle();
  check("blocking: boot disconnect opens the modal", h.current.phase === "disconnected" && h.current.modalOpen === true);
  check("blocking: modal is blocking while signed out", h.current.modalProps.blocking === true);
  h.current.modalProps.onClose();
  h.render();
  check("blocking: onClose cannot dismiss while signed out", h.current.modalOpen === true);
  // Sign-in through the modal: status delivery closes it.
  h.current.modalProps.onStatusChange(signedIn().body);
  h.render();
  check("blocking: sign-in success closes the modal", h.current.phase === "connected" && h.current.modalOpen === false && h.current.modalProps.blocking === false);
  // Mid-session loss under blocking: auto-opens.
  reset(() => signedOut());
  await h.current.refresh();
  h.render();
  check("blocking: a lost session re-opens the modal", h.current.phase === "disconnected" && h.current.modalOpen === true);
}

// 4. Dismissable: boot opens once; a dismissed episode stays dismissed; mid-session loss does not auto-open.
{
  reset(() => signedOut());
  const h = mountHook(useGatewayConnection, { variant: "dismissable" });
  await h.settle();
  check("dismissable: boot disconnect opens once", h.current.modalOpen === true && h.current.modalProps.blocking === false);
  h.current.modalProps.onClose();
  h.render();
  check("dismissable: the user can dismiss", h.current.modalOpen === false);
  await h.current.refresh();
  h.render();
  check("dismissable: a dismissed episode stays dismissed on re-probe", h.current.modalOpen === false);
  reset(() => signedIn());
  await h.current.refresh();
  h.render();
  check("dismissable: session back", h.current.phase === "connected");
  reset(() => signedOut());
  await h.current.refresh();
  h.render();
  check("dismissable: a session lost mid-use does not pop the modal", h.current.phase === "disconnected" && h.current.modalOpen === false);
  h.current.openModal();
  h.render();
  check("dismissable: explicit openModal always opens", h.current.modalOpen === true);
}
{
  reset(() => signedIn());
  const h = mountHook(useGatewayConnection, { variant: "dismissable", autoOpenMidSession: true });
  await h.settle();
  reset(() => signedOut());
  await h.current.refresh();
  h.render();
  check("autoOpenMidSession: a mid-use loss opens", h.current.modalOpen === true);
}

// 5. Generation guard: a slow probe started BEFORE a sign-in never lands after it.
{
  reset(() => signedOut());
  const h = mountHook(useGatewayConnection, { variant: "dismissable" });
  await h.settle();
  let release;
  reset(() => new Promise((resolve) => (release = () => resolve(signedOut()))));
  const slow = h.current.refresh();
  await new Promise((r) => setImmediate(r));
  h.current.modalProps.onStatusChange(signedIn("bob").body);
  h.render();
  release();
  await slow;
  h.render();
  check("generation guard: the stale probe is dropped", h.current.phase === "connected" && h.current.status?.gateway?.principal?.user_id === "bob", `${h.current.phase} ${JSON.stringify(h.current.status)}`);
}

// 6. signOut: DELETE + fresh probe; a failure is surfaced, never silent.
{
  reset(() => signedIn());
  const h = mountHook(useGatewayConnection, { variant: "dismissable" });
  await h.settle();
  reset((method) => (method === "DELETE" ? { status: 200, body: { ok: true } } : signedOut()));
  const p = h.current.signOut();
  h.render();
  check("signOut: in flight", h.current.signingOut === true);
  const done = await p;
  check("signOut: resolves true when the session is gone", done === true, String(done));
  h.render();
  check("signOut: DELETE then a fresh probe", calls[0] === "DELETE api/connection/gateway" && calls[1] === "GET api/connection/gateway", JSON.stringify(calls));
  check("signOut: signed out, no error, not in flight", h.current.phase === "disconnected" && h.current.signOutError === null && h.current.signingOut === false);
  check("signOut: a sign-out episode auto-opens (dismissable)", h.current.modalOpen === true);
}
{
  reset(() => signedIn());
  const h = mountHook(useGatewayConnection, {});
  await h.settle();
  reset((method) => (method === "DELETE" ? { status: 502, body: { detail: "gateway unreachable" } } : signedIn()));
  const failedDone = await h.current.signOut();
  h.render();
  check("signOut failure: resolves false (never rejects)", failedDone === false, String(failedDone));
  check("signOut failure: the error is surfaced", h.current.signOutError === "gateway unreachable", String(h.current.signOutError));
  check("signOut failure: the real state is re-probed (still connected)", h.current.phase === "connected" && h.current.signingOut === false);
  reset((method) => (method === "DELETE" ? { status: 200, body: { ok: true } } : signedOut()));
  await h.current.signOut();
  h.render();
  check("signOut: the next success clears the error", h.current.signOutError === null && h.current.phase === "disconnected");
}

// 7. The top bar reads the hook's return value directly (no re-derived phase).
{
  const { topBarConnection } = kit;
  reset(() => signedIn());
  const h = mountHook(useGatewayConnection, {});
  await h.settle();
  const order = [];
  const view = topBarConnection(h.current, () => order.push("host wipe"));
  check("top bar: hook phase + status", view.phase === "connected" && view.status === h.current.status);
  check("top bar: connect = openModal", view.connect === h.current.openModal);
  reset((method) => (method === "DELETE" ? (order.push("DELETE"), { status: 200, body: { ok: true } }) : signedOut()));
  await view.disconnect();
  check("top bar: Disconnect = hook signOut, THEN the host's onSignOut", JSON.stringify(order) === JSON.stringify(["DELETE", "host wipe"]), JSON.stringify(order));
  // A refused DELETE: the hook resolves false and the host's wipe does not run.
  reset(() => signedIn());
  const h2 = mountHook(useGatewayConnection, {});
  await h2.settle();
  order.length = 0;
  reset((method) => (method === "DELETE" ? (order.push("DELETE"), { status: 502, body: { detail: "down" } }) : signedIn()));
  await topBarConnection(h2.current, () => order.push("host wipe")).disconnect();
  check("top bar: a failed disconnect never runs onSignOut", JSON.stringify(order) === JSON.stringify(["DELETE"]), JSON.stringify(order));
}

// The status badge tells a gateway that did not answer from a rejected session
// (release-closing polish, 2026-10-28): "sign in again" over a down gateway sends
// the person to a form that cannot help.
{
  const { gatewayStatusBadge } = kit;
  const base = { ok: false, gateway_url: "http://127.0.0.1:18240", has_session: true };
  const down = gatewayStatusBadge({ ...base, gateway_status: 0, gateway: { detail: "connect ECONNREFUSED 127.0.0.1:18240" } });
  check("badge: gateway down says unreachable, names the host", down.tone === "err" && /^Gateway unreachable at 127\.0\.0\.1:18240/.test(down.label) && !/sign in/i.test(down.label), down.label);
  const err5 = gatewayStatusBadge({ ...base, gateway_status: 503, gateway: { detail: "busy" } });
  check("badge: a 5xx is a gateway error, not a rejected session", /HTTP 503/.test(err5.label) && !/sign in/i.test(err5.label), err5.label);
  const rejected = gatewayStatusBadge({ ...base, gateway_status: 401, gateway: { detail: "no session" } });
  check("badge: a 401 is a rejected session", rejected.label === "Session rejected — sign in again", rejected.label);
  const older = gatewayStatusBadge({ ...base, gateway: { detail: "no session" } });
  check("badge: an older app server (no gateway_status) keeps the rejected wording", older.label === "Session rejected — sign in again", older.label);
  const ok = gatewayStatusBadge({ ...base, ok: true, gateway_status: 200, gateway: { ok: true, principal: { user_id: "admin" } } });
  check("badge: signed in unchanged", ok.tone === "ok" && /Signed in as admin/.test(ok.label), ok.label);
}

console.log(`check_gateway_connection: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
