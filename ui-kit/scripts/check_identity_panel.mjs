#!/usr/bin/env node
/**
 * IdentityPanel (identity_panel.tsx): an entity's look and voice, one Save (framework ADR 0052).
 *
 * Pins, over the built dist with the no-DOM voice harness (real hooks, handlers called directly):
 *  - the pure rules: the form of a record, what Save sends (the whole record; the voice's model when
 *    the choice came without one; speed/quality kept for the same voice), "changed", the history
 *    rows, the designs offered (only those the Watch draws), engines and models from the catalog;
 *  - the flow: look -> engine -> voice (choosing plays a sample) -> one Save with the exact body;
 *    a refusal is the gateway's sentence, never retried, with its Download; "Create a new voice"
 *    selects the new voice and reads the list again; a record without a voice shows the gateway's
 *    sentence and Save waits; a viewer who may not change it reads the look and voice and the reason;
 *  - plain words: no "profile", "provider", "Gateway default", "Custom" or "revision" on the panel.
 * Mutation-checked: dropping the model fallback, the speed/quality keep, the Download button, the
 * no-voice sentence or the sample call turns this red.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
const { mount, find, findAll, byAria, byData, text, sleep } = await import("./voice_harness.mjs");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const {
  IdentityPanel,
  identityFormOf,
  identityFormChanged,
  identitySaveOf,
  identityDesignOptions,
  identityEngines,
  identityModels,
  identityHistoryRevs,
  identityHistoryRows,
  identityByWhom,
} = kit;
for (const [n, f] of Object.entries({ IdentityPanel, identityFormOf, identityFormChanged, identitySaveOf, identityDesignOptions, identityEngines, identityModels, identityHistoryRevs, identityHistoryRows, identityByWhom }))
  check(`export ${n}`, typeof f === "function", typeof f);

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy", source: "chosen" };
const rec = (rev, over = {}) => ({ rev, avatar: { style: "watch-lotus", color: "#3366cc", source: "chosen", watch_code: "R" }, voice: { ...VOICE }, set_at: `2026-11-0${rev}T10:00:00+00:00`, set_by: "person:laurent", ...over });

// --- the pure rules -------------------------------------------------------------------------------
{
  const form = identityFormOf(rec(3));
  check("form of a record", eq(form, { style: "watch-lotus", color: "#3366cc", voice: { provider: "openai", model: "tts-1", voice: "alloy" } }), form);
  check("an unchanged form has nothing to save", identityFormChanged(form, rec(3)) === false);
  const next = { ...form, style: "watch-halo", color: "#AA00FF" };
  check("a new look is a change", identityFormChanged(next, rec(3)) === true);
  check("Save sends the whole record, colour lower-case", eq(identitySaveOf(next, rec(3)), { body: { avatar: { style: "watch-halo", color: "#aa00ff" }, voice: { provider: "openai", model: "tts-1", voice: "alloy" } } }), identitySaveOf(next, rec(3)));
  const r2 = rec(2, { voice: { ...VOICE, speed: 1.25, quality_preset: "high" } });
  check("the same voice keeps its speed and quality", eq(identitySaveOf(identityFormOf(r2), r2).body.voice, { provider: "openai", model: "tts-1", voice: "alloy", speed: 1.25, quality_preset: "high" }));
  const other = { ...identityFormOf(r2), voice: { provider: "openai", model: "tts-1", voice: "nova" } };
  check("another voice drops them", eq(identitySaveOf(other, r2).body.voice, { provider: "openai", model: "tts-1", voice: "nova" }));
  const noModel = { ...form, voice: { provider: "qwen3-tts", model: "", voice: "v-1" } };
  check("a voice without its model takes the engine's first model", identitySaveOf(noModel, rec(1), { models: ["qwen-a", "qwen-b"] }).body?.voice.model === "qwen-a");
  check("a clone takes the model it is bound to", identitySaveOf(noModel, rec(1), { models: ["qwen-a"], boundModel: "qwen-base" }).body?.voice.model === "qwen-base");
  check("no model anywhere: a plain sentence, nothing sent", eq(identitySaveOf(noModel, rec(1), { models: [] }), { error: "Not saved: qwen3-tts lists no speech model for this voice." }));
  check("no voice: nothing to save", identitySaveOf({ ...form, voice: {} }, rec(1)) === null && identitySaveOf({ ...form, voice: { provider: "openai" } }, rec(1)) === null);
  check("a profile id is saved as the voice", identitySaveOf({ ...form, voice: { provider: "kokoro", model: "k1", profile: "af_bella" } }, rec(1)).body?.voice.voice === "af_bella");

  check("history newest first", eq(identityHistoryRevs(3), [3, 2, 1]));
  const rows = identityHistoryRows([rec(1, { set_by: "default", voice: null, avatar: { style: "watch-nebula", color: "#d06439" } }), rec(2), rec(3, { voice: { ...VOICE, voice: "nova" } })]);
  check("history rows say what changed", eq(rows.map((r) => [r.rev, r.change, r.by]), [[3, "New voice", "laurent"], [2, "New look and voice", "laurent"], [1, "Default look, no voice", "the gateway"]]), rows.map((r) => [r.rev, r.change, r.by]));
  check("who set it, in words", identityByWhom("operator") === "the operator" && identityByWhom("person:ana") === "ana");

  const designs = [
    { id: "watch-halo", name: "Watch Halo", family: "watch", watchCode: "H" },
    { id: "woven", name: "Woven orb", family: "orb", watchCode: "" },
  ];
  const opts = identityDesignOptions(designs, "watch-lotus");
  check("only designs the Watch draws, the current one kept", eq(opts.map((o) => o.value), ["watch-lotus", "watch-halo"]), opts);
  check("engines from the catalog", eq(identityEngines({ tts_providers: ["openai", "qwen3-tts", "openai"] }), ["openai", "qwen3-tts"]));
  check(
    "models with the cloning role in words",
    eq(identityModels({ tts_models_by_provider: { q: ["a", "b"] }, tts_model_details_by_provider: { q: [{ id: "b", role: "cloning" }] } }, "q"), [{ id: "a", label: "a" }, { id: "b", label: "b (clones)" }]),
  );
}

// --- the flow ---------------------------------------------------------------------------------------
const DESIGNS = [
  { id: "watch-lotus", name: "Watch Lotus", family: "watch", watchCode: "R", description: "", gaze: "none" },
  { id: "watch-halo", name: "Watch Halo", family: "watch", watchCode: "H", description: "", gaze: "none" },
];
const NO_VOICE = "Castor has no voice yet: choose one in its Identity settings or set the Gateway default voice";
const MISSING = "The voice model kokoro-big (330 MB) is not downloaded on this computer yet. Download it first (Models page)";
function catalogFor(provider, model, created) {
  if (!provider) return { tts_providers: ["openai", "qwen3-tts"] };
  if (provider === "openai") return { tts_models_by_provider: { openai: ["tts-1"] }, items: ["alloy", "nova"].map((id) => ({ id, provider: "openai", model: "tts-1", label: id[0].toUpperCase() + id.slice(1) })) };
  const items = [{ id: "vivian", provider: "qwen3-tts", label: "Vivian", language: "en" }];
  if (created) items.push({ id: "v-new", provider: "qwen3-tts", label: "My voice", kind: "clone", model: "Qwen-Base", tags: { model_id: "Qwen-Base" } });
  return { tts_models_by_provider: { "qwen3-tts": ["Qwen-Custom", "Qwen-Base"] }, items };
}
function makeClient(current, opts = {}) {
  const log = { read: [], save: [], catalog: [], preview: [], download: [], design: [] };
  let created = false;
  const client = {
    async read(rev) {
      log.read.push(rev ?? null);
      return rev ? rec(rev) : current;
    },
    async save(body) {
      log.save.push(body);
      if (opts.refuse) throw Object.assign(new Error(MISSING), { download: { method: "POST", path: "/models/download", body: { artifact: "kokoro-big" }, size_mb: 330 } });
      return { ...current, rev: current.rev + 1, avatar: { ...body.avatar }, voice: { ...body.voice }, set_by: "person:laurent" };
    },
    async voiceCatalog(provider, model) {
      log.catalog.push([provider ?? null, model ?? null]);
      return catalogFor(provider, model, created);
    },
    async noVoiceNote() {
      return NO_VOICE;
    },
    async previewVoice(prefs) {
      log.preview.push(prefs);
      return new ArrayBuffer(8);
    },
    createVoice: {
      async design(request) {
        log.design.push(request);
        created = true;
        return { voice_id: "v-new", name: "My voice", engine: "qwen3-tts" };
      },
    },
    async startDownload(action) {
      log.download.push(action);
    },
    async designs() {
      return DESIGNS;
    },
  };
  return { client, log };
}
/** Every read the panel starts answers, and the renders they cause run (a few rounds). */
const settled = async (h) => {
  for (let n = 0; n < 4; n += 1) await h.settle();
};
const save = (h) => byData(h.tree, "data-action", "identity-save");
const panelText = (h) => text(h.tree);
const JARGON = ["profile", "provider", "Gateway default", "Custom", "revision"];

{
  // A record without a voice: the gateway's sentence; choose engine and voice; one Save.
  const { client, log } = makeClient(rec(1, { voice: null, set_by: "default" }));
  const saved = [];
  const h = mount(IdentityPanel, { name: "castor", client, onSaved: (r) => saved.push(r) });
  check("loading in plain words", panelText(h).includes("Loading castor's look and voice"), panelText(h));
  await settled(h);
  check("the look is drawn from the record", find(h.tree, (n) => n.props?.look)?.props.look.style === "watch-lotus");
  check("no voice: the gateway's sentence, word for word", text(byData(h.tree, "data-identity-no-voice", true)) === NO_VOICE, text(byData(h.tree, "data-identity-no-voice", true)));
  check("no voice: Save waits, and says why", save(h).props.disabled === true && text(byData(h.tree, "data-identity-hint", true)) === "Choose a voice to save.");
  check("the engines are offered", eq(byAria(h.tree, "Voice engine").props.options.map((o) => o.value), ["openai", "qwen3-tts"]));
  check("no voice list before an engine", !byAria(h.tree, "Voice"));
  byAria(h.tree, "Voice engine").props.onChange("qwen3-tts");
  await settled(h);
  const voiceSelect = byAria(h.tree, "Voice");
  check("the engine's voices", voiceSelect && voiceSelect.props.options.some((o) => o.label === "Vivian · English"), voiceSelect?.props.options);
  check("two models: the model choice is offered, Automatic first", byAria(h.tree, "Speech model")?.props.options[0].label === "Automatic");
  const vivian = voiceSelect.props.options.find((o) => o.label.startsWith("Vivian")).value;
  voiceSelect.props.onChange(vivian);
  await settled(h);
  await sleep(260);
  await settled(h);
  check("choosing a voice plays it", log.preview.length === 1 && log.preview[0].voice === "vivian" && log.preview[0].provider === "qwen3-tts", log.preview);
  check("the play/stop toggle sits in the voice row", Boolean(byData(h.tree, "data-action", "play-sample")));
  check("Save is ready", save(h).props.disabled === false);
  check("what Save does, in words", text(byData(h.tree, "data-identity-scope", true)) === "Saves castor's look and voice for everyone who meets it, on every device.");
  // A new look too, then one Save.
  find(h.tree, (n) => n.props?.ariaLabel === "Avatar design").props.onChange("watch-halo");
  find(h.tree, (n) => n.props?.["aria-label"] === "Avatar colour").props.onChange({ target: { value: "#AA33CC" } });
  h.render();
  check("the avatar follows the form", find(h.tree, (n) => n.props?.look)?.props.look.color === "#aa33cc");
  save(h).props.onClick();
  await settled(h);
  check("one Save, the whole record (model: the engine's first)", eq(log.save, [{ avatar: { style: "watch-halo", color: "#aa33cc" }, voice: { provider: "qwen3-tts", model: "Qwen-Custom", voice: "vivian" } }]), log.save);
  check("saved, in words", text(byData(h.tree, "data-identity-status", true)).startsWith("Saved."), text(byData(h.tree, "data-identity-status", true)));
  check("the host hears of it", saved.length === 1 && saved[0].rev === 2);
  check("nothing left to save", save(h).props.disabled === true);
  const words = panelText(h);
  for (const j of JARGON) check(`no "${j}" on the panel`, !words.includes(j), words);
  h.unmount();
}

{
  // A refusal: the gateway's sentence as it is, never retried, with its Download.
  const { client, log } = makeClient(rec(3), { refuse: true });
  const h = mount(IdentityPanel, { name: "castor", client });
  await settled(h);
  check("a recorded voice shows no absence sentence", !byData(h.tree, "data-identity-no-voice", true));
  check("the recorded voice is selected", byAria(h.tree, "Voice")?.props.value !== "" && byAria(h.tree, "Voice").props.options.some((o) => o.value === byAria(h.tree, "Voice").props.value));
  byAria(h.tree, "Voice").props.onChange(byAria(h.tree, "Voice").props.options.find((o) => o.label === "Nova").value);
  await settled(h);
  save(h).props.onClick();
  await settled(h);
  await sleep(50);
  await settled(h);
  check("the refusal is the gateway's sentence", text(byData(h.tree, "data-identity-status", true)) === MISSING, text(byData(h.tree, "data-identity-status", true)));
  check("one save, never retried", log.save.length === 1 && eq(log.save[0].voice, { provider: "openai", model: "tts-1", voice: "nova" }), log.save);
  const dl = byData(h.tree, "data-action", "identity-download");
  check("the offered download, with its size", dl && text(dl) === "Download (330 MB)", dl && text(dl));
  dl.props.onClick();
  await settled(h);
  check("Download starts the offered action, and does not save", log.download.length === 1 && log.download[0].body.artifact === "kokoro-big" && log.save.length === 1);
  check("the download in words", text(byData(h.tree, "data-identity-status", true)).startsWith("Downloading the voice model"));
  h.unmount();
}

{
  // Create a new voice: selected on its engine, the list read again, Save sends its bound model.
  const { client, log } = makeClient(rec(3));
  const h = mount(IdentityPanel, { name: "castor", client });
  await settled(h);
  check("Create a new voice is one button until opened", Boolean(byData(h.tree, "data-action", "open-create-voice")) && !find(h.tree, (n) => n.type === kit.CreateVoicePanel));
  byData(h.tree, "data-action", "open-create-voice").props.onClick();
  h.render();
  const panel = find(h.tree, (n) => n.type === kit.CreateVoicePanel);
  check("the kit's create-a-voice panel opens", Boolean(panel));
  const before = log.catalog.length;
  await client.createVoice.design({ description: "warm" });
  panel.props.onCreated("v-new", "qwen3-tts");
  await settled(h);
  check("the list is read again", log.catalog.length > before);
  check("the new voice is selected", byAria(h.tree, "Voice")?.props.options.find((o) => o.value === byAria(h.tree, "Voice").props.value)?.label.startsWith("My voice"), byAria(h.tree, "Voice")?.props);
  check("and said so", text(byData(h.tree, "data-identity-status", true)) === "New voice ready and selected. Save to keep it.");
  check("the panel closes", !find(h.tree, (n) => n.type === kit.CreateVoicePanel));
  save(h).props.onClick();
  await settled(h);
  check("Save sends the clone's own model", eq(log.save[0]?.voice, { provider: "qwen3-tts", model: "Qwen-Base", voice: "v-new" }), log.save);
  h.unmount();
}

{
  // Someone who may not change it: the look and voice in words, and why.
  const { client, log } = makeClient(rec(3));
  const REFUSED = "Only an admin or the entity's creator can change its settings.";
  const h = mount(IdentityPanel, { name: "castor", client, refusal: REFUSED });
  await settled(h);
  check("read-only: no Save, no pickers", !save(h) && !byAria(h.tree, "Voice engine") && !find(h.tree, (n) => n.props?.ariaLabel === "Avatar design"));
  check("read-only: the reason", text(byData(h.tree, "data-identity-refusal", true)) === REFUSED);
  check("read-only: the voice in words", text(byData(h.tree, "data-identity-voice-text", true)) === "Speaks with alloy (openai).", text(byData(h.tree, "data-identity-voice-text", true)));
  check("read-only: the catalog is not read", log.catalog.length === 0);
  h.unmount();
}

{
  // A record that cannot be read: one sentence.
  const client = { ...makeClient(rec(1)).client, read: async () => Promise.reject(new Error("HTTP 503")) };
  const h = mount(IdentityPanel, { name: "castor", client });
  await settled(h);
  check("a failed read in plain words", text(byData(h.tree, "data-identity-load-error", true)) === "Could not read castor's look and voice: HTTP 503");
  h.unmount();
}

if (failures) {
  console.error(`check_identity_panel: ${failures}/${checks} FAILED`);
  process.exit(1);
}
console.log(`check_identity_panel: ${checks}/${checks} passed`);
