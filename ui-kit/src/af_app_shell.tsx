// AfAppShell — one app shell for every AbstractFramework web app (ADR 0001 §1,
// backlog 0036): the header (brand · leading · the top-right cluster), the
// drawer system around the content, and an optional navigation sidebar.
//
// Composition only, no new behaviour:
// - the header is `data-af-topbar`, so AfTopBarActions publishes its bottom
//   edge as `--af-topbar-h` and every `topOffset: "auto"` drawer opens under it;
// - `drawers` = AfDrawerSystemProps (panels are opaque, ADR 0001 §6);
// - `nav` is docked at the left from the `md` breakpoint (1024 px) and an
//   AfDrawer (left, backdrop, under the header) below it, opened by the
//   header's "Navigation" button. The nav content is mounted in ONE place at a
//   time.
import React, { useState } from "react";
import { AfDrawer } from "./af_drawer.js";
import { AfDrawerSystem, type AfDrawerSystemProps } from "./af_drawer_system.js";
import { AfTopBarActions, type AfTopBarActionsProps } from "./af_top_bar_actions.js";
import { Icon } from "./icon.js";
import { AF_MEDIA, useAfMedia } from "./responsive.js";

export type AfAppShellTopBar = AfTopBarActionsProps & {
  /** Left of the header: the app's mark and name (a link when `href`). */
  brand?: { mark?: React.ReactNode; name: string; href?: string };
  /** After the brand: a breadcrumb, a toolbar, a search field. */
  leading?: React.ReactNode;
};

export type AfAppShellNav = {
  /** Accessible name ("Conversations", "Navigation"). */
  label: string;
  content: React.ReactNode;
  /** Controlled open state of the narrow-screen drawer (uncontrolled when omitted). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Width of the docked sidebar and the drawer (px, default 280). */
  width?: number;
};

export type AfAppShellProps = {
  topBar: AfAppShellTopBar;
  /** The side panels (omit = none). `topOffset` defaults to "auto". */
  drawers?: Omit<AfDrawerSystemProps, "children">;
  nav?: AfAppShellNav;
  children?: React.ReactNode;
  className?: string;
};

export function AfAppShell(props: AfAppShellProps): React.ReactElement {
  const { brand, leading, ...cluster } = props.topBar;
  const narrow = useAfMedia(AF_MEDIA.md);
  const [navOpenLocal, setNavOpenLocal] = useState(false);
  const nav = props.nav;
  const navOpen = nav?.open ?? navOpenLocal;
  const setNavOpen = (open: boolean) => {
    nav?.onOpenChange?.(open);
    if (nav?.open === undefined) setNavOpenLocal(open);
  };
  const navWidth = nav?.width ?? 280;

  const brandNode = brand ? (
    brand.href ? (
      <a className="af-shell__brand" href={brand.href}>
        {brand.mark}
        <span className="af-shell__brand-name">{brand.name}</span>
      </a>
    ) : (
      <span className="af-shell__brand">
        {brand.mark}
        <span className="af-shell__brand-name">{brand.name}</span>
      </span>
    )
  ) : null;

  const main = <main className="af-shell__main">{props.children}</main>;
  return (
    <div className={`af-shell${props.className ? ` ${props.className}` : ""}`}>
      <header className="af-shell__top" data-af-topbar="">
        {nav && narrow ? (
          <button
            type="button"
            className="af-topbar__btn af-shell__nav-toggle"
            aria-label={`Open ${nav.label}`}
            data-af-tip={nav.label}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            <Icon name="list" size={16} />
          </button>
        ) : null}
        {brandNode}
        <div className="af-shell__leading">{leading}</div>
        <AfTopBarActions {...cluster} />
      </header>
      <div className="af-shell__body">
        {nav && !narrow ? (
          <nav className="af-shell__nav" aria-label={nav.label} style={{ width: navWidth }}>
            {nav.content}
          </nav>
        ) : null}
        {props.drawers ? (
          <AfDrawerSystem {...props.drawers} topOffset={props.drawers.topOffset ?? "auto"}>
            {main}
          </AfDrawerSystem>
        ) : (
          main
        )}
      </div>
      {nav && narrow ? (
        <AfDrawer open={navOpen} onClose={() => setNavOpen(false)} label={nav.label} side="left" backdrop topOffset="auto" width={navWidth}>
          {nav.content}
        </AfDrawer>
      ) : null}
    </div>
  );
}

export default AfAppShell;
