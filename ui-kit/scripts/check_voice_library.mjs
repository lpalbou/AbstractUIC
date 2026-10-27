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
check("built-in voices group", voiceGroup(builtin) === "Built-in voices", voiceGroup(builtin));
check("a library voice is not the user's", voiceGroup(library) === "Built-in voices", voiceGroup(library));
check("the user's own clone", voiceGroup(mine) === "Your voices", voiceGroup(mine));
check("an engine preset", voiceGroup(preset) === "Engine voices", voiceGroup(preset));
check("language from tags", voiceLanguage(builtin) === "fr");
check("languages of a catalog", JSON.stringify(voiceLanguages([builtin, mine, preset])) === JSON.stringify(["en", "fr"]));
check("native speaker", voiceSpeaks(builtin, "fr") && !voiceSpeaks(builtin, "en"));
check("listed languages", voiceSpeaks(preset, "de") && !voiceSpeaks(preset, "ja"));
check("no filter keeps all", voiceSpeaks(mine, ""));
check("label", voiceLanguageLabel("fr") === "French" && voiceLanguageLabel("xx") === "xx");

const render = (props) => renderToStaticMarkup(React.createElement(VoiceSettings, { value: {}, onChange: () => undefined, fetchCatalog: async () => ({}), ...props }));
check("no panel without creation", !render({}).includes("data-voice-create"));
const both = render({ createVoice: { design: async () => ({ voice_id: "d" }), clone: async () => ({ voice_id: "c" }) } });
check("panel with creation", both.includes("data-voice-create") && both.includes("Create a voice"));
check("both modes offered", both.includes('data-create-mode="design"') && both.includes('data-create-mode="clone"'));
const designOnly = render({ createVoice: { design: async () => ({ voice_id: "d" }) } });
check("only the injected mode", designOnly.includes('data-create-mode="design"') && !designOnly.includes('data-create-mode="clone"'));

console.log(`check_voice_library: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
