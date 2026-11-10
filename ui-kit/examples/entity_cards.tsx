import React from "react";
import { createRoot } from "react-dom/client";
import { EntityCard } from "../src/entity_card.js";
import { AfPhaseRadio } from "../src/af_phase_radio.js";
import { FAILED_LOOP, LIFE, NOW_MS, TILES } from "./entity_card_fixtures.js";

const PHASE_OF = { sleep: "sleep", visit: "visit", personal: "personal", work: "work", stopped: null } as const;

function Actions({ phase }: { phase: keyof typeof PHASE_OF }) {
  return <AfPhaseRadio phase={PHASE_OF[phase]} slots={{ visit: { label: "visit", disabled: phase !== "visit" }, work: { label: "work", disabled: phase !== "work" }, personal: { label: "personal", onSelect() {} }, sleep: { label: "sleep", onSelect() {} } }} />;
}

/** A card with its acts: each click is recorded on the page (`data-last-act`), Retry and Resume stay
 * in flight for a moment, and a second Resume is refused with the gateway's sentence. */
function ActsCard({ state, tile, compact }: { state: keyof typeof LIFE; tile: (typeof TILES)[string]; compact?: boolean }) {
  const [pending, setPending] = React.useState<"retry" | "resume" | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; refused?: boolean } | null>(null);
  const record = (act: string) => document.body.setAttribute("data-last-act", `${act}:${tile.name}`);
  const act = (a: "retry" | "resume") => () => {
    record(a);
    setPending(a);
    setTimeout(() => {
      setPending(null);
      setNotice(a === "resume" ? { text: "Only an admin can grant his own time, stop or resume him.", refused: true } : null);
    }, 400);
  };
  return <EntityCard tile={tile} nowMs={NOW_MS} density={compact ? "compact" : "full"} onOpen={() => record("open")} life={LIFE[state]} loop={state === "crashed" ? FAILED_LOOP : null}
    onWatch={() => record("watch")} onRetry={act("retry")} onResume={act("resume")} pending={pending} notice={notice}
    actions={compact ? undefined : <Actions phase={tile.now.phase} />} />;
}

/** `?acts`: the card's acts on a page of their own (a browser keeps about 16 drawn portraits live at once). */
function ActsGallery() {
  return <main>
    <h1>Entity card: acts</h1>
    <h2>Watch, Retry with the reason, Resume (served life state)</h2>
    <section className="pair" data-testid="acts">
      <ActsCard state="idle" tile={TILES.visiting} />
      <ActsCard state="crashed" tile={TILES.failed} />
      <ActsCard state="stopped" tile={TILES.stopped} />
    </section>
    <h2>Compact</h2>
    <section className="strip" data-testid="acts-compact">
      <ActsCard state="idle" tile={TILES.visiting} compact />
      <ActsCard state="crashed" tile={TILES.failed} compact />
      <ActsCard state="stopped" tile={TILES.stopped} compact />
    </section>
  </main>;
}

function Gallery() {
  if (new URLSearchParams(location.search).has("acts")) return <ActsGallery />;
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
