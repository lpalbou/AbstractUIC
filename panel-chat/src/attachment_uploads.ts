/**
 * Composer upload queue (backlog 0030/0031): the rules behind the typed
 * attachment chips, lifted from AbstractCode web
 * (`web/src/workspace/attachment_uploads.ts`) with its semantics kept.
 *
 * A file dropped, pasted or picked becomes a chip at once. It then waits
 * ("queued"), uploads ("uploading"), or is refused before any request
 * ("refused": over the gateway's `maxAttachmentBytes`, the ONLY size rule,
 * ADR-0026) or fails at the gateway ("failed", retryable). A chip that
 * uploads becomes "attached" and carries the host's reference (e.g. an
 * `$artifact` AttachmentRef) for the next run. The hook never uploads on its
 * own authority: the host injects `upload`.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { randomId } from "@abstractframework/ui-kit";

import { formatBytes } from "./workspace_browser.js";

/** One chip in the composer. */
export type ComposerAttachmentState = "queued" | "uploading" | "attached" | "refused" | "failed";
export type ComposerAttachment = {
  id: string;
  name: string;
  size?: number;
  state: ComposerAttachmentState;
  /** Host-supplied preview (blob:/data:/http(s)/same-origin); never fetched by the chip itself beyond an <img>. */
  thumbnailUrl?: string;
  /** Why the file is not attached (refused/failed), in words. */
  error?: string;
};

/** Uploads in flight at once: parallel enough to be quick, few enough to read. */
export const UPLOAD_CONCURRENCY = 3;

function exactBytes(bytes: number): string {
  return `${Math.round(bytes).toLocaleString("en-US")} bytes`;
}

/**
 * The refusal for a file over the gateway's limit, or null when it may be
 * uploaded (no limit published = the gateway decides). The message always
 * carries both numbers; when rounding would print the same figure twice it
 * falls back to exact byte counts.
 */
export function uploadRefusal(file: { name: string; size: number }, maxBytes: number | undefined): string | null {
  if (!maxBytes || !(maxBytes > 0) || file.size <= maxBytes) return null;
  let size = formatBytes(file.size);
  let limit = formatBytes(maxBytes);
  if (size === limit) {
    size = exactBytes(file.size);
    limit = exactBytes(maxBytes);
  }
  return `${file.name || "This file"} is ${size}; the gateway accepts files up to ${limit}.`;
}

/** The gateway's reason for a failed upload, as the chip shows it (client call-name prefixes dropped). */
export function uploadFailure(message: string): string {
  const reason = String(message || "")
    .replace(/^[a-z_]*upload failed:?\s*/i, "")
    .trim();
  return `Upload failed: ${reason || "the gateway did not say why"}`;
}

/** Runs `worker` over `items` with at most `limit` in flight, in order. */
export async function runBounded<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(Math.floor(limit) || 1, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

const files = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;

/** The screen-reader summary after a batch settles ("2 files attached"). */
export function uploadAnnouncement(attached: number, notAttached: number): string {
  const parts: string[] = [];
  if (attached) parts.push(`${files(attached)} attached`);
  if (notAttached) parts.push(`${files(notAttached)} could not be attached`);
  return parts.join(", ");
}

/**
 * Why a new turn cannot start yet, or null. A chip the user can still see
 * must never be left behind silently by a send: uploads in flight are
 * awaited, and a refused/failed file must be retried or removed first.
 * `WorkflowChat` applies this to `attachmentItems` before calling `onSend`.
 */
export function unattachedSendBlock(items: readonly Pick<ComposerAttachment, "name" | "state">[]): string | null {
  const waiting = items.filter((item) => item.state === "queued" || item.state === "uploading").length;
  if (waiting) return `Wait for ${files(waiting)} to finish uploading.`;
  const broken = items.filter((item) => item.state === "failed" || item.state === "refused");
  if (!broken.length) return null;
  const retryable = broken.some((item) => item.state === "failed");
  if (broken.length === 1) return `"${broken[0].name}" was not attached. ${retryable ? "Retry or remove" : "Remove"} it before sending.`;
  return `${files(broken.length)} were not attached. ${retryable ? "Retry or remove" : "Remove"} them before sending.`;
}

type Entry<T> = ComposerAttachment & { file?: File; ref?: T };

export type UseAttachmentUploadsOptions<T> = {
  /** The host's upload (e.g. `POST attachments/upload`); resolves to the reference the next run carries. */
  upload: (file: File) => Promise<T>;
  /** The gateway's published limit (`maxAttachmentBytes`); unset = the gateway decides. */
  maxBytes?: number;
  /** Uploads in flight at once (default 3). */
  concurrency?: number;
  /** Optional preview for a chip (e.g. an object URL for images). */
  thumbnail?: (file: File) => string | undefined;
};

export type AttachmentUploads<T> = {
  /** Chips for `WorkflowChat.attachmentItems`. */
  items: ComposerAttachment[];
  /** The references of attached files, in order: what the next run carries. */
  attached: T[];
  /** Queue files (refused ones never reach the network). Returns their chip ids. */
  add: (files: File[]) => string[];
  remove: (id: string) => void;
  retry: (id: string) => void;
  /** Drop every chip (after a send, or when the session changes); late uploads are ignored. */
  clear: () => void;
  /** `unattachedSendBlock(items)`. */
  sendBlock: string | null;
  /** Screen-reader summary of the last settled batch. */
  announcement: string;
};

/** The composer upload queue as a hook: chips, bounded uploads, retry, remove. */
export function useAttachmentUploads<T>(options: UseAttachmentUploadsOptions<T>): AttachmentUploads<T> {
  const [entries, setEntries] = useState<Entry<T>[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const removed = useRef(new Set<string>());
  const epoch = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, []);

  const patch = (id: string, change: Partial<Entry<T>>) => setEntries((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const uploadBatch = async (batch: Entry<T>[]) => {
    const started = epoch.current;
    const stale = (id: string) => !mounted.current || epoch.current !== started || removed.current.has(id);
    let attached = 0;
    let failed = 0;
    await runBounded(batch, optionsRef.current.concurrency ?? UPLOAD_CONCURRENCY, async (item) => {
      if (stale(item.id) || !item.file) return;
      patch(item.id, { state: "uploading", error: undefined });
      try {
        const ref = await optionsRef.current.upload(item.file);
        if (stale(item.id)) return;
        patch(item.id, { state: "attached", ref, error: undefined });
        attached += 1;
      } catch (error) {
        if (stale(item.id)) return;
        patch(item.id, { state: "failed", error: uploadFailure(error instanceof Error ? error.message : String(error ?? "")) });
        failed += 1;
      }
    });
    if (mounted.current && epoch.current === started && (attached || failed)) setAnnouncement(uploadAnnouncement(attached, failed));
  };

  const add = (list: File[]): string[] => {
    if (!list.length) return [];
    const { maxBytes, thumbnail } = optionsRef.current;
    const queued: Entry<T>[] = list.map((file) => {
      const refusal = uploadRefusal(file, maxBytes);
      const thumb = thumbnail?.(file);
      return {
        id: randomId(),
        file,
        name: file.name || "Untitled file",
        size: file.size,
        state: refusal ? "refused" : "queued",
        ...(refusal ? { error: refusal } : {}),
        ...(thumb ? { thumbnailUrl: thumb } : {}),
      };
    });
    setEntries((current) => [...current, ...queued]);
    const refused = queued.filter((item) => item.state === "refused").length;
    if (refused) setAnnouncement(uploadAnnouncement(0, refused));
    void uploadBatch(queued.filter((item) => item.state === "queued"));
    return queued.map((item) => item.id);
  };

  const retry = (id: string) => {
    const item = entries.find((entry) => entry.id === id);
    if (!item || item.state !== "failed") return;
    const again: Entry<T> = { ...item, state: "queued", error: undefined };
    setEntries((list) => list.map((entry) => (entry.id === id ? again : entry)));
    void uploadBatch([again]);
  };

  const remove = (id: string) => {
    removed.current.add(id);
    setEntries((list) => list.filter((entry) => entry.id !== id));
  };

  const clear = () => {
    epoch.current += 1;
    setEntries([]);
  };

  const items = useMemo<ComposerAttachment[]>(
    () => entries.map(({ id, name, size, state, thumbnailUrl, error }) => ({ id, name, size, state, ...(thumbnailUrl ? { thumbnailUrl } : {}), ...(error ? { error } : {}) })),
    [entries],
  );
  const attached = useMemo(() => entries.filter((entry) => entry.state === "attached").map((entry) => entry.ref as T), [entries]);
  return { items, attached, add, remove, retry, clear, sendBlock: unattachedSendBlock(items), announcement };
}
