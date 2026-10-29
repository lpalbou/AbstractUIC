#!/usr/bin/env node
/**
 * ui-kit 0.8.9: the voice picker follows the gateway's voice library (AbstractGateway 0.16.0).
 *
 * - Groups: the user's own voices, the engine's voices, the built-in library (`tags.builtin`,
 *   or `params.meta.scope == "library"`).
 * - Language: a voice's native language (`language`, else `tags.language_code`) and the
 *   languages it lists; the filter keeps the voices that speak it.
 * - "Create a voice" renders only when the host injects a creation function, with the modes it
 *   injected (a description, a recording).
 * Mutation-checked: grouping every clone as "Your voices", or rendering the panel without an
 * injected function, turns this red.
 *
 * Review fixes (adversarial review 2026-10-27), driven through a minimal hook harness (the kit's
 * checks have no DOM: the component function is called under a stand-in React dispatcher and its
 * element tree's handlers are invoked directly):
 * - C1 the language filter resets when the provider changes and when one language is left;
 * - C2 a voice with no native language and no listed languages (`languages: []` = unrestricted,
 *   remote/OpenAI voices) passes every language filter;
 * - C3 a recording's language defaults to "Detect from the recording" (no `language` sent);
 *   a description keeps one;
 * - C4 a created voice merges into the CURRENT preferences, a late result after unmount is
 *   dropped, and the panel takes one request at a time (modes and Create disabled while busy);
 * - C5 the third group is "Shared voices" (built-in voices and the administrator's).
 * - C6-C9 (AbstractUIC 0.8.3, operator QA (i)/(k) 2026-10-28; ADR 0043 readable labels): one model
 *   row per id with its role label; a clone's line names the Base it is bound to; an opaque voice
 *   id is never a label (saved option, override summary); AfVoiceSection's Engines row names the
 *   voice from the catalog of its own route. Mutants (no dedupe, no clone line, id as the saved
 *   label, the summary without the name, the id in the summary) all red.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const kit = await import(join(here, "..", "dist", "index.js"));
let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const { voiceGroup, voiceLanguage, voiceLanguages, voiceSpeaks, voiceLanguageLabel, CreateVoicePanel, VoiceSettings } = kit;
for (const [name, fn] of Object.entries({ voiceGroup, voiceLanguage, voiceLanguages, voiceSpeaks, voiceLanguageLabel, CreateVoicePanel, VoiceSettings })) {
  check(`export ${name}`, typeof fn === "function", typeof fn);
}

const builtin = { id: "fr-female-camille", voice_kind: "clone", tags: { builtin: true, language_code: "fr" } };
const mine = { id: "v1", voice_kind: "clone", language: "en", params: { meta: { scope: "personal" } } };
const library = { id: "v2", voice_kind: "clone", params: { meta: { scope: "library" } } };
const preset = { id: "aiden", voice_kind: "profile", languages: ["en", "fr", "de"] };
check("built-in voices are shared", voiceGroup(builtin) === "Shared voices", voiceGroup(builtin));
check("a library voice is shared, not the user's", voiceGroup(library) === "Shared voices", voiceGroup(library));
// The gateway's catalog merge (routes/gateway.py `_gateway_catalog_voice_items`) sets `voice_kind: "voice"`
// on a clone an engine also lists among its voices; the record's own `kind` stays "clone".
const mergedClone = { id: "v3", voice_kind: "voice", voice_kinds: ["voice", "clone"], kind: "clone", params: { meta: { scope: "personal" } } };
check("a gateway-merged clone is still the user's", voiceGroup(mergedClone) === "Your voices", voiceGroup(mergedClone));
check("the user's own clone", voiceGroup(mine) === "Your voices", voiceGroup(mine));
check("an engine preset", voiceGroup(preset) === "Engine voices", voiceGroup(preset));
check("language from tags", voiceLanguage(builtin) === "fr");
check("languages of a catalog", JSON.stringify(voiceLanguages([builtin, mine, preset])) === JSON.stringify(["en", "fr"]));
check("native speaker", voiceSpeaks(builtin, "fr") && !voiceSpeaks(builtin, "en"));
check("listed languages", voiceSpeaks(preset, "de") && !voiceSpeaks(preset, "ja"));
check("no filter keeps all", voiceSpeaks(mine, ""));
// C2: no native language and no listed languages = unrestricted (AbstractVoice `languages: []`).
check("unrestricted voice (languages: []) speaks any language", voiceSpeaks({ id: "alloy", provider: "openai", languages: [] }, "fr"));
check("unrestricted voice (no languages) speaks any language", voiceSpeaks({ id: "alloy", provider: "openai" }, "ja"));
check("a voice with a native language is still filtered", !voiceSpeaks({ id: "x", language: "en", languages: [] }, "fr"));
check("label", voiceLanguageLabel("fr") === "French" && voiceLanguageLabel("xx") === "xx");

const render = (props) => renderToStaticMarkup(React.createElement(VoiceSettings, { value: {}, onChange: () => undefined, fetchCatalog: async () => ({}), ...props }));
check("no panel without creation", !render({}).includes("data-voice-create"));
const both = render({ createVoice: { design: async () => ({ voice_id: "d" }), clone: async () => ({ voice_id: "c" }) } });
check("panel with creation", both.includes("data-voice-create") && both.includes("Create a voice"));
check("both modes offered", both.includes('data-create-mode="design"') && both.includes('data-create-mode="clone"'));
const designOnly = render({ createVoice: { design: async () => ({ voice_id: "d" }) } });
check("only the injected mode", designOnly.includes('data-create-mode="design"') && !designOnly.includes('data-create-mode="clone"'));

// ------------------------------------------------------------------ hook harness
const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
function mount(Component, initialProps) {
  const hooks = [];
  let index = 0;
  let dirty = false;
  let alive = true;
  let queue = [];
  let props = initialProps;
  const stats = { lateSets: 0 };
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.deps.length || deps.some((d, j) => !Object.is(d, prev.deps[j]));
  const dispatcher = {
    useState(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { value: typeof init === "function" ? init() : init };
      const h = hooks[k];
      if (!h.set)
        h.set = (next) => {
          if (!alive) {
            stats.lateSets += 1;
            return;
          }
          const v = typeof next === "function" ? next(h.value) : next;
          if (!Object.is(v, h.value)) dirty = true;
          h.value = v;
        };
      return [h.value, h.set];
    },
    useRef(init) {
      const k = index++;
      if (!(k in hooks)) hooks[k] = { current: init };
      return hooks[k];
    },
    useEffect(fn, deps) {
      const k = index++;
      const prev = hooks[k];
      if (changed(prev, deps))
        queue.push(() => {
          prev?.cleanup?.();
          const cleanup = fn();
          hooks[k] = { deps: deps || [], cleanup: typeof cleanup === "function" ? cleanup : undefined };
        });
    },
    useMemo(fn, deps) {
      const k = index++;
      if (changed(hooks[k], deps)) hooks[k] = { deps: deps || [], value: fn() };
      return hooks[k].value;
    },
    useCallback(fn, deps) {
      return dispatcher.useMemo(() => fn, deps);
    },
  };
  let tree = null;
  const render = () => {
    for (let pass = 0; pass < 25; pass += 1) {
      dirty = false;
      index = 0;
      const before = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        tree = Component(props);
      } finally {
        internals.ReactCurrentDispatcher.current = before;
      }
      const effects = queue;
      queue = [];
      for (const run of effects) run();
      if (!dirty) return tree;
    }
    throw new Error("render loop");
  };
  render();
  return {
    get tree() {
      return tree;
    },
    stats,
    render,
    rerender(next) {
      props = { ...props, ...next };
      return render();
    },
    async settle() {
      for (let n = 0; n < 5; n += 1) await new Promise((r) => setImmediate(r));
      return alive ? render() : tree;
    },
    unmount() {
      alive = false;
      for (const h of hooks) h?.cleanup?.();
    },
  };
}
function* walk(node) {
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
    return;
  }
  if (node.props) {
    yield node;
    yield* walk(node.props.children);
  }
}
const find = (tree, pred) => [...walk(tree)].find(pred);
const byAria = (tree, label) => find(tree, (n) => n.props.ariaLabel === label || n.props["aria-label"] === label);
const byData = (tree, key, value) => find(tree, (n) => n.props[key] === value);
const voiceIds = (tree) => (byAria(tree, "AI voice")?.props.options || []).filter((o) => o.value).map((o) => JSON.parse(o.value)[3]);

// C1: the language filter never outlives its control.
{
  const bilingual = { items: [{ id: "en1", provider: "p", voice_kind: "voice", language: "en" }, { id: "fr1", provider: "p", voice_kind: "voice", language: "fr" }] };
  const englishOnly = { items: [{ id: "en1", provider: "p", voice_kind: "voice", language: "en" }, { id: "en2", provider: "p", voice_kind: "voice", language: "en" }] };
  let catalog = bilingual;
  const h = mount(VoiceSettings, { value: { provider: "p", model: "m1" }, onChange: () => undefined, fetchCatalog: async () => catalog });
  await h.settle();
  check("C1 two languages show the filter", Boolean(byAria(h.tree, "Voice language")));
  byAria(h.tree, "Voice language").props.onChange("fr");
  h.render();
  check("C1 the filter filters", JSON.stringify(voiceIds(h.tree)) === JSON.stringify(["fr1"]), JSON.stringify(voiceIds(h.tree)));
  // One language left (another model's catalog): the hidden filter must not keep hiding voices.
  catalog = englishOnly;
  h.rerender({ value: { provider: "p", model: "m2" } });
  await h.settle();
  check("C1 one language left hides the filter", !byAria(h.tree, "Voice language"));
  check("C1 one language left: the hidden filter no longer filters", JSON.stringify(voiceIds(h.tree)) === JSON.stringify(["en1", "en2"]), JSON.stringify(voiceIds(h.tree)));
  // The filter reset is in state too: back to a bilingual catalog, it reads "Any language".
  catalog = bilingual;
  h.rerender({ value: { provider: "p", model: "m1" } });
  await h.settle();
  check("C1 the reset is kept", byAria(h.tree, "Voice language")?.props.value === "", byAria(h.tree, "Voice language")?.props.value);
  // A model change within the provider reloads the catalog (briefly empty) and keeps the filter.
  byAria(h.tree, "Voice language").props.onChange("fr");
  h.render();
  h.rerender({ value: { provider: "p", model: "m2" } });
  await h.settle();
  check("C1 a model change keeps the filter", byAria(h.tree, "Voice language")?.props.value === "fr", byAria(h.tree, "Voice language")?.props.value);
  // Provider change: the filter resets.
  h.rerender({ value: { provider: "q", model: "" } });
  await h.settle();
  check("C1 a provider change resets the filter", byAria(h.tree, "Voice language")?.props.value === "", byAria(h.tree, "Voice language")?.props.value);
}

// C5 (backlog 0058, release-closing): a voice served by several models of one engine (Qwen3-TTS
// lists each preset voice under each of its models) is ONE choice. Without a chosen model it
// carries no model (the gateway's default model speaks it); with one, it is that model's entry.
{
  const items = [
    { id: "Vivian", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", voice_kind: "voice", language: "zh" },
    { id: "Vivian", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", voice_kind: "voice", language: "zh" },
    { id: "Ryan", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", voice_kind: "voice", language: "en" },
    { id: "Ryan", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", voice_kind: "voice", language: "en" },
    { id: "solo", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", voice_kind: "voice", language: "en" },
  ];
  const changes = [];
  const h = mount(VoiceSettings, { value: { provider: "qwen3-tts", model: "" }, onChange: (v) => changes.push(v), fetchCatalog: async () => ({ items }) });
  await h.settle();
  const opts = () => (byAria(h.tree, "AI voice")?.props.options || []).filter((o) => o.value);
  check("C5 each voice once", JSON.stringify(voiceIds(h.tree).sort()) === JSON.stringify(["Ryan", "Vivian", "solo"]), JSON.stringify(voiceIds(h.tree)));
  const vivian = opts().find((o) => JSON.parse(o.value)[3] === "Vivian");
  check("C5 a voice of several models carries no model", JSON.parse(vivian.value)[1] === "", vivian.value);
  const solo = opts().find((o) => JSON.parse(o.value)[3] === "solo");
  check("C5 a one-model voice keeps its model", JSON.parse(solo.value)[1] === "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", solo.value);
  byAria(h.tree, "AI voice").props.onChange(vivian.value);
  check("C5 choosing it keeps the default model", changes.at(-1)?.voice === "Vivian" && changes.at(-1)?.model === "", JSON.stringify(changes.at(-1)));
  h.rerender({ value: { provider: "qwen3-tts", model: "", voice: "Vivian" } });
  await h.settle();
  check("C5 the saved choice is the listed option (no '(saved)' twin)", byAria(h.tree, "AI voice")?.props.value === vivian.value && !opts().some((o) => /\(saved\)/.test(o.label)), byAria(h.tree, "AI voice")?.props.value);
  h.rerender({ value: { provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice" } });
  await h.settle();
  const withModel = opts().filter((o) => JSON.parse(o.value)[3] === "Vivian");
  check("C5 with a model chosen: that model's entry, once", withModel.length === 1 && JSON.parse(withModel[0].value)[1] === "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", JSON.stringify(withModel));
}

// C6-C9 (QA (i)/(k) 2026-10-28, AbstractUIC 0.8.3): readable labels, never computer ids.
{
  const { voiceNameInCatalog, voiceLabel, isOpaqueId, cloneModelOf, voiceTtsOverrideSummary, AfVoiceSection } = kit;
  const BASE17 = "Qwen/Qwen3-TTS-12Hz-1.7B-Base";
  const BASE06 = "Qwen/Qwen3-TTS-12Hz-0.6B-Base";
  const CV06 = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
  const cloneId = "91f02e9338dc4b9eb07f2ab0b0212333";
  const sisko = { id: cloneId, voice_id: cloneId, name: "Sisko", label: "Sisko", kind: "clone", voice_kind: "voice", voice_kinds: ["voice", "clone"], provider: "qwen3-tts", model: BASE17, language: "en" };
  const aiden = { id: "aiden", name: "Aiden", label: "Aiden", kind: "profile", voice_kind: "profile", provider: "qwen3-tts", model: CV06, language: "en" };
  // C6: one row per model even when the gateway's list carries the plain ids AND the detailed records.
  {
    const catalog = {
      tts_providers: ["qwen3-tts"],
      tts_models_by_provider: { "qwen3-tts": [CV06, BASE06, BASE17, { id: CV06, role: "tts", label: CV06 }, { id: BASE06, role: "cloning", label: `${BASE06} (clones)` }, { id: BASE17, role: "cloning", label: `${BASE17} (clones)` }] },
      tts_model_details_by_provider: { "qwen3-tts": [{ id: CV06, role: "tts", label: CV06 }, { id: BASE06, role: "cloning", label: `${BASE06} (clones)` }, { id: BASE17, role: "cloning", label: `${BASE17} (clones)` }] },
      items: [aiden, sisko],
    };
    const h = mount(VoiceSettings, { value: { provider: "qwen3-tts" }, onChange: () => undefined, fetchCatalog: async () => catalog });
    await h.settle();
    const picker = find(h.tree, (n) => n.props.modelLabel === "Speech model");
    const models = await picker.props.fetchModels("qwen3-tts");
    check("C6 each model once", JSON.stringify(models.map((m) => m.id)) === JSON.stringify([CV06, BASE06, BASE17]), JSON.stringify(models));
    check("C6 the role stays as the label", models.find((m) => m.id === BASE17)?.label === `${BASE17} (clones)` && models.find((m) => m.id === CV06)?.label === CV06, JSON.stringify(models));
    // Only details (no records in the list): the same rows.
    const plain = { ...catalog, tts_models_by_provider: { "qwen3-tts": [CV06, BASE06, BASE17] } };
    const h2 = mount(VoiceSettings, { value: { provider: "qwen3-tts" }, onChange: () => undefined, fetchCatalog: async () => plain });
    await h2.settle();
    const m2 = await find(h2.tree, (n) => n.props.modelLabel === "Speech model").props.fetchModels("qwen3-tts");
    check("C6 plain list + details: same rows", JSON.stringify(m2) === JSON.stringify(models), JSON.stringify(m2));
    h.unmount();
    h2.unmount();
  }
  // C7: a clone is bound to the Base that made it: the picker says so under the selected voice.
  {
    check("C7 cloneModelOf a clone", cloneModelOf(sisko) === BASE17, cloneModelOf(sisko));
    check("C7 cloneModelOf a preset is empty", cloneModelOf(aiden) === "", cloneModelOf(aiden));
    // The clone record as AbstractVoice builds it (no top-level model): the tags / stored meta name it.
    const { model: _m, ...bare } = sisko;
    check("C7 cloneModelOf from tags.model_id", cloneModelOf({ ...bare, tags: { model_id: BASE17 } }) === BASE17);
    check("C7 cloneModelOf from params.meta.model_id", cloneModelOf({ ...bare, params: { meta: { model_id: BASE06 } } }) === BASE06);
    const h = mount(VoiceSettings, { value: { provider: "qwen3-tts", model: BASE17, voice: cloneId }, onChange: () => undefined, fetchCatalog: async () => ({ items: [aiden, sisko] }) });
    await h.settle();
    const note = byData(h.tree, "data-voice-note", "clone-model");
    const text = note ? [].concat(note.props.children).join("") : "";
    check("C7 the clone's model line", text.includes(BASE17) && /always spoken with that model/.test(text), text);
    h.rerender({ value: { provider: "qwen3-tts", model: CV06, voice: "aiden" } });
    await h.settle();
    check("C7 no clone line for a preset voice", !byData(h.tree, "data-voice-note", "clone-model"));
    h.unmount();
  }
  // C8: an opaque id is never a label (the saved choice the catalog does not list; the summary).
  {
    check("C8 a 32-hex id is opaque", isOpaqueId(cloneId) && isOpaqueId("3f2b1c4d-1111-2222-3333-444455556666"));
    check("C8 a preset name is readable", !isOpaqueId("aiden") && !isOpaqueId("fr-female-camille") && !isOpaqueId("af_heart"));
    check("C8 the same id under two engines: the chosen provider's name", voiceNameInCatalog({ items: [{ id: "x1", provider: "openai", name: "Other" }, { id: "x1", provider: "qwen3-tts", name: "Mine" }] }, "x1", "qwen3-tts") === "Mine");
    check("C8 the catalog name wins", voiceNameInCatalog({ items: [sisko] }, cloneId) === "Sisko" && voiceLabel(cloneId, { items: [sisko] }) === "Sisko");
    check("C8 an unlisted opaque id reads as a saved voice", voiceLabel(cloneId) === "a saved voice", voiceLabel(cloneId));
    const h = mount(VoiceSettings, { value: { provider: "qwen3-tts", model: BASE17, voice: cloneId }, onChange: () => undefined, fetchCatalog: async () => ({ items: [aiden] }) });
    await h.settle();
    const labels = (byAria(h.tree, "AI voice")?.props.options || []).map((o) => String(o.label));
    check("C8 the unlisted saved clone is not shown by its id", !labels.some((l) => l.includes(cloneId.slice(0, 8))) && labels.includes("Saved voice (not listed)"), JSON.stringify(labels));
    h.unmount();
    const summary = voiceTtsOverrideSummary({ provider: "qwen3-tts", model: BASE17, voice: cloneId });
    check("C8 the override summary never shows the id", !summary.includes(cloneId.slice(0, 8)), summary);
    check("C8 the summary names the voice it is given", voiceTtsOverrideSummary({ provider: "qwen3-tts", model: BASE17, voice: cloneId }, "Sisko") === `qwen3-tts · ${BASE17} · Sisko`);
  }
  // C9: AfVoiceSection's Engines row (AbstractCode's "250b665e…") names the voice from the catalog
  // of its own route, read at mount and again when the override changes.
  {
    const calls = [];
    const fetchCatalog = async (provider, model) => {
      calls.push([provider || "", model || ""]);
      return provider === "qwen3-tts" ? { items: [aiden, sisko] } : { items: [] };
    };
    const h = mount(AfVoiceSection, { value: { provider: "qwen3-tts", model: BASE17, voice: cloneId }, onChange: () => undefined, fetchCatalog, defaults: {} });
    await h.settle();
    const row = find(h.tree, (n) => n.props.setting === "tts" && "overrideSummary" in n.props);
    check("C9 the Engines row names the clone", row?.props.overrideSummary === `qwen3-tts · ${BASE17} · Sisko`, row?.props.overrideSummary);
    check("C9 read from the override's own route", calls.some(([p, m]) => p === "qwen3-tts" && m === BASE17), JSON.stringify(calls));
    h.rerender({ value: { provider: "qwen3-tts", model: CV06, voice: "aiden" } });
    await h.settle();
    const row2 = find(h.tree, (n) => n.props.setting === "tts" && "overrideSummary" in n.props);
    check("C9 a changed voice is renamed", row2?.props.overrideSummary === `qwen3-tts · ${CV06} · Aiden`, row2?.props.overrideSummary);
    h.unmount();
    // Renamed in "Manage voices" (editor open), the row is re-read when the editor closes.
    let name = "Sisko";
    const live = async (provider) => (provider === "qwen3-tts" ? { items: [aiden, { ...sisko, name, label: name }] } : { items: [] });
    const h3 = mount(AfVoiceSection, { value: { provider: "qwen3-tts", model: BASE17, voice: cloneId }, onChange: () => undefined, fetchCatalog: live, defaults: {} });
    await h3.settle();
    const rowOf = (t) => find(t, (n) => n.props.setting === "tts" && "overrideSummary" in n.props);
    rowOf(h3.tree).props.onToggle(); // open
    await h3.settle();
    name = "Captain";
    rowOf(h3.tree).props.onToggle(); // close
    await h3.settle();
    await h3.settle();
    check("C9 a rename shows once the editor closes", rowOf(h3.tree)?.props.overrideSummary === `qwen3-tts · ${BASE17} · Captain`, rowOf(h3.tree)?.props.overrideSummary);
    h3.unmount();
    // The row hidden (an entity's own voice, rows.tts false): no name request.
    const hidden = [];
    const h4 = mount(AfVoiceSection, { value: { provider: "qwen3-tts", model: BASE17, voice: cloneId }, onChange: () => undefined, fetchCatalog: async (p, m) => { hidden.push([p || "", m || ""]); return { items: [] }; }, defaults: {}, rows: { tts: false } });
    await h4.settle();
    check("C9 no name request where the row is hidden", !hidden.some(([p]) => p === "qwen3-tts"), JSON.stringify(hidden));
    h4.unmount();
  }
}

// C3: a recording's language is detected unless chosen; a description keeps one.
{
  const sent = [];
  const creation = {
    design: async (req) => (sent.push(["design", req]), { voice_id: "d1", engine: "qwen3-tts" }),
    clone: async (file, req) => (sent.push(["clone", req]), { voice_id: "c1", engine: "qwen3-tts" }),
  };
  const h = mount(CreateVoicePanel, { creation, onCreated: () => undefined });
  const designLang = byAria(h.tree, "Voice language for creation");
  check("C3 a description keeps a language (en by default)", designLang?.props.value === "en", designLang?.props.value);
  check("C3 a description offers no detection", !designLang?.props.options.some((o) => o.value === ""));
  byAria(h.tree, "Voice description").props.onChange({ target: { value: "a calm voice" } });
  h.render();
  byData(h.tree, "data-action", "create-voice").props.onClick();
  await h.settle();
  check("C3 design sends its language", sent[0]?.[0] === "design" && sent[0][1].language === "en", JSON.stringify(sent[0]));
  byData(h.tree, "data-create-mode", "clone").props.onClick();
  h.render();
  const cloneLang = byAria(h.tree, "Voice language for creation");
  check("C3 a recording's language defaults to detection", cloneLang?.props.value === "", cloneLang?.props.value);
  check("C3 detection is the first choice", cloneLang?.props.options[0]?.value === "" && cloneLang.props.options[0].label === "Detect from the recording", JSON.stringify(cloneLang?.props.options[0]));
  byAria(h.tree, "Voice recording").props.onChange({ target: { files: [new Blob([new Uint8Array([1])])] } });
  h.render();
  byData(h.tree, "data-action", "create-voice").props.onClick();
  await h.settle();
  check("C3 a detected recording sends no language", sent[1]?.[0] === "clone" && !("language" in sent[1][1]), JSON.stringify(sent[1]));
  byAria(h.tree, "Voice language for creation").props.onChange("fr");
  h.render();
  byData(h.tree, "data-action", "create-voice").props.onClick();
  await h.settle();
  check("C3 a chosen recording language is sent", sent[2]?.[1].language === "fr", JSON.stringify(sent[2]));
}

// C4: the created voice merges into the CURRENT preferences.
{
  const changes = [];
  const createVoice = { design: async () => ({ voice_id: "d1", engine: "qwen3-tts" }) };
  const h = mount(VoiceSettings, { value: { provider: "qwen3-tts", speed: 1 }, onChange: (v) => changes.push(v), fetchCatalog: async () => ({}), createVoice });
  await h.settle();
  const firstOnCreated = find(h.tree, (n) => n.type === CreateVoicePanel).props.onCreated;
  // The user changed the speed while the voice was being created.
  h.rerender({ value: { provider: "qwen3-tts", speed: 1.5, instructions: "calm" } });
  firstOnCreated("d1", "qwen3-tts");
  const last = changes[changes.length - 1] || {};
  check("C4 a created voice keeps the preferences changed meanwhile", last.speed === 1.5 && last.instructions === "calm" && last.voice === "d1", JSON.stringify(last));
}
// C4: a late result after the panel is gone is dropped.
{
  let resolve;
  const created = [];
  const creation = { design: () => new Promise((r) => (resolve = r)) };
  const h = mount(CreateVoicePanel, { creation, onCreated: (id) => created.push(id) });
  byAria(h.tree, "Voice description").props.onChange({ target: { value: "a calm voice" } });
  h.render();
  byData(h.tree, "data-action", "create-voice").props.onClick();
  h.unmount();
  resolve({ voice_id: "late" });
  await h.settle();
  check("C4 a late result after unmount selects nothing", created.length === 0, JSON.stringify(created));
  check("C4 a late result after unmount sets no state", h.stats.lateSets === 0, String(h.stats.lateSets));
}
// C4: one request at a time, in either mode.
{
  let calls = 0;
  let resolve;
  const creation = {
    design: () => ((calls += 1), new Promise((r) => (resolve = r))),
    clone: async () => ({ voice_id: "c" }),
  };
  const h = mount(CreateVoicePanel, { creation, onCreated: () => undefined });
  byAria(h.tree, "Voice description").props.onChange({ target: { value: "a calm voice" } });
  h.render();
  const click = byData(h.tree, "data-action", "create-voice").props.onClick;
  click();
  click(); // a double click before the next render
  h.render();
  check("C4 a double click sends one request", calls === 1, String(calls));
  check("C4 Create is disabled while busy", byData(h.tree, "data-action", "create-voice").props.disabled === true);
  check("C4 the mode tabs are disabled while busy", byData(h.tree, "data-create-mode", "clone").props.disabled === true && byData(h.tree, "data-create-mode", "design").props.disabled === true);
  resolve({ voice_id: "d" });
  await h.settle();
  check("C4 Create is enabled again after the result", byData(h.tree, "data-action", "create-voice").props.disabled === false);
}

// ===================== ui-primitives 0035: record, manage, sample =====================
{
  const { mount: mountH, find: findH, byAria: ariaH, byData: dataH, text, installFakeBrowser, sleep } = await import("./voice_harness.mjs");
  const { VoiceLibraryPanel, voiceRecordId } = kit;
  check("export VoiceLibraryPanel", typeof VoiceLibraryPanel === "function");
  const env = installFakeBrowser();
  try {
    // "From a recording": Record from the chosen microphone, with a live meter, then clone it.
    {
      const sent = [];
      const creation = { clone: async (file, req) => (sent.push([file, req]), { voice_id: "c1", engine: "omnivoice" }) };
      const created = [];
      const h = mountH(CreateVoicePanel, { creation, onCreated: (id, engine) => created.push([id, engine]), recordFrom: { deviceId: "mic-1", gain: 1.2 }, cloneRoute: { provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base" } });
      const rec = () => dataH(h.tree, "data-action", "record-sample");
      check("0035 Record beside the file picker", Boolean(rec()) && text(rec()) === "Record" && Boolean(ariaH(h.tree, "Voice recording")));
      check("0035 nothing to clone yet", dataH(h.tree, "data-action", "create-voice")?.props.disabled === true);
      env.amplitude = 0.12;
      env.log.getUserMedia.length = 0;
      rec().props.onClick();
      h.render();
      await sleep(130);
      h.render();
      check("0035 Record uses the chosen microphone", JSON.stringify(env.log.getUserMedia[0]) === JSON.stringify({ audio: { deviceId: { exact: "mic-1" } } }), JSON.stringify(env.log.getUserMedia));
      const meter = findH(h.tree, (n) => n.props.role === "meter");
      check("0035 a live meter while recording", meter?.props["aria-label"] === "Recording level" && meter.props["aria-valuenow"] > 40, String(meter?.props["aria-valuenow"]));
      check("0035 the button stops the recording", text(rec()) === "Stop");
      check("L4 Record flips its label, so it carries no aria-pressed", rec().props["aria-pressed"] === undefined);
      check("0035 no clone while recording", dataH(h.tree, "data-action", "create-voice")?.props.disabled === true);
      rec().props.onClick();
      await sleep(20);
      await h.settle(10);
      check("0035 the recording is ready", text(dataH(h.tree, "data-voice-note", "create")).startsWith("Recording ready"), text(dataH(h.tree, "data-voice-note", "create")));
      check("0035 the microphone is closed after Stop", env.log.recorders.at(-1)?.stream.getTracks().every((t) => t.stopped));
      dataH(h.tree, "data-action", "create-voice").props.onClick();
      await h.settle();
      check("0035 the recording is what is cloned", sent[0]?.[0] instanceof Blob && sent[0][0].size > 0, JSON.stringify(sent[0]?.[1]));
      check("0035 the clone names the injected cloning engine", sent[0]?.[1].provider === "qwen3-tts" && sent[0][1].model === "Qwen/Qwen3-TTS-12Hz-1.7B-Base", JSON.stringify(sent[0]?.[1]));
      check("0035 the created voice is selected on its engine", JSON.stringify(created[0]) === '["c1","omnivoice"]');
      h.unmount();
      // Silence is refused with a sentence; without cloneRoute no provider is sent.
      const sent2 = [];
      const q = mountH(CreateVoicePanel, { creation: { clone: async (f, r) => (sent2.push(r), { voice_id: "c2" }) }, onCreated: () => undefined });
      env.amplitude = 0;
      dataH(q.tree, "data-action", "record-sample").props.onClick();
      await sleep(80);
      dataH(q.tree, "data-action", "record-sample").props.onClick();
      await sleep(20);
      await q.settle(10);
      check("0035 a silent recording is refused", dataH(q.tree, "data-voice-note", "create")?.props.className.includes("error") && dataH(q.tree, "data-action", "create-voice")?.props.disabled === true);
      ariaH(q.tree, "Voice recording").props.onChange({ target: { files: [new Blob([new Uint8Array([1])])] } });
      q.render();
      dataH(q.tree, "data-action", "create-voice").props.onClick();
      await q.settle();
      check("0035 no cloneRoute, no provider (the gateway's default engine)", sent2[0] && !("provider" in sent2[0]) && !("model" in sent2[0]), JSON.stringify(sent2[0]));
      // Unmount mid-recording closes the microphone.
      env.amplitude = 0.1;
      dataH(q.tree, "data-action", "record-sample").props.onClick();
      await sleep(20);
      q.unmount();
      await sleep(20);
      check("0035 leaving mid-recording closes the microphone", env.log.recorders.at(-1)?.stream.getTracks().every((t) => t.stopped) && q.stats.lateSets === 0, String(q.stats.lateSets));
    }
    // B1 (review 2026-10-27): a Stop, or leaving the panel, before the microphone has opened is
    // honoured the moment the stream arrives (the microphone never stays open for the 30 s cap).
    {
      const { recordSample } = kit;
      env.gumDelay = 120;
      const stop = new AbortController();
      const t0 = Date.now();
      setTimeout(() => stop.abort(), 20);
      let outcome = "";
      const pending = recordSample({ ms: 3000, signal: stop.signal }).then(() => (outcome = "resolved"), (e) => (outcome = `rejected:${e?.name}`));
      await sleep(125);
      await new Promise((r) => setImmediate(r));
      const stream = env.log.streams.at(-1);
      check("B1 an abort before the microphone opens stops its tracks as the stream arrives", stream?.getTracks().every((t) => t.stopped) === true, `${Date.now() - t0} ms`);
      await Promise.race([pending, sleep(300)]);
      check("B1 recordSample settles at once (AbortError), not after the full length", outcome === "rejected:AbortError", outcome || "still pending");
      // An already-aborted signal never records.
      const gone = new AbortController();
      gone.abort();
      env.gumDelay = 0;
      let out2 = "";
      await Promise.race([recordSample({ ms: 3000, signal: gone.signal }).then(() => (out2 = "resolved"), (e) => (out2 = `rejected:${e?.name}`)), sleep(300)]);
      check("B1 an already-aborted recording never records", out2 === "rejected:AbortError" && env.log.streams.at(-1).getTracks().every((t) => t.stopped), out2 || "still pending");
      // Through the panel: Stop pressed during the permission prompt.
      env.gumDelay = 120;
      const h = mountH(CreateVoicePanel, { creation: { clone: async () => ({ voice_id: "c" }) }, onCreated: () => undefined });
      dataH(h.tree, "data-action", "record-sample").props.onClick();
      h.render();
      await sleep(20);
      dataH(h.tree, "data-action", "record-sample").props.onClick();
      await sleep(125);
      await h.settle(10);
      check("B1 Stop during the permission prompt closes the microphone", env.log.streams.at(-1).getTracks().every((t) => t.stopped));
      check("B1 Stop during the permission prompt ends the recording at once", text(dataH(h.tree, "data-action", "record-sample")) === "Record" && dataH(h.tree, "data-action", "create-voice")?.props.disabled === true);
      check("B1 a cancelled recording is not an error", !String(dataH(h.tree, "data-voice-note", "create")?.props.className || "").includes("error"), text(dataH(h.tree, "data-voice-note", "create")));
      // Leaving the panel during the prompt.
      dataH(h.tree, "data-action", "record-sample").props.onClick();
      await sleep(20);
      h.unmount();
      await sleep(125);
      await new Promise((r) => setImmediate(r));
      check("B1 leaving the panel during the prompt closes the microphone", env.log.streams.at(-1).getTracks().every((t) => t.stopped));
      env.gumDelay = 0;
    }
    // "Manage voices": list (no built-in voices), rename, delete asked twice, share for admins, refusals as sentences.
    {
      const calls = [];
      let voices = [
        { id: "v1", name: "My voice", kind: "clone", engine: "omnivoice", language: "en", tags: { reference_seconds: 3.94 }, params: { meta: { scope: "personal" } } },
        { voice_id: "v2", name: "Team voice", kind: "clone", provider: "qwen3-tts", params: { meta: { scope: "library" } } },
        { id: "fr-female-camille", name: "Camille", kind: "clone", tags: { builtin: true } },
      ];
      const library = {
        list: async () => (calls.push(["list"]), { voices, count: voices.length }),
        rename: async (id, patch) => void calls.push(["rename", id, patch]),
        remove: async (id) => {
          calls.push(["remove", id]);
          voices = voices.filter((v) => voiceRecordId(v) !== id);
        },
        share: async (id) => void calls.push(["share", id]),
      };
      let changed = 0;
      const removed = [];
      const h = mountH(VoiceLibraryPanel, { library, onChanged: () => (changed += 1), onRemoved: (id) => removed.push(id) });
      await h.settle();
      const row = (id) => findH(h.tree, (n) => n.props["data-voice-id"] === id);
      check("0035 the library lists the voices that can change", Boolean(row("v1")) && Boolean(row("v2")) && !row("fr-female-camille"));
      check("0035 a voice says whose it is", text(row("v1")).includes("Yours · English · omnivoice") && text(row("v2")).includes("Shared"), text(row("v1")));
      // AbstractVoice 0.19.4 `reference_seconds`: the card shows the reference clip's length; unknown = nothing.
      check("voice card shows the reference length", text(row("v1")).includes("3.9 s reference") && !text(row("v2")).includes("reference"), text(row("v1")) + " | " + text(row("v2")));
      check("0035 Share is offered for my voice, not for a shared one", Boolean(dataH(row("v1"), "data-action", "share-voice")) && !dataH(row("v2"), "data-action", "share-voice"));
      dataH(row("v1"), "data-action", "rename-voice").props.onClick();
      h.render();
      ariaH(h.tree, "New name for My voice").props.onChange({ target: { value: "Narrator" } });
      h.render();
      dataH(row("v1"), "data-action", "save-voice-name").props.onClick();
      await h.settle();
      check("0035 Rename patches the name", JSON.stringify(calls.find((c) => c[0] === "rename")) === '["rename","v1",{"name":"Narrator"}]', JSON.stringify(calls));
      check("0035 a change reloads the list and tells the host", calls.filter((c) => c[0] === "list").length === 2 && changed === 1, JSON.stringify(calls));
      dataH(row("v1"), "data-action", "delete-voice").props.onClick();
      h.render();
      check("0035 Delete asks first", !calls.some((c) => c[0] === "remove") && Boolean(dataH(row("v1"), "data-action", "confirm-delete-voice")));
      dataH(row("v1"), "data-action", "keep-voice").props.onClick();
      h.render();
      check("0035 Keep cancels", !dataH(row("v1"), "data-action", "confirm-delete-voice") && !calls.some((c) => c[0] === "remove"));
      dataH(row("v1"), "data-action", "delete-voice").props.onClick();
      h.render();
      dataH(row("v1"), "data-action", "confirm-delete-voice").props.onClick();
      await h.settle();
      await h.settle();
      check("0035 Delete removes the voice", JSON.stringify(calls.find((c) => c[0] === "remove")) === '["remove","v1"]' && !row("v1") && JSON.stringify(removed) === '["v1"]');
      library.share = async () => {
        throw new Error("Administrators only.");
      };
      h.rerender({ library: { ...library } });
      voices.push({ id: "v3", name: "Third", kind: "clone", params: { meta: { scope: "personal" } } });
      h.rerender({ refreshKey: 1 });
      await h.settle();
      dataH(row("v3"), "data-action", "share-voice").props.onClick();
      await h.settle();
      check("0035 a refusal is the gateway's sentence", text(dataH(h.tree, "data-voice-note", "library-action")) === "Administrators only.", text(dataH(h.tree, "data-voice-note", "library-action")));
      h.unmount();
      const ro = mountH(VoiceLibraryPanel, { library: { list: async () => [{ id: "v9", name: "Nine", kind: "clone" }] } });
      await ro.settle();
      check("0035 only the injected actions are offered", !dataH(ro.tree, "data-action", "rename-voice") && !dataH(ro.tree, "data-action", "delete-voice") && !dataH(ro.tree, "data-action", "share-voice"));
      ro.unmount();
    }
    // L2 (review 2026-10-27): deleting the selected voice returns to the gateway default.
    {
      const changes = [];
      const h = mountH(VoiceSettings, { value: { provider: "omnivoice", voice: "v1", speed: 1.25 }, onChange: (v) => changes.push(v), fetchCatalog: async () => ({}), voiceLibrary: { list: async () => [], remove: async () => undefined } });
      await h.settle();
      const panel = findH(h.tree, (n) => n.type === VoiceLibraryPanel);
      panel.props.onRemoved("v2");
      check("L2 deleting another voice keeps the selection", changes.length === 0, JSON.stringify(changes));
      panel.props.onRemoved("v1");
      check("L2 deleting the selected voice clears it (the rest kept)", changes.at(-1)?.voice === "" && changes.at(-1)?.speed === 1.25 && changes.at(-1)?.provider === "omnivoice", JSON.stringify(changes.at(-1)));
      h.unmount();
    }
    // VoiceSettings: voiceLibrary.list = the Manage panel; createVoice stays an alias; Play sample.
    {
      const lib = { list: async () => [], design: async () => ({ voice_id: "d" }) };
      const withLib = render({ voiceLibrary: lib });
      check("0035 voiceLibrary with list shows Manage voices", withLib.includes("data-voice-library") && withLib.includes("data-voice-create"));
      check("0035 createVoice alone: no Manage panel, still Create", !both.includes("data-voice-library") && both.includes("data-voice-create"));
      // Choosing a voice plays it (0947 / root 1055): one play/stop toggle at the right of the voice
      // select, no "Play sample" button, no replay panel.
      const catalog = { items: [
        { id: "v1", name: "Narrator", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-Base", kind: "clone" },
        { id: "v2", name: "Captain", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-Base", kind: "clone" },
        { id: "v3", name: "Pilot", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-Base", kind: "clone" },
      ] };
      const asked = [];
      const answers = [];
      const previewVoice = (prefs, textArg, opts) =>
        new Promise((resolve, reject) => {
          asked.push({ prefs, signal: opts?.signal });
          answers.push({ resolve, reject });
          opts?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        });
      let value = { provider: "qwen3-tts", model: "", voice: "" };
      const h = mountH(VoiceSettings, { value, onChange: (v) => { value = v; h.rerender({ value: v }); }, fetchCatalog: async () => catalog, previewVoice, previewOn: { deviceId: "spk-1", volume: 0.5 } });
      await h.settle();
      const toggle = () => dataH(h.tree, "data-action", "play-sample");
      // A clone carries its model, so a pick can reload the catalog: settle before the next pick.
      const pick = async (id) => {
        const select = findH(h.tree, (n) => n.props?.ariaLabel === "AI voice");
        const opt = select.props.options.find((o) => o.value && JSON.parse(o.value)[3] === id);
        select.props.onChange(opt.value);
        await h.settle();
      };
      check("0947 a play/stop toggle sits in the voice row", Boolean(toggle()) && toggle().props["data-state"] === "idle" && text(toggle()) === "▶" && !render({ previewVoice }).includes("Play sample"));
      check("0947 the toggle is a native button (Space toggles it)", toggle().type === "button" && toggle().props.type === "button");
      const debounce = async () => {
        await sleep(kit.VOICE_SAMPLE_DEBOUNCE_MS + 30);
        await h.settle();
      };
      env.log.sinks.length = 0;
      env.log.sources.length = 0;
      env.playMs = 1000;
      await pick("v1");
      check("0947 the toggle is busy at once after a choice", toggle().props["data-state"] === "loading" && toggle().props["aria-busy"] === true && asked.length === 0);
      await debounce();
      check("0947 choosing a voice synthesizes it", asked.length === 1 && asked[0].prefs.voice === "v1" && asked[0].signal instanceof AbortSignal, JSON.stringify(asked.map((a) => a.prefs)));
      check("0947 the toggle stays busy while the sample is on its way", toggle().props["data-state"] === "loading" && toggle().props.disabled === false);
      await pick("v2");
      check("0947 a newer choice aborts the older sample", asked[0].signal.aborted);
      await debounce();
      check("0947 ... and synthesizes the newer one", asked.length === 2 && asked[1].prefs.voice === "v2");
      answers[0].resolve(new ArrayBuffer(4)); // a late answer for v1
      answers[1].resolve(new ArrayBuffer(8));
      await sleep(10);
      await h.settle();
      check("0947 only the latest choice plays (fast choices never queue audio)", env.log.sources.length === 1, String(env.log.sources.length));
      check("0947 it plays on the chosen speaker", env.log.sinks.includes("spk-1"), JSON.stringify(env.log.sinks));
      check("0947 playing shows stop", toggle().props["data-state"] === "playing" && text(toggle()) === "■");
      toggle().props.onClick();
      await h.settle();
      check("0947 stop stops the sample", env.log.sources[0].stopped === true && toggle().props["data-state"] === "idle" && text(toggle()) === "▶");
      toggle().props.onClick();
      await h.settle();
      check("0947 play replays the same voice without a new request", asked.length === 2 && env.log.sources.length === 2);
      check("0947 play restarts from 0 (a fresh source, no offset)", env.log.sources[1].startArgs.length === 0 && !env.log.sources[1].stopped);
      env.playMs = 5;
      toggle().props.onClick(); // stop
      h.render();
      toggle().props.onClick(); // play again; it ends by itself
      h.render();
      check("0947 ... playing again", toggle().props["data-state"] === "playing");
      await sleep(20);
      await h.settle();
      check("0947 a sample that ends returns to play", toggle().props["data-state"] === "idle" && env.log.sources.length === 3, String(env.log.sources.length));
      await pick("v2");
      check("0947 choosing the voice just heard replays it without a request", asked.length === 2 && env.log.sources.length === 4 && toggle().props["data-state"] === "playing", JSON.stringify([asked.length, env.log.sources.length]));
      await sleep(20);
      await h.settle();
      // Going through voices quickly: one synthesis, for the voice the user stops on.
      await pick("v3");
      await sleep(kit.VOICE_SAMPLE_DEBOUNCE_MS / 2); // the user moves on within the debounce
      await pick("v1");
      await debounce();
      check("0947 fast choices start one synthesis (the last voice)", asked.length === 3 && asked[2].prefs.voice === "v1", JSON.stringify(asked.map((a) => a.prefs.voice)));
      toggle().props.onClick();
      h.render();
      check("0947 a click while loading cancels, aborting the request", asked[2].signal.aborted && toggle().props["data-state"] === "idle");
      await pick("v3");
      toggle().props.onClick();
      await debounce();
      check("0947 a click before the synthesis starts cancels it", asked.length === 3 && toggle().props["data-state"] === "idle");
      await pick("v3");
      await debounce();
      answers.at(-1).reject(new Error("No run to speak in"));
      await h.settle();
      check("0947 a failed sample says why in one line", text(dataH(h.tree, "data-voice-note", "sample")) === "The sample did not play: No run to speak in." && toggle().props["data-state"] === "idle");
      await pick("v1");
      await debounce();
      h.unmount();
      check("0947 unmounting aborts the sample on its way", asked.at(-1).signal.aborted);
      // A host whose previewVoice ignores the signal (two arguments): a late answer is dropped unplayed.
      {
        env.log.sources.length = 0;
        const slow = [];
        let v2 = { provider: "qwen3-tts", model: "", voice: "" };
        const h2 = mountH(VoiceSettings, { value: v2, onChange: (v) => { v2 = v; h2.rerender({ value: v }); }, fetchCatalog: async () => catalog,
          previewVoice: (prefs) => new Promise((resolve) => slow.push({ voice: prefs.voice, resolve })) });
        await h2.settle();
        const pick2 = async (id) => {
          const select = findH(h2.tree, (n) => n.props?.ariaLabel === "AI voice");
          select.props.onChange(select.props.options.find((o) => o.value && JSON.parse(o.value)[3] === id).value);
          await h2.settle();
        };
        await pick2("v1");
        await sleep(kit.VOICE_SAMPLE_DEBOUNCE_MS + 30);
        await pick2("v2");
        await sleep(kit.VOICE_SAMPLE_DEBOUNCE_MS + 30);
        slow[1].resolve(new ArrayBuffer(8));
        await sleep(10);
        slow[0].resolve(new ArrayBuffer(4)); // v1 answers last
        await sleep(10);
        await h2.settle();
        check("0947 a two-argument host: the late answer for an older voice never plays", slow.length === 2 && env.log.sources.length === 1, String(env.log.sources.length));
        h2.unmount();
      }
      check("0947 no previewVoice, no toggle", !render({}).includes("play-sample"));
      // An engine that lists no voice says why (the gateway's unavailable_reason), never a bare empty list.
      {
        const hu = mountH(VoiceSettings, { value: { provider: "supertonic" }, onChange: () => undefined, fetchCatalog: async () => ({ items: [], unavailable_reason: "Supertonic is not installed: onnxruntime is missing" }) });
        await hu.settle();
        check("0947 no voices: the reason is shown", text(dataH(hu.tree, "data-voice-note", "unavailable")) === "Supertonic is not installed: onnxruntime is missing");
        hu.unmount();
        const hv = mountH(VoiceSettings, { value: { provider: "supertonic" }, onChange: () => undefined, fetchCatalog: async () => ({ items: [{ id: "F1", provider: "supertonic" }], unavailable_reason: "stale" }) });
        await hv.settle();
        check("0947 voices listed: no reason note", !dataH(hv.tree, "data-voice-note", "unavailable"));
        hv.unmount();
      }
      // 0.9.2: a cloning checkpoint (AbstractVoice 0.19.2 `tts_model_details_by_provider`, role "cloning")
      // is offered in the model list as "<id> (clones)".
      {
        const BASE = "Qwen/Qwen3-TTS-12Hz-0.6B-Base";
        const CUSTOM = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
        const cat = { tts_providers: ["qwen3-tts"], tts_models_by_provider: { "qwen3-tts": [CUSTOM, BASE] },
          tts_model_details_by_provider: { "qwen3-tts": [{ id: CUSTOM, role: "tts", label: CUSTOM }, { id: BASE, role: "cloning", label: `${BASE} (clones)` }] }, items: [] };
        const hm = mountH(VoiceSettings, { value: { provider: "qwen3-tts" }, onChange: () => undefined, fetchCatalog: async () => cat });
        await hm.settle();
        const picker = findH(hm.tree, (n) => n.type === kit.ProviderModelPicker);
        const models = await picker.props.fetchModels("qwen3-tts");
        check("0.9.2 the voice picker labels a cloning checkpoint", JSON.stringify(models) === JSON.stringify([{ id: CUSTOM, label: CUSTOM }, { id: BASE, label: `${BASE} (clones)` }]), JSON.stringify(models));
        hm.unmount();
        const hp = mountH(kit.ProviderModelPicker, { value: { provider: "qwen3-tts", model: "" }, onChange: () => undefined,
          fetchProviders: async () => [{ name: "qwen3-tts" }], fetchModels: async () => [{ id: CUSTOM }, { id: BASE, label: `${BASE} (clones)` }] });
        await hp.settle();
        await sleep(5);
        await hp.settle();
        const sel = findH(hp.tree, (n) => n.type === kit.ProviderModelSelect);
        check("0.9.2 the provider/model picker shows a model's label, keeps its id", JSON.stringify(sel?.props.models) === JSON.stringify([CUSTOM, BASE]) && sel?.props.modelDisplayNames?.[BASE] === `${BASE} (clones)` && !(CUSTOM in (sel?.props.modelDisplayNames || {})), JSON.stringify([sel?.props.models, sel?.props.modelDisplayNames]));
        hp.unmount();
        const { renderToStaticMarkup: r } = await import("react-dom/server");
        const html = r(React.createElement(kit.ProviderModelSelect, { provider: "qwen3-tts", model: BASE, providers: [{ name: "qwen3-tts" }], models: [CUSTOM, BASE], modelDisplayNames: { [BASE]: `${BASE} (clones)` }, onChange: () => undefined }));
        check("0.9.2 the select renders the label", html.includes(`${BASE} (clones)`), html.slice(0, 200));
      }
      // A profile stored as `voice` (a capability route's options.voice) is shown as that profile.
      {
        const prof = { items: [{ id: "aiden", name: "Aiden", provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", voice_kind: "profile", language: "en" }] };
        const hp = mountH(VoiceSettings, { value: { provider: "qwen3-tts", model: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", voice: "aiden" }, onChange: () => undefined, fetchCatalog: async () => prof });
        await hp.settle();
        const sel = findH(hp.tree, (n) => n.props?.ariaLabel === "AI voice");
        const shown = sel.props.options.find((o) => o.value === sel.props.value);
        check("0947 a profile stored as voice shows by its name, not as a saved id", shown?.label === "Aiden · English" && !sel.props.options.some((o) => String(o.label).includes("(saved)")), JSON.stringify(sel.props.options));
        hp.unmount();
      }
    }
  } finally {
    env.restore();
  }
}

console.log(`check_voice_library: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
