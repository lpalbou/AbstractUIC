/**
 * The shared launch flags (parseAppFlags) and the local gateway pointer
 * reader (root backlog 0943), against the shared case table in
 * ui-kit/scripts/fixtures/gateway_pointer/cases.json. Every case runs in a
 * scratch home: no test reads or writes the real ~/.abstractframework.
 */
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FlagError, createGatewayUrlResolver, gatewayPointerPath, parseAppFlags, readGatewayPointer, resolveGatewayUrl } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "..", "ui-kit", "scripts", "fixtures", "gateway_pointer");
let failures = 0;
function check(name, fn) {
  try {
    fn();
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name} — ${err?.message || err}`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), "app-server-pointer-"));
let n = 0;
function home(pointerFile) {
  n += 1;
  const h = join(scratch, `home${n}`);
  mkdirSync(join(h, ".abstractframework"), { recursive: true });
  if (pointerFile) {
    copyFileSync(join(FIXTURES, pointerFile), gatewayPointerPath(h));
    chmodSync(gatewayPointerPath(h), 0o600); // as the writers leave it, whatever this machine's umask
  }
  return h;
}

// ---------------------------------------------------------------- the shared case table
const table = JSON.parse(readFileSync(join(FIXTURES, "cases.json"), "utf8"));
check("the case table covers the five contract cases", () => {
  assert.deepEqual(table.cases.map((c) => c.name).sort(), ["malformed", "missing", "non_loopback", "valid", "wrong_schema"]);
});
for (const c of table.cases) {
  check(`pointer case ${c.name}`, () => {
    if (c.file) assert.ok(existsSync(join(FIXTURES, c.file)), `fixture ${c.file} is missing`);
    const warnings = [];
    const r = resolveGatewayUrl({ home: home(c.file), warn: (m) => warnings.push(m) });
    assert.equal(r.url, c.expect);
    assert.equal(warnings.length, c.warn ? 1 : 0, warnings.join(" | "));
  });
}

check("a refused pointer warns ONCE per process", () => {
  const h = home("non_loopback.json");
  const warnings = [];
  resolveGatewayUrl({ home: h, warn: (m) => warnings.push(m) });
  resolveGatewayUrl({ home: h, warn: (m) => warnings.push(m) });
  createGatewayUrlResolver({ home: h, warn: (m) => warnings.push(m) }).refresh();
  assert.equal(warnings.length, 1, warnings.join(" | "));
});

check("owner check (POSIX): a pointer owned by another uid is refused", () => {
  const h = home("valid.json");
  const r = readGatewayPointer({ home: h, getuid: () => 999999, platform: "linux" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /another user/);
  assert.equal(readGatewayPointer({ home: h, getuid: () => 999999, platform: "win32" }).ok, true, "no uid on Windows");
});

check("a symlinked pointer is refused", () => {
  const h = home(null);
  const target = join(scratch, "elsewhere.json");
  copyFileSync(join(FIXTURES, "valid.json"), target);
  symlinkSync(target, gatewayPointerPath(h));
  assert.match(readGatewayPointer({ home: h }).reason, /symbolic link/);
});

check("a FIFO planted at the pointer path is refused, never waited on (O_NONBLOCK)", () => {
  if (process.platform === "win32") return;
  const h = home(null);
  const mk = spawnSync("mkfifo", ["-m", "600", gatewayPointerPath(h)]);
  assert.equal(mk.status, 0, `mkfifo failed: ${mk.stderr}`);
  // In a child with a timeout: a blocking open on a FIFO with no writer hangs forever.
  const src = new URL("../src/index.js", import.meta.url).href;
  const code = `import(${JSON.stringify(src)}).then((m) => { process.stdout.write(JSON.stringify(m.readGatewayPointer({ home: ${JSON.stringify(h)} }))); });`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { timeout: 5000, encoding: "utf8" });
  assert.notEqual(r.signal, "SIGTERM", "reading a FIFO pointer hung (killed after 5 s)");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.match(out.reason, /not a regular file/);
});

check("a pointer over 64 KiB is refused unread, labelled with the limit", () => {
  const h = home(null);
  const big = JSON.stringify({ schema: 1, url: "http://127.0.0.1:8082", pad: "x".repeat(70 * 1024) });
  writeFileSync(gatewayPointerPath(h), big, { mode: 0o600 });
  chmodSync(gatewayPointerPath(h), 0o600);
  const r = readGatewayPointer({ home: h });
  assert.equal(r.ok, false);
  assert.match(r.reason, /larger than 64 KiB/);
  // Just under the limit is still read.
  const h2 = home(null);
  writeFileSync(gatewayPointerPath(h2), JSON.stringify({ ...JSON.parse(readFileSync(join(FIXTURES, "valid.json"), "utf8")), pad: "x".repeat(60 * 1024) }), { mode: 0o600 });
  chmodSync(gatewayPointerPath(h2), 0o600);
  assert.equal(readGatewayPointer({ home: h2 }).ok, true);
});

check("a pointer other users can write is refused (group or world write bit)", () => {
  for (const mode of [0o620, 0o602, 0o666]) {
    const h = home("valid.json");
    chmodSync(gatewayPointerPath(h), mode);
    const r = readGatewayPointer({ home: h, platform: "linux" });
    assert.equal(r.ok, false, mode.toString(8));
    assert.match(r.reason, /other users can write it/);
  }
  const h = home("valid.json");
  chmodSync(gatewayPointerPath(h), 0o644);
  assert.equal(readGatewayPointer({ home: h }).ok, true, "readable by others is fine: no secret in it");
});

check("a directory in the pointer's place is refused", () => {
  const h = home(null);
  mkdirSync(gatewayPointerPath(h));
  assert.equal(readGatewayPointer({ home: h }).ok, false);
});

check("url with a path, credentials or a non-http scheme is refused", () => {
  for (const url of ["http://127.0.0.1:8081/x", "http://u:p@127.0.0.1:8081", "ftp://127.0.0.1:8081", "http://[::2]:8081", "http://127.0.0.1.evil.example:8081"]) {
    const h = home(null);
    writeFileSync(gatewayPointerPath(h), JSON.stringify({ schema: 1, url, port: 8081 }), { mode: 0o600 });
    assert.equal(readGatewayPointer({ home: h }).ok, false, url);
  }
  const h = home(null);
  writeFileSync(gatewayPointerPath(h), JSON.stringify({ schema: 1, url: "http://[::1]:8082/", port: 8082 }), { mode: 0o600 });
  assert.equal(readGatewayPointer({ home: h }).url, "http://[::1]:8082");
});

// ---------------------------------------------------------------- precedence
check("precedence: flag > env (legacy, in order) > saved > pointer > 8080", () => {
  const h = home("valid.json");
  const quiet = () => {};
  assert.deepEqual(resolveGatewayUrl({ home: h, flag: "http://a:1/", env: [["X", "http://b:2"]], savedUrl: "http://c:3", warn: quiet }), { url: "http://a:1", source: "flag" });
  assert.deepEqual(resolveGatewayUrl({ home: h, env: [["X", ""], ["Y", "http://b:2"]], savedUrl: "http://c:3", warn: quiet }), { url: "http://b:2", source: "env:Y" });
  assert.deepEqual(resolveGatewayUrl({ home: h, savedUrl: "http://c:3", warn: quiet }), { url: "http://c:3", source: "saved" });
  assert.deepEqual(resolveGatewayUrl({ home: h, savedUrl: "http://127.0.0.1:8080", warn: quiet }), { url: "http://127.0.0.1:8081", source: "pointer" }, "a saved old built-in 8080 yields to the pointer");
  assert.deepEqual(resolveGatewayUrl({ home: home(null), savedUrl: "http://127.0.0.1:8080", warn: quiet }), { url: "http://127.0.0.1:8080", source: "saved" });
  assert.deepEqual(resolveGatewayUrl({ home: h, warn: quiet }), { url: "http://127.0.0.1:8081", source: "pointer" });
});

check("resolver.refresh follows a pointer that moved (and never moves a flag)", () => {
  const h = home("valid.json");
  const r = createGatewayUrlResolver({ home: h, warn: () => {} });
  assert.equal(r.current(), "http://127.0.0.1:8081");
  writeFileSync(gatewayPointerPath(h), JSON.stringify({ schema: 1, url: "http://127.0.0.1:8095", port: 8095 }));
  assert.equal(r.current(), "http://127.0.0.1:8081", "no re-read until a connection fails");
  assert.equal(r.refresh(), true);
  assert.equal(r.current(), "http://127.0.0.1:8095");
  const pinned = createGatewayUrlResolver({ home: h, flag: "http://127.0.0.1:9000", warn: () => {} });
  assert.equal(pinned.refresh(), false);
  assert.equal(pinned.current(), "http://127.0.0.1:9000");
});

// ---------------------------------------------------------------- flags
const base = { defaultPort: 3005, envPrefix: "ABSTRACTFLOW", command: "abstractflow", appName: "AbstractFlow", env: {}, warn: () => {} };
check("flags: --gateway-url and its aliases, both spellings", () => {
  for (const argv of [["--gateway-url", "http://h:1"], ["--gateway-url=http://h:1"], ["--gateway", "http://h:1"], ["--url=http://h:1/"]]) {
    const f = parseAppFlags(argv, { ...base, home: home(null) });
    assert.equal(f.gatewayUrl, "http://h:1", argv.join(" "));
    assert.equal(f.gatewayUrlSource, "flag");
  }
});

check("flags: port/host defaults, flags beat the legacy env", () => {
  const h = home(null);
  let f = parseAppFlags([], { ...base, home: h });
  assert.deepEqual([f.port, f.host, f.gatewayUrl, f.gatewayUrlSource, f.help], [3005, "127.0.0.1", "http://127.0.0.1:8080", "default", false]);
  const env = { PORT: "4000", HOST: "0.0.0.0", ABSTRACTFLOW_GATEWAY_URL: "http://127.0.0.1:9001", ABSTRACTGATEWAY_URL: "http://127.0.0.1:9002" };
  f = parseAppFlags([], { ...base, home: h, env });
  assert.deepEqual([f.port, f.host, f.gatewayUrl, f.gatewayUrlSource], [4000, "0.0.0.0", "http://127.0.0.1:9001", "env:ABSTRACTFLOW_GATEWAY_URL"]);
  f = parseAppFlags(["--port", "4100", "--host", "127.0.0.1", "--gateway-url", "http://127.0.0.1:9003"], { ...base, home: h, env });
  assert.deepEqual([f.port, f.host, f.gatewayUrl], [4100, "127.0.0.1", "http://127.0.0.1:9003"]);
  f = parseAppFlags([], { ...base, home: home("valid.json") });
  assert.deepEqual([f.gatewayUrl, f.gatewayUrlSource], ["http://127.0.0.1:8081", "pointer"]);
});

check("flags: errors are loud", () => {
  const h = home(null);
  for (const argv of [["--nope"], ["--port"], ["--port", "70000"], ["--port", "12a"], ["--gateway-url", "not a url"], ["--gateway-url", "ftp://x"], ["stray"], ["--monitor-gpu=1"]]) {
    assert.throws(() => parseAppFlags(argv, { ...base, home: h, extra: { "monitor-gpu": { type: "boolean" } } }), FlagError, argv.join(" "));
  }
  assert.throws(() => parseAppFlags([], { ...base, home: h, env: { PORT: "x" } }), FlagError);
  assert.throws(() => parseAppFlags([], { ...base, home: h, env: { ABSTRACTGATEWAY_URL: "nope" } }), FlagError);
});

check("flags: extra app flags and --help", () => {
  const h = home(null);
  const extra = { "monitor-gpu": { type: "boolean", help: "Show the GPU monitor." }, theme: { type: "string", help: "Theme.", metavar: "name" } };
  const f = parseAppFlags(["--monitor-gpu", "--theme", "dark", "-h"], { ...base, home: h, extra });
  assert.deepEqual(f.extra, { "monitor-gpu": true, theme: "dark" });
  assert.equal(f.help, true);
  assert.match(f.usage, /--gateway-url <url>/);
  assert.match(f.usage, /--monitor-gpu/);
  assert.match(f.usage, /--theme <name>/);
  assert.match(f.usage, /ABSTRACTFLOW_GATEWAY_URL/);
});

rmSync(scratch, { recursive: true, force: true });
if (failures) {
  console.error(`\nflags_and_pointer: ${failures} failure(s)`);
  process.exit(1);
}
console.log("flags_and_pointer: OK (shared pointer cases, owner/symlink/url refusals, precedence, refresh, flags)");
