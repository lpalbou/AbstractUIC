/**
 * Pure helpers behind WorkflowChat's drag-and-drop and paste-to-attach.
 *
 * Nothing here touches React or the document: every function takes the
 * browser object it inspects (a DataTransfer's `types`/`items`/`files`, a
 * clipboard) as a plain argument so the rules are testable in Node.
 */

/** A DataTransfer `types` value (array in modern engines, DOMStringList in old ones). */
export type DragTypes = ArrayLike<string> | null | undefined;

type ItemLike = {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
  webkitGetAsEntry?: () => { isDirectory?: boolean; name?: string } | null;
};

/** The DataTransfer surface the helpers read. */
export type TransferLike = {
  types?: DragTypes;
  items?: ArrayLike<ItemLike> | null;
  files?: ArrayLike<File> | null;
};

/** True only for OS file drags. Text selections and links carry no "Files" type. */
export function dragCarriesFiles(types: DragTypes): boolean {
  if (!types) return false;
  for (let index = 0; index < types.length; index += 1) if (types[index] === "Files") return true;
  return false;
}

/**
 * How many files a drag carries, when the engine says so before the drop.
 * Chromium and Firefox expose `items` (kind "file") during dragenter/dragover;
 * Safari may expose nothing. `null` means unknown — never guess a number.
 */
export function draggedFileCount(transfer: TransferLike | null | undefined): number | null {
  const items = transfer?.items;
  if (!items || !items.length) return null;
  let count = 0;
  for (let index = 0; index < items.length; index += 1) if (items[index]?.kind === "file") count += 1;
  return count > 0 ? count : null;
}

/** The drop zone's headline, pluralised with the count when it is known. */
export function dropZoneLabel(count: number | null): string {
  if (count === 1) return "Drop file to attach";
  if (typeof count === "number" && count > 1) return `Drop ${count} files to attach`;
  return "Drop files to attach";
}

export type DroppedFiles = { files: File[]; folders: string[] };

/**
 * Split a drop into uploadable files and folders. A folder arrives as a
 * "file" item whose entry is a directory; uploading it would send an empty or
 * failing body, so it is reported instead (never silently skipped).
 */
export function droppedFiles(transfer: TransferLike | null | undefined): DroppedFiles {
  const files: File[] = [];
  const folders: string[] = [];
  const items = transfer?.items;
  if (items && items.length) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || item.kind !== "file") continue;
      const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
      const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
      if (entry?.isDirectory) folders.push(entry.name || file?.name || "folder");
      else if (file) files.push(file);
    }
    return { files, folders };
  }
  const list = transfer?.files;
  if (list) for (let index = 0; index < list.length; index += 1) if (list[index]) files.push(list[index]);
  return { files, folders };
}

/** The message shown when a drop contained folders. */
export function folderRefusal(folders: string[]): string {
  if (!folders.length) return "";
  if (folders.length === 1) return `"${folders[0]}" is a folder. Folders are not supported: drop the files inside it instead.`;
  return `${folders.length} folders were dropped. Folders are not supported: drop the files inside them instead.`;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A readable name for a pasted file. Browsers name every clipboard screenshot
 * "image.png"; three of those in one message are indistinguishable, so a
 * generic (or empty) name becomes "Pasted image 2026-09-23 at 14.05.09.png".
 * A real file name (a file copied in Finder) is kept.
 */
export function pastedFileName(name: string, type: string, now: Date): string {
  const trimmed = String(name || "").trim();
  if (trimmed && !/^image\.(png|jpe?g|gif|webp|heic|tiff?|bmp)$/i.test(trimmed)) return trimmed;
  const extension = IMAGE_EXTENSIONS[String(type || "").toLowerCase()] || trimmed.split(".").pop() || "bin";
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  return `${String(type || "").startsWith("image/") || !trimmed ? "Pasted image" : "Pasted file"} ${stamp}.${extension}`;
}

/**
 * Files to attach from a paste, or [] to let the paste behave as text.
 *
 * Rich documents (Word, Excel, Pages) put text/plain AND text/html on the
 * clipboard next to a rendered picture of the selection: that paste is text.
 * A screenshot (Files only), an image copied from a page (text/html + Files)
 * or a file copied in Finder (text/plain name + Files) is an attachment.
 */
export function pastedFiles(clipboard: TransferLike | null | undefined, now: Date = new Date()): File[] {
  if (!clipboard) return [];
  const types = clipboard.types ? Array.from(clipboard.types) : [];
  if (types.includes("text/plain") && types.includes("text/html")) return [];
  const { files } = droppedFiles(clipboard);
  return files.map((file) => {
    const name = pastedFileName(file.name, file.type, now);
    if (name === file.name) return file;
    return new File([file], name, { type: file.type, lastModified: file.lastModified });
  });
}

/**
 * Tracks whether a file drag is over the window.
 *
 * dragenter/dragleave fire for EVERY element the pointer crosses (enter on
 * the new element, then leave on the old), so a boolean flickers off on each
 * child boundary. A depth counter only reaches zero when the drag has really
 * left. Engines drop a dragleave now and then (fast exits, Escape), so
 * `stale` also retires a drag that has gone quiet: while a drag is over the
 * page the engine repeats dragover every few hundred milliseconds even when
 * the pointer rests.
 */
export class DragPresence {
  depth = 0;
  lastSeen = 0;

  constructor(readonly staleMs = 1200) {}

  enter(now: number): void {
    this.depth += 1;
    this.lastSeen = now;
  }

  over(now: number): void {
    // A dragover without a counted enter (the enter preceded a reset) still
    // proves a drag is present.
    if (this.depth === 0) this.depth = 1;
    this.lastSeen = now;
  }

  /** Returns true while the drag is still somewhere over the window. */
  leave(now: number): boolean {
    this.depth = Math.max(0, this.depth - 1);
    this.lastSeen = now;
    return this.depth > 0;
  }

  reset(): void {
    this.depth = 0;
  }

  active(now: number): boolean {
    return this.depth > 0 && now - this.lastSeen < this.staleMs;
  }
}
