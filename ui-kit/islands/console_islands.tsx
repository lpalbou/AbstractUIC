// Console islands — the kit's REAL React components for hosts that are not
// React apps (the AbstractGateway console is HTML served from Python).
//
// Operator order (2026-09-24, gateway mission L): "reuse the widgets from
// abstractuic for the theme selector and connect/disconnect". The console
// must not re-draw the top-right cluster or the appearance dialog by hand:
// it mounts THESE components as islands. `scripts/build_islands.mjs` bundles
// this entry (React included) into ONE self-contained IIFE that defines
// `window.AfConsoleIslands`; the gateway vendors that file through its
// generated `console_islands.py` and drift-pins it against this source.
//
// The API is deliberately tiny and prop-driven: the host owns all state and
// re-calls `update(props)` whenever it changes (no React knowledge needed).
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { AfTopBarActions } from "../src/af_top_bar_actions.js";
import { AfAppearanceDialog, type AppearanceSettings } from "../src/appearance.js";
import { AfAboutDialog } from "../src/about.js";
import { appIdentity, type AppIdentity } from "../src/identity.js";
import { Icon, type IconName } from "../src/icon.js";
import { THEME_SPECS, applyTheme } from "../src/theme.js";
import { FONT_SCALES, HEADER_DENSITIES, applyTypography } from "../src/typography.js";
import type { GatewayConnectionPhase } from "../src/use_gateway_connection.js";

declare const __KIT_VERSION__: string;

// Changes only when the island API changes INCOMPATIBLY (docs/console-islands.md
// "Versioning"). Additive members (mountAbout, appIdentity: kit 0.1.12) keep "1".
export const ISLANDS_API_VERSION = "1";

export type IslandExtraAction = {
  id: string;
  label: string;
  icon?: IconName;
  /** Plain text shown instead of an icon button (e.g. the signed-in identity). */
  text?: string;
  hidden?: boolean;
  pressed?: boolean;
  onClick?: () => void;
};

export type TopBarIslandProps = {
  assistant?: { open: boolean; onToggle: () => void; label?: string } | null;
  appearance?: { onOpen: () => void; label?: string } | null;
  /** The About button + dialog, owned by the cluster (omit/null hides it). */
  about?: { identity: AppIdentity; extraRows?: Array<[string, string]>; onOpen?: () => void; label?: string } | null;
  extras?: IslandExtraAction[];
  connection: {
    phase: GatewayConnectionPhase;
    signingOut?: boolean;
    onConnect: () => void;
    onDisconnect: () => void;
  };
};

export type AppearanceIslandProps = {
  open: boolean;
  value: AppearanceSettings;
  onChange: (next: AppearanceSettings) => void;
  onClose: () => void;
  title?: string;
  note?: string;
};

export type AboutIslandProps = {
  open: boolean;
  onClose: () => void;
  /** From `AfConsoleIslands.appIdentity("abstractgateway", version)`. */
  identity: AppIdentity;
  /** App-specific rows, e.g. `[["abstractgateway", "0.4.3"]]` from `GET /about`. */
  extraRows?: Array<[string, string]>;
  title?: string;
};

export type IslandHandle<P> = { update: (props: P) => void; unmount: () => void };

function extrasNode(extras: IslandExtraAction[] | undefined): React.ReactNode {
  const visible = (extras || []).filter((x) => x && !x.hidden);
  if (!visible.length) return null;
  return (
    <>
      {visible.map((x) =>
        x.text !== undefined ? (
          <span key={x.id} id={x.id} className="af-topbar__identity" title={x.label}>
            {x.text}
          </span>
        ) : (
          <button
            key={x.id}
            id={x.id}
            type="button"
            className={`af-topbar__btn${x.pressed ? " is-active" : ""}`}
            aria-label={x.label}
            title={x.label}
            aria-pressed={x.pressed === undefined ? undefined : x.pressed}
            onClick={x.onClick}
          >
            <Icon name={x.icon || "settings"} size={16} />
          </button>
        ),
      )}
    </>
  );
}

function TopBarIsland(props: TopBarIslandProps): React.ReactElement {
  return (
    <AfTopBarActions
      assistant={props.assistant || undefined}
      appearance={props.appearance || undefined}
      about={props.about || undefined}
      extraActions={extrasNode(props.extras)}
      connection={props.connection}
    />
  );
}

function mount<P>(el: Element, render: (props: P) => React.ReactElement, props: P): IslandHandle<P> {
  if (!el) throw new Error("AfConsoleIslands: mount target missing");
  const root: Root = createRoot(el);
  root.render(render(props));
  return {
    update(next: P) {
      root.render(render(next));
    },
    unmount() {
      root.unmount();
    },
  };
}

export function mountTopBar(el: Element, props: TopBarIslandProps): IslandHandle<TopBarIslandProps> {
  return mount(el, (p) => <TopBarIsland {...p} />, props);
}

export function mountAppearance(el: Element, props: AppearanceIslandProps): IslandHandle<AppearanceIslandProps> {
  return mount(el, (p) => <AfAppearanceDialog {...p} />, props);
}

export function mountAbout(el: Element, props: AboutIslandProps): IslandHandle<AboutIslandProps> {
  return mount(el, (p) => <AfAboutDialog {...p} />, props);
}

/** The kit's own theme + typography application (root class + CSS vars). */
export function applyAppearance(settings: Partial<AppearanceSettings>): void {
  applyTheme(String(settings.theme || "dark"));
  applyTypography({ font_scale: settings.font_scale, header_density: settings.header_density });
}

const api = {
  apiVersion: ISLANDS_API_VERSION,
  kitVersion: typeof __KIT_VERSION__ === "string" ? __KIT_VERSION__ : "unknown",
  themes: THEME_SPECS,
  fontScales: FONT_SCALES,
  headerDensities: HEADER_DENSITIES,
  mountTopBar,
  mountAppearance,
  mountAbout,
  appIdentity,
  applyAppearance,
};

(globalThis as unknown as { AfConsoleIslands: typeof api }).AfConsoleIslands = api;

export default api;
