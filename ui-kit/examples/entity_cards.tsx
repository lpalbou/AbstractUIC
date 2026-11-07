import React from "react";
import { createRoot } from "react-dom/client";
import { EntityCard } from "../src/entity_card.js";
import { AfPhaseRadio } from "../src/af_phase_radio.js";
import { NOW_MS, TILES } from "./entity_card_fixtures.js";

const PHASE_OF = { sleep: "sleep", visit: "visit", personal: "personal", work: "work", stopped: null } as const;

function Actions({ phase }: { phase: keyof typeof PHASE_OF }) {
  return <AfPhaseRadio phase={PHASE_OF[phase]} slots={{ visit: { label: "visit", disabled: phase !== "visit" }, work: { label: "work", disabled: phase !== "work" }, personal: { label: "personal", onSelect() {} }, sleep: { label: "sleep", onSelect() {} } }} />;
}

function Gallery() {
  const tiles = Object.entries(TILES);
  return <main>
    <h1>Entity card</h1>
    <h2>Home grid (full)</h2>
    <section className="grid" data-testid="grid">
      {tiles.map(([k, t]) => <EntityCard key={k} tile={t} nowMs={NOW_MS} onOpen={() => {}} actions={<Actions phase={t.now.phase} />} />)}
      <EntityCard tile={TILES.visiting} status="stale" asOfMs={NOW_MS - 12 * 60_000} nowMs={NOW_MS} onOpen={() => {}} />
      <EntityCard tile={null} status="unavailable" name="Veya" look={{ style: "watch-eye", color: "#a039d0" }} reason="HTTP 500" nowMs={NOW_MS} />
    </section>
    <h2>Loading holds the final size</h2>
    <section className="pair" data-testid="pair-full">
      <EntityCard tile={TILES.sleeping} nowMs={NOW_MS} actions={<Actions phase="sleep" />} />
      <EntityCard tile={null} status="loading" name="Castor" look={TILES.sleeping.look} nowMs={NOW_MS} actions={<Actions phase="sleep" />} />
      <EntityCard tile={TILES.newborn} nowMs={NOW_MS} actions={<Actions phase="sleep" />} />
    </section>
    <h2>Board strip (compact)</h2>
    <section className="strip" data-testid="strip">
      {tiles.map(([k, t]) => <EntityCard key={k} tile={t} density="compact" nowMs={NOW_MS} href="#open" />)}
      <EntityCard tile={null} status="loading" density="compact" name="Wren" nowMs={NOW_MS} />
    </section>
  </main>;
}
createRoot(document.getElementById("app")!).render(<Gallery />);
