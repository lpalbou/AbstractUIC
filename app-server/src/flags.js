/**
 * The launch flags every AbstractFramework browser app takes, parsed once.
 *
 *   --gateway-url <url>   the gateway this app talks to (aliases: --gateway, --url)
 *   --port <n>            the port the app listens on
 *   --host <addr>         the address the app listens on (default 127.0.0.1:
 *                         the gateway serves the app at /apps/<id>/)
 *   --help, -h            print the usage and exit
 * plus the app's own flags (`extra`). `--name value` and `--name=value` both
 * work; an unknown flag or a missing value is an error, never ignored.
 *
 * Environment variables are LEGACY aliases only, below every flag:
 * PORT, HOST, <APP>_GATEWAY_URL, ABSTRACTGATEWAY_URL. With no flag and no
 * environment, the gateway URL comes from the app's saved login and the
 * local gateway pointer (gateway_pointer.js), then http://127.0.0.1:8080.
 */

import { resolveGatewayUrl } from "./gateway_pointer.js";

export class FlagError extends Error {
  constructor(message) {
    super(message);
    this.name = "FlagError";
  }
}

const GATEWAY_ALIASES = ["--gateway-url", "--gateway", "--url"];

function isValidPort(n) {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function checkUrl(flag, value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new FlagError(`${flag}: ${JSON.stringify(value)} is not a URL (e.g. http://127.0.0.1:8080)`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FlagError(`${flag}: ${JSON.stringify(value)} must start with http:// or https://`);
  return value.replace(/\/+$/, "");
}

/**
 * options:
 *   appName      shown in the usage ("AbstractFlow")
 *   command      the program name in the usage ("abstractflow")
 *   envPrefix    the legacy env prefix ("ABSTRACTFLOW" -> ABSTRACTFLOW_GATEWAY_URL)
 *   defaultPort  the app's usual port (required)
 *   defaultHost  default "127.0.0.1"
 *   extra        {name: {type: "boolean"|"string", help, metavar?}} the app's own flags
 *   env          process.env by default (tests)
 *   savedUrl     the app's saved login URL, if any
 *   home, warn, pointer  passed to resolveGatewayUrl
 * Returns {help, usage, port, host, gatewayUrl, gatewayUrlSource, extra: {name: value}}.
 * Throws FlagError.
 */
export function parseAppFlags(argv, options = {}) {
  const env = options.env || process.env;
  const extraSpec = options.extra || {};
  if (!isValidPort(Number(options.defaultPort))) throw new Error("parseAppFlags: defaultPort is required");
  const values = {};
  const extra = {};
  for (const [name, spec] of Object.entries(extraSpec)) extra[name] = spec.type === "boolean" ? false : undefined;
  let help = false;
  const args = Array.from(argv || []);
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new FlagError(`Unexpected argument ${JSON.stringify(arg)} (see --help)`);
    const eq = arg.indexOf("=");
    const name = eq >= 0 ? arg.slice(0, eq) : arg;
    const inline = eq >= 0 ? arg.slice(eq + 1) : undefined;
    const takeValue = () => {
      if (inline !== undefined) return inline;
      const next = args[i + 1];
      if (next === undefined || String(next).startsWith("--")) throw new FlagError(`${name} needs a value (see --help)`);
      i += 1;
      return String(next);
    };
    if (GATEWAY_ALIASES.includes(name)) {
      values.gatewayUrl = checkUrl(name, takeValue().trim());
    } else if (name === "--port") {
      const raw = takeValue().trim();
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || !isValidPort(n)) throw new FlagError(`--port: ${JSON.stringify(raw)} is not a port (1-65535)`);
      values.port = n;
    } else if (name === "--host") {
      const h = takeValue().trim();
      if (!h) throw new FlagError("--host needs an address");
      values.host = h;
    } else if (Object.prototype.hasOwnProperty.call(extraSpec, name.slice(2))) {
      const key = name.slice(2);
      if (extraSpec[key].type === "boolean") {
        if (inline !== undefined) throw new FlagError(`${name} takes no value`);
        extra[key] = true;
      } else {
        extra[key] = takeValue();
      }
    } else {
      throw new FlagError(`Unknown option ${name} (see --help)`);
    }
  }

  let port = values.port;
  if (port === undefined && env.PORT !== undefined && String(env.PORT).trim() !== "") {
    const n = Number(String(env.PORT).trim());
    if (!isValidPort(n)) throw new FlagError(`PORT=${JSON.stringify(env.PORT)} is not a port (1-65535)`);
    port = n;
  }
  const host = values.host || String(env.HOST || "").trim() || options.defaultHost || "127.0.0.1";
  const envNames = [];
  if (options.envPrefix) envNames.push(`${options.envPrefix}_GATEWAY_URL`);
  envNames.push("ABSTRACTGATEWAY_URL");
  const envPairs = envNames.map((n) => [n, env[n]]);
  for (const [n, v] of envPairs) if (v !== undefined && String(v).trim()) checkUrl(n, String(v).trim());
  const resolved = resolveGatewayUrl({
    flag: values.gatewayUrl,
    env: envPairs,
    savedUrl: options.savedUrl,
    home: options.home,
    warn: options.warn,
    pointer: options.pointer,
  });
  return {
    help,
    usage: appUsage(options),
    port: port ?? Number(options.defaultPort),
    host,
    gatewayUrl: resolved.url,
    gatewayUrlSource: resolved.source,
    extra,
  };
}

/** The usage text for --help. */
export function appUsage(options = {}) {
  const cmd = options.command || "app";
  const lines = [
    `${options.appName || cmd}`,
    "",
    `Usage: ${cmd} [options]`,
    "",
    "Options:",
    "  --gateway-url <url>  The gateway to talk to (aliases: --gateway, --url).",
    "                       Default: the gateway installed on this computer",
    "                       (~/.abstractframework/gateway.json), else http://127.0.0.1:8080.",
    `  --port <n>           The port to listen on (default ${options.defaultPort}).`,
    `  --host <addr>        The address to listen on (default ${options.defaultHost || "127.0.0.1"}).`,
    "                       The gateway serves this app at /apps/<id>/: keep it on 127.0.0.1.",
  ];
  for (const [name, spec] of Object.entries(options.extra || {})) {
    const left = spec.type === "boolean" ? `--${name}` : `--${name} <${spec.metavar || "value"}>`;
    lines.push(`  ${left.padEnd(20)} ${spec.help || ""}`);
  }
  lines.push("  --help, -h           Show this help.");
  lines.push("");
  lines.push(
    `Environment (legacy aliases, below the flags): PORT, HOST${options.envPrefix ? `, ${options.envPrefix}_GATEWAY_URL` : ""}, ABSTRACTGATEWAY_URL.`
  );
  return lines.join("\n");
}

/**
 * parseAppFlags for a program's entry point: prints the usage and exits 0 on
 * --help, prints the error and exits 2 on a bad flag.
 */
export function parseAppFlagsOrExit(argv, options = {}) {
  try {
    const flags = parseAppFlags(argv, options);
    if (flags.help) {
      process.stdout.write(`${flags.usage}\n`);
      process.exit(0);
    }
    return flags;
  } catch (err) {
    if (err instanceof FlagError) {
      process.stderr.write(`${options.command || "app"}: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}
