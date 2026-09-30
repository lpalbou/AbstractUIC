#!/usr/bin/env node
/**
 * Sign-in card, form layout, card, tabs and the type-scale guard (ui-kit 0.3.3,
 * DESIGN §3/§4, docs/state-toggles.md).
 *
 * 1. af-gateway-signin block: one column (no label column), labels above at
 *    body size weight 500, max 480px centred, one pill style (neutral/ok/warn),
 *    Show/Hide INSIDE the token field, plain body-size checkbox, submit row
 *    with the primary right-aligned, the quiet link (+ busy + cooldown), the
 *    code step, inline messages at body size, [hidden] honoured, 44px touch.
 * 2. React sign-in card: no "Browser session" pseudo-label, default single
 *    pill "Not signed in" (neutral) with no duplicate caption; the connect
 *    modal passes no "token: ..." caption.
 * 3. af-form / af-card / af-tabs CSS; AfTabs markup + afTabsNextIndex keys.
 * 4. checkLabelScale flags > 15px / > 600 and passes the body scale; the kit's
 *    own label rules stay inside the scale.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const kit = await import(join(root, "dist", "index.js"));
const { GatewaySessionSignInCard, AfTabs, afTabsNextIndex, checkLabelScale, LABEL_SCALE_SELECTOR } = kit;

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

// Comments dropped; section markers kept as bare "/* name:begin */" lines.
const css = readFileSync(join(root, "src", "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => {
  const m = c.match(/^\/\*\s*([a-z-]+):(begin|end)/);
  return m ? `/* ${m[1]}:${m[2]} */\n` : "";
});
const section = (name) => ((css.match(new RegExp(`/\\* ${name}:begin \\*/[\\s\\S]*?/\\* ${name}:end \\*/`)) || [""])[0]).replace(/\/\*[^*]*\*\//g, "");
// Top-level rules only (media/container blocks removed), then every at-block by prelude.
const topLevel = (block) => block.replace(/@(media|container|supports|keyframes)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const atBlocks = (block, prelude) => {
  const out = [];
  let i = block.indexOf(prelude);
  while (i >= 0) {
    let j = block.indexOf("{", i) + 1;
    let depth = 1;
    const start = j;
    while (depth && j < block.length) {
      if (block[j] === "{") depth += 1;
      else if (block[j] === "}") depth -= 1;
      j += 1;
    }
    out.push(block.slice(start, j - 1));
    i = block.indexOf(prelude, j);
  }
  return out.join("\n");
};
const resolve = (block, sel) => {
  const decls = {};
  for (const r of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!r[1].split(",").map((x) => x.trim()).includes(sel)) continue;
    for (const d of r[2].matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) decls[d[1]] = d[2].trim();
  }
  return decls;
};

// 1) sign-in block
const si = section("af-gateway-signin");
check("theme.css has one af-gateway-signin:begin/end block", si.length > 0 && css.split("af-gateway-signin:begin").length === 2);
const siTop = topLevel(si);
const card = resolve(siTop, ".af-gateway-signin");
check("card max 480px, centred", card.width === "min(480px, 100%)" && card["margin-inline"] === "auto", JSON.stringify(card));
const form = resolve(siTop, ".af-gateway-signin__form");
check("form is ONE column (flex column, no label grid column)", form.display === "flex" && form["flex-direction"] === "column" && !("grid-template-columns" in form), JSON.stringify(form));
check("no two-column sign-in grid anywhere in the kit", !/\.af-gateway-signin__form\s*\{[^}]*grid-template-columns:\s*\d+px/.test(css));
const label = resolve(siTop, ".af-gateway-signin__label");
check("labels at body size, weight 500, not uppercase", label["font-size"] === "var(--font-size-base)" && label["font-weight"] === "500" && label["text-transform"] === "none", JSON.stringify(label));
const tokenBtn = resolve(siTop, ".af-gateway-signin .af-gateway-signin__token-input > button");
check("Show/Hide sits INSIDE the token field (absolute, right)", tokenBtn.position === "absolute" && /^\d+px$/.test(tokenBtn.right || "") && resolve(siTop, ".af-gateway-signin__token-input").position === "relative", JSON.stringify(tokenBtn));
check("token input leaves room for the button", /padding-right:\s*\d+px/.test(`padding-right: ${resolve(siTop, ".af-gateway-signin__token-input input")["padding-right"]};`));
const cb = resolve(siTop, ".af-gateway-signin__checkbox");
check("checkbox row is plain body size (weight 400)", cb["font-size"] === "var(--font-size-base)" && cb["font-weight"] === "400", JSON.stringify(cb));
const sr = resolve(siTop, ".af-gateway-signin__submit-row");
check("submit row: checkbox left, primary right", sr.display === "flex" && sr["justify-content"] === "space-between" && resolve(siTop, ".af-gateway-signin__submit-row > .af-gateway-signin__primary")["margin-left"] === "auto", JSON.stringify(sr));
for (const tone of ["neutral", "ok", "warn"]) check(`status pill tone ${tone}`, Object.keys(resolve(siTop, `.af-gateway-signin__status--${tone}`)).length > 0);
const pill = resolve(siTop, ".af-gateway-signin__status");
check("pill weight <= 600", Number(pill["font-weight"]) <= 600, pill["font-weight"]);
const link = resolve(siTop, ".af-gateway-signin .af-gateway-signin__link");
check("quiet link: transparent, underlined, body size, weight 400", link.background === "transparent" && link["text-decoration"] === "underline" && link["font-size"] === "var(--font-size-base)" && link["font-weight"] === "400", JSON.stringify(link));
const busy = resolve(siTop, '.af-gateway-signin .af-gateway-signin__link[aria-busy="true"]');
check("link busy state (aria-busy): progress cursor, spinner", busy.cursor === "progress" && /animation:\s*af-signin-spin/.test(`animation: ${resolve(siTop, '.af-gateway-signin .af-gateway-signin__link[aria-busy="true"]::after').animation};`), JSON.stringify(busy));
const cool = resolve(siTop, ".af-gateway-signin .af-gateway-signin__link:disabled");
check("link cooldown (disabled): muted, no underline, not-allowed", cool.color === "var(--text-muted)" && cool["text-decoration"] === "none" && cool.cursor === "not-allowed", JSON.stringify(cool));
check("code step block + actions row + back link", resolve(siTop, ".af-gateway-signin__code").display === "flex" && resolve(siTop, ".af-gateway-signin__code-actions").display === "flex" && Object.keys(resolve(siTop, ".af-gateway-signin .af-gateway-signin__back")).length > 0);
const msg = resolve(siTop, ".af-gateway-signin .af-gateway-signin__message");
check("messages at body size, weight 400 (scoped so they beat `.af-gateway-signin p`)", msg["font-size"] === "var(--font-size-base)" && msg["font-weight"] === "400", JSON.stringify(msg));
check("ok message is plain text, not green", resolve(siTop, ".af-gateway-signin .af-gateway-signin__message--ok").color === "var(--text-primary)");
check("field error in the error colour", resolve(siTop, ".af-gateway-signin .af-gateway-signin__field-error").color === "var(--error)");
check("[hidden] steps stay hidden", /\.af-gateway-signin \[hidden\]\s*\{\s*display:\s*none !important/.test(si));
const siCoarse = atBlocks(si, "@media (pointer: coarse)");
check("touch: links are 44px rows", resolve(siCoarse, ".af-gateway-signin .af-gateway-signin__link")["min-height"] === "var(--tap-min)");
check("touch: Show/Hide is 44px both axes", resolve(siCoarse, ".af-gateway-signin .af-gateway-signin__token-input > button")["min-height"] === "var(--tap-min)" && resolve(siCoarse, ".af-gateway-signin .af-gateway-signin__token-input > button")["min-width"] === "var(--tap-min)");
check("reduced motion stops the busy spinner", /animation:\s*none/.test(atBlocks(si, "@media (prefers-reduced-motion: reduce)")));

// 2) React card + modal
const cardHtml = renderToStaticMarkup(
  React.createElement(GatewaySessionSignInCard, { userId: "admin", onUserIdChange() {}, token: "", onTokenChange() {}, onSubmit() {} }),
);
check("React card: no 'Browser session' pseudo-label", !cardHtml.includes("Browser session"), cardHtml);
check("React card: default ONE neutral pill 'Not signed in'", /af-gateway-signin__status af-gateway-signin__status--neutral">Not signed in</.test(cardHtml), cardHtml.slice(0, 600));
check("React card: no duplicate source caption by default", !cardHtml.includes("af-gateway-signin__source"));
check("React card: the caption is never rendered even when an app passes tokenSourceLabel", !renderToStaticMarkup(React.createElement(GatewaySessionSignInCard, { userId: "admin", onUserIdChange() {}, token: "", onTokenChange() {}, onSubmit() {}, tokenSourceLabel: "token: missing" })).includes("af-gateway-signin__source"));
check("sign-in card: the hero mark is hidden on cards narrower than 480px", /@container af-signin \(max-width: 479\.98px\)\s*\{\s*\.af-gateway-signin__mark\s*\{\s*display: none;/.test(css));
check("React card: remember checkbox kept", cardHtml.includes("Remember this browser"));
const modalSrc = readFileSync(join(root, "src", "gateway_connect_modal.tsx"), "utf8");
check("connect modal: no 'token: ...' caption beside the pill", !/tokenSourceLabel=/.test(modalSrc));

// 3) form / card / tabs
const fm = section("af-form");
check("theme.css has one af-form:begin/end block", fm.length > 0 && css.split("af-form:begin").length === 2);
const fmTop = topLevel(fm);
check("af-form max width = --form-max (720px)", resolve(fmTop, ".af-form")["max-width"] === "var(--form-max, 720px)");
check("af-form__grid-2: two columns by default", resolve(fmTop, ".af-form__grid-2")["grid-template-columns"] === "repeat(2, minmax(0, 1fr))");
check("af-form__grid-2: one column below 768px", resolve(atBlocks(fm, "@media (max-width: 767.98px)"), ".af-form__grid-2")["grid-template-columns"] === "minmax(0, 1fr)");
const fl = resolve(fmTop, ".af-form__label");
check("af-form__label: body size, 500", fl["font-size"] === "var(--font-size-base)" && fl["font-weight"] === "500", JSON.stringify(fl));
check("af-form__field stacks label above field", resolve(fmTop, ".af-form__field")["flex-direction"] === "column");
const help = resolve(fmTop, ".af-form__help");
check("af-form__help: small + muted", help["font-size"] === "var(--font-size-sm)" && help.color === "var(--text-muted)", JSON.stringify(help));
check("inputs never wider than the card", resolve(fmTop, ".af-form textarea")["max-width"] === "100%" && resolve(fmTop, ".af-form select")["min-width"] === "0");
check("af-card + heading", resolve(fmTop, ".af-card").display === "flex" && resolve(fmTop, ".af-card__title")["font-weight"] === "600");
check("selected tab: accent underline, weight 600", resolve(fmTop, '.af-tabs__tab[aria-selected="true"]')["border-bottom-color"] === "var(--accent)" && resolve(fmTop, '.af-tabs__tab[aria-selected="true"]')["font-weight"] === "600");
check("tabs 44px on touch", resolve(atBlocks(fm, "@media (pointer: coarse)"), ".af-tabs__tab")["min-height"] === "var(--tap-min)");
check("tabs: reduced motion drops the transition", resolve(atBlocks(fm, "@media (prefers-reduced-motion: reduce)"), ".af-tabs__tab").transition === "none");

const tabs = [{ id: "google", label: "Google" }, { id: "microsoft", label: "Microsoft", unavailableReason: "No Microsoft sign-in client on this gateway." }, { id: "other", label: "Other" }];
const th = renderToStaticMarkup(React.createElement(AfTabs, { tabs, value: "other", onChange() {}, ariaLabel: "Mailbox provider", idBase: "mb" }, React.createElement("p", null, "panel")));
check("tablist with an accessible name", th.includes('role="tablist" aria-label="Mailbox provider"'), th);
check("three role=tab buttons", (th.match(/role="tab"/g) || []).length === 3);
check("selected tab: aria-selected=true + tabindex 0; others -1", /id="mb-tab-other" class="af-tabs__tab" aria-selected="true"[^>]*tabindex="0"/.test(th) && /id="mb-tab-google" class="af-tabs__tab" aria-selected="false"[^>]*tabindex="-1"/.test(th), th);
check("unavailable tab: aria-disabled + reason title", /id="mb-tab-microsoft"[^>]*aria-disabled="true"[^>]*title="No Microsoft sign-in client on this gateway."/.test(th), th);
check("tabpanel labelled by the selected tab", th.includes('role="tabpanel" id="mb-panel" aria-labelledby="mb-tab-other" tabindex="0"') && th.includes("<p>panel</p>"), th);
check("ArrowRight wraps and skips unavailable", afTabsNextIndex(tabs, 2, "ArrowRight") === 0 && afTabsNextIndex(tabs, 0, "ArrowRight") === 2);
check("ArrowLeft skips unavailable", afTabsNextIndex(tabs, 2, "ArrowLeft") === 0 && afTabsNextIndex(tabs, 0, "ArrowLeft") === 2);
check("Home/End", afTabsNextIndex(tabs, 2, "Home") === 0 && afTabsNextIndex(tabs, 0, "End") === 2);
check("other keys are not tab keys", afTabsNextIndex(tabs, 0, "a") === null && afTabsNextIndex([], 0, "ArrowRight") === null);
{
  const calls = [];
  const el = AfTabs({ tabs, value: "google", onChange: (id) => calls.push(id), ariaLabel: "x", idBase: "k" });
  const list = el.props.children[0];
  let prevented = 0;
  list.props.onKeyDown({ key: "ArrowRight", target: { id: "k-tab-google" }, preventDefault() { prevented += 1; } });
  list.props.onKeyDown({ key: "x", target: { id: "k-tab-google" }, preventDefault() { prevented += 1; } });
  const microsoftTab = list.props.children[1];
  microsoftTab.props.onClick();
  check("keyboard selects the next available tab; clicks on an unavailable tab are ignored", JSON.stringify(calls) === '["other"]' && prevented === 1, JSON.stringify(calls));
}

// 4) checkLabelScale
const el = (cls, fontSize, fontWeight, rendered = true) => ({ tagName: "LABEL", getAttribute: () => cls, textContent: cls, getClientRects: () => (rendered ? [1] : []), _s: { fontSize, fontWeight } });
const els = [el("ok", "14px", "500"), el("big", "20px", "500"), el("heavy", "14px", "700"), el("boldword", "14px", "bold"), el("hidden-big", "22px", "400", false), el("edge", "15px", "600")];
let seenSelector = "";
const fakeRoot = { querySelectorAll: (sel) => ((seenSelector = sel), els) };
const hits = checkLabelScale(fakeRoot, { getComputedStyle: (e) => e._s });
check("checkLabelScale flags > 15px and > 600 (incl. 'bold')", JSON.stringify(hits.map((h) => h.text)) === '["big","heavy","boldword"]', JSON.stringify(hits.map((h) => h.text)));
check("checkLabelScale reports size + weight + selector", hits[0].fontSize === 20 && hits[1].fontWeight === 700 && hits[0].selector === "label.big");
check("checkLabelScale default selector covers labels, switch labels and captions", ["label", ".af-switch__label", ".af-form__label", ".af-gateway-signin__label", ".af-gateway-signin__checkbox"].every((s) => seenSelector.split(", ").includes(s)) && seenSelector === LABEL_SCALE_SELECTOR);
check("includeHidden checks unrendered elements too", checkLabelScale(fakeRoot, { getComputedStyle: (e) => e._s, includeHidden: true }).length === 4);
// The kit's own label rules stay inside the scale (static: no px sizes above 15, no weight above 600).
for (const sel of [".af-gateway-signin__label", ".af-gateway-signin__checkbox", ".af-form__label", ".af-switch__label", '.af-switch[aria-checked="true"] .af-switch__label', ".af-switch"]) {
  const d = resolve(topLevel(css), sel);
  const w = Number(d["font-weight"] || 0);
  const size = d["font-size"] || "";
  check(`kit rule ${sel} inside the label scale`, w <= 600 && !/var\(--font-size-(lg|xl|2xl)\)|^(1[6-9]|[2-9]\d)px/.test(size), JSON.stringify(d));
}

if (failures) {
  console.error(`check_forms_signin: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_forms_signin: ${checks} checks green`);
