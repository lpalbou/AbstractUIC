import React from "react";

import { Icon } from "@abstractframework/ui-kit";

import type { ComposerAttachment } from "./attachment_uploads.js";
import { formatBytes } from "./workspace_browser.js";

export type ComposerAttachmentChipsProps = {
  items: ComposerAttachment[];
  onRemove?: (id: string) => void;
  /** Offered on a failed chip only. */
  onRetry?: (id: string) => void;
  disabled?: boolean;
};

const PREVIEW_SCHEMES = new Set(["blob:", "data:", "http:", "https:"]);

/** A host-supplied thumbnail: blob/data/http(s) or a same-origin path; anything else is dropped. */
function previewSource(src: string | undefined): string | undefined {
  const value = String(src || "").trim();
  if (!value) return undefined;
  try {
    const base = typeof window !== "undefined" && window.location ? window.location.href : "http://same-origin.invalid/";
    return PREVIEW_SCHEMES.has(new URL(value, base).protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function chipMeta(item: ComposerAttachment): { meta: string; state: string } {
  const size = typeof item.size === "number" ? formatBytes(item.size) : "";
  if (item.state === "queued") return { meta: `Waiting${size ? ` · ${size}` : ""}`, state: "waiting to upload" };
  if (item.state === "uploading") return { meta: `Uploading${size ? ` · ${size}` : ""}`, state: "uploading" };
  if (item.state === "attached") return { meta: size, state: "attached" };
  const reason = String(item.error || "").trim() || (item.state === "refused" ? "Refused" : "Upload failed");
  return { meta: reason, state: `not attached: ${reason}` };
}

/**
 * The composer's attachment chips (backlog 0030/0031): one chip per file with
 * its state in words ("Waiting", "Uploading", attached with its size, or the
 * refusal/failure reason), Retry on a failed chip and Remove on every chip
 * when the host offers them. Every chip is focusable and names its state for
 * screen readers.
 */
export function ComposerAttachmentChips(props: ComposerAttachmentChipsProps): React.ReactElement | null {
  const items = Array.isArray(props.items) ? props.items : [];
  if (!items.length) return null;
  return (
    <div className="pc-attachment-chips" role="list" aria-label="Attached files">
      {items.map((item) => {
        const pending = item.state === "queued" || item.state === "uploading";
        const { meta, state } = chipMeta(item);
        const thumb = previewSource(item.thumbnailUrl);
        return (
          <div
            key={item.id}
            role="listitem"
            tabIndex={0}
            className={`pc-attachment-chip is-${item.state}`}
            data-state={item.state}
            aria-label={`${item.name}, ${state}`}
            aria-busy={pending || undefined}
          >
            <span className="pc-attachment-chip__icon" aria-hidden="true">
              {thumb ? (
                <img className="pc-attachment-chip__thumb" src={thumb} alt="" loading="lazy" />
              ) : pending ? (
                <span className="pc-attachment-chip__spinner" />
              ) : item.state === "attached" ? (
                <Icon name="paperclip" size={13} />
              ) : (
                <Icon name="warning" size={13} />
              )}
            </span>
            <span className="pc-attachment-chip__body">
              <span className="pc-attachment-chip__name" title={item.name}>
                {item.name}
              </span>
              {meta ? <span className="pc-attachment-chip__meta">{meta}</span> : null}
            </span>
            {item.state === "failed" && props.onRetry ? (
              <button
                type="button"
                className="pc-attachment-chip__action pc-attachment-chip__retry"
                data-action="retry"
                aria-label={`Retry ${item.name}`}
                title="Retry upload"
                disabled={props.disabled}
                onClick={() => props.onRetry?.(item.id)}
              >
                <Icon name="refresh" size={12} />
                <span>Retry</span>
              </button>
            ) : null}
            {props.onRemove ? (
              <button
                type="button"
                className="pc-attachment-chip__action"
                data-action="remove"
                aria-label={`Remove ${item.name}`}
                title={`Remove ${item.name}`}
                disabled={props.disabled}
                onClick={() => props.onRemove?.(item.id)}
              >
                <Icon name="x" size={12} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default ComposerAttachmentChips;
