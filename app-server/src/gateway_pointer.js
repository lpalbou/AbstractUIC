/**
 * "Where is my gateway": the local gateway pointer file (root backlog 0943).
 *
 * `~/.abstractframework/gateway.json` records where THIS computer's installed
 * gateway listens. The installer and `abstractgateway serve` write it:
 *   {"schema": 1, "url": "http://127.0.0.1:8081", "port": 8081,
 *    "data_dir": "...", "updated_at": "...", "written_by": "installer|serve"}
 * It holds no token and no liveness information.
 *
 * A reader believes it only when: `schema` is 1, the url is http(s) on
 * 127.0.0.1 / ::1 / localhost with nothing after the port, and (POSIX) the
 * file is a regular file (not a symlink) owned by the current user and
 * writable by nobody else (no group/world write bit). The checks run on the
 * OPENED file (O_NOFOLLOW | O_NONBLOCK, then fstat; at most 64 KiB), so the file cannot be swapped
 * between the check and the read. A malformed or refused
 * file is ignored with ONE visible warning; it never throws.
 *
 * The URL an app talks to, in order:
 *   1. the explicit launch flag (`--gateway-url`);
 *   2. the legacy environment (`<APP>_GATEWAY_URL`, then `ABSTRACTGATEWAY_URL`);
 *   3. the app's saved login, except a saved URL equal to the old built-in
 *      http://127.0.0.1:8080, which the pointer's URL replaces;
 *   4. the pointer's url;
 *   5. http://127.0.0.1:8080.
 */

import { closeSync, constants as fsConstants, fstatSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const POINTER_SCHEMA = 1;
export const BUILTIN_GATEWAY_URL = "http://127.0.0.1:8080";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/** `~/.abstractframework/gateway.json` (`%USERPROFILE%\.abstractframework\gateway.json` on Windows). */
export function gatewayPointerPath(home = homedir()) {
  return join(home, ".abstractframework", "gateway.json");
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function refused(path, reason) {
  return { ok: false, reason, path, warning: `Ignoring the gateway pointer ${path}: ${reason}.` };
}

/**
 * Read and check the pointer. Returns
 *   {ok: true, url, port, data_dir, written_by, updated_at, path}
 * or {ok: false, reason, path, warning?} ("missing" carries no warning).
 * options: {home, path, getuid (tests), platform (tests)}.
 */
/** Largest pointer file a reader accepts (a real one is a few hundred bytes). */
export const POINTER_MAX_BYTES = 64 * 1024;

export function readGatewayPointer(options = {}) {
  const path = options.path || gatewayPointerPath(options.home || homedir());
  const platform = options.platform || process.platform;
  const getuid = options.getuid || (typeof process.getuid === "function" ? () => process.getuid() : null);
  let fd;
  try {
    // O_NOFOLLOW: a symlink is refused by the open itself (ELOOP), never followed.
    // O_NONBLOCK: a FIFO (or device) planted at the path cannot hang the open;
    // the regular-file check below then refuses it.
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0) | (fsConstants.O_NONBLOCK || 0));
  } catch (err) {
    if (err && err.code === "ENOENT") return { ok: false, reason: "missing", path };
    if (err && (err.code === "ELOOP" || err.code === "EMLINK")) return refused(path, "it is a symbolic link");
    return refused(path, `cannot read it (${err?.code || err?.message || err})`);
  }
  let text;
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return refused(path, "it is not a regular file");
    // A pointer is a few hundred bytes: never read an unbounded file.
    if (st.size > POINTER_MAX_BYTES) return refused(path, `it is larger than 64 KiB (${st.size} bytes)`);
    if (platform !== "win32") {
      if (getuid && st.uid !== getuid()) return refused(path, "it belongs to another user");
      if (st.mode & 0o022) return refused(path, `other users can write it (mode ${(st.mode & 0o777).toString(8)})`);
    }
    text = readFileSync(fd, "utf8");
  } catch (err) {
    return refused(path, `cannot read it (${err?.code || err?.message || err})`);
  } finally {
    closeSync(fd);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return refused(path, `it is not valid JSON (${String(err?.message || err).slice(0, 120)})`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return refused(path, "it is not a JSON object");
  if (data.schema !== POINTER_SCHEMA) return refused(path, `unknown schema ${JSON.stringify(data.schema)} (this reader knows ${POINTER_SCHEMA})`);
  let url;
  try {
    url = new URL(String(data.url || ""));
  } catch {
    return refused(path, `url ${JSON.stringify(data.url)} is not a URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return refused(path, `url ${url.href} is not http(s)`);
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return refused(path, `url ${url.href} is not on this computer (127.0.0.1, ::1 or localhost only)`);
  if (url.username || url.password || (url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return refused(path, `url ${url.href} must be scheme://host:port only`);
  }
  return {
    ok: true,
    url: `${url.protocol}//${url.host}`,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    data_dir: typeof data.data_dir === "string" ? data.data_dir : null,
    written_by: typeof data.written_by === "string" ? data.written_by : null,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
    path,
  };
}

const WARNED = new Set();

function warnOnce(warn, message) {
  if (!message || WARNED.has(message)) return;
  WARNED.add(message);
  warn(message);
}

/**
 * The gateway URL by the precedence above. options:
 *   {flag, env: [[name, value], ...] in precedence order, savedUrl, home,
 *    warn (default console.warn), pointer: {getuid, platform} (tests)}
 * Returns {url, source: "flag"|"env:<NAME>"|"saved"|"pointer"|"default"}.
 */
export function resolveGatewayUrl(options = {}) {
  const warn = options.warn || ((m) => console.warn(`[abstractframework] ${m}`));
  const flag = normalizeUrl(options.flag);
  if (flag) return { url: flag, source: "flag" };
  for (const [name, value] of options.env || []) {
    const v = normalizeUrl(value);
    if (v) return { url: v, source: `env:${name}` };
  }
  let pointer = null;
  const readPointer = () => {
    if (pointer) return pointer;
    pointer = readGatewayPointer({ home: options.home, ...(options.pointer || {}) });
    if (!pointer.ok && pointer.warning) warnOnce(warn, pointer.warning);
    return pointer;
  };
  const saved = normalizeUrl(options.savedUrl);
  if (saved && saved !== BUILTIN_GATEWAY_URL) return { url: saved, source: "saved" };
  const p = readPointer();
  if (p.ok) return { url: p.url, source: "pointer" };
  if (saved) return { url: saved, source: "saved" };
  return { url: BUILTIN_GATEWAY_URL, source: "default" };
}

/**
 * A resolver a long-running server keeps: `current()` is the URL now;
 * `refresh()` re-reads the pointer (call it when a connection to the
 * current URL fails) and returns true when the URL changed. A flag or the
 * environment never moves. A saved login stays what the person chose,
 * except a saved old built-in http://127.0.0.1:8080, which follows the
 * pointer like the default does (resolveGatewayUrl step 3).
 */
export function createGatewayUrlResolver(options = {}) {
  let resolved = resolveGatewayUrl(options);
  return {
    current: () => resolved.url,
    source: () => resolved.source,
    refresh() {
      if (resolved.source !== "pointer" && resolved.source !== "default" && resolved.source !== "saved") return false;
      const next = resolveGatewayUrl(options);
      const changed = next.url !== resolved.url;
      resolved = next;
      return changed;
    },
  };
}
