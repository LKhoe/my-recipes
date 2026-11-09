import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

/**
 * Fetching a URL a user typed (recipe page, recipe photo) without letting it reach anything inside
 * our own network: Docker services (Postgres, Garage's admin port, the LLM gateway, metrics), the
 * home LAN (router, Home Assistant, Umbrel) or cloud-style metadata addresses (SSRF).
 *
 * - Only http/https, only a few web ports, no single-label host names (Docker service names).
 * - The host name is resolved with `dns.lookup` (all addresses); if ANY address is private,
 *   loopback, link-local, CGNAT, ULA, multicast, unspecified (or an IPv4-mapped form of those)
 *   the request is refused.
 * - The validated address is the one the socket connects to: validation happens inside the
 *   socket's `lookup` hook, so a second DNS answer (DNS rebinding) can never swap it. Built on
 *   node:http(s), so no extra dependency (undici's Agent isn't installed; Next bundles its own).
 * - Redirects are followed by hand (max 5), re-validating every hop.
 * - Hard timeout and a streaming byte cap (also on the decompressed size).
 */

export class UnsafeUrlError extends Error {}
export class SafeFetchError extends Error {}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const MAX_REDIRECTS = 5;
export const DEFAULT_TIMEOUT_MS = 15_000;

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network / unspecified
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT (Tailscale, carrier NAT)
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const blockList = new net.BlockList();
for (const [addr, prefix] of BLOCKED_V4) blockList.addSubnet(addr, prefix, "ipv4");
blockList.addAddress("::", "ipv6");
blockList.addAddress("::1", "ipv6");
blockList.addSubnet("fc00::", 7, "ipv6"); // unique local
blockList.addSubnet("fe80::", 10, "ipv6"); // link-local
blockList.addSubnet("ff00::", 8, "ipv6"); // multicast
blockList.addSubnet("2001:db8::", 32, "ipv6"); // documentation
blockList.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64 (embeds an IPv4 we can't vouch for)
blockList.addSubnet("2002::", 16, "ipv6"); // 6to4 (same)

/** Expands any IPv6 text form to 8 groups; null when malformed. Handles a trailing dotted IPv4. */
function parseIPv6(ip: string): number[] | null {
  let text = ip.split("%")[0].toLowerCase();
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const parts = v4[1].split(".").map(Number);
    if (parts.some((p) => p > 255)) return null;
    text =
      text.slice(0, -v4[1].length) +
      ((parts[0] << 8) | parts[1]).toString(16) +
      ":" +
      ((parts[2] << 8) | parts[3]).toString(16);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

/** True when a literal IP must never be contacted. Anything unparseable counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blockList.check(ip, "ipv4");
  if (family === 6) {
    const g = parseIPv6(ip);
    if (!g) return true;
    const embedded = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (deprecated IPv4-compatible)
    if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0)) {
      if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: and ::1
      return blockList.check(embedded(g[6], g[7]), "ipv4");
    }
    return blockList.check(g.map((n) => n.toString(16)).join(":"), "ipv6");
  }
  return true;
}

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".home.arpa", ".localdomain", ".corp", ".intranet"];

/** Pure checks on the URL text: scheme, port, host name shape, literal IPs. Returns the parsed URL. */
export function validateUrlSyntax(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("URL inválida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Só são aceitas URLs http e https.");
  }
  if (url.username || url.password) throw new UnsafeUrlError("URLs com usuário e senha não são aceitas.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) throw new UnsafeUrlError("Porta não permitida.");

  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) throw new UnsafeUrlError("URL inválida.");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new UnsafeUrlError("Endereço não permitido.");
    return url;
  }
  // Single-label names are Docker service names / LAN hostnames, never public sites.
  if (!host.includes(".") || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("Endereço não permitido.");
  }
  return url;
}

type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const systemLookup: LookupFn = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Resolves a host and returns its addresses, throwing if any of them is not public. */
export async function resolvePublicAddresses(
  hostname: string,
  lookup: LookupFn = systemLookup,
): Promise<Array<{ address: string; family: number }>> {
  const addresses = await lookup(hostname);
  if (addresses.length === 0) throw new UnsafeUrlError("Não foi possível resolver o endereço.");
  if (addresses.some((a) => isBlockedAddress(a.address))) throw new UnsafeUrlError("Endereço não permitido.");
  return addresses;
}

/**
 * `lookup` hook for http(s).request: the socket connects to what this returns, so the address that
 * was validated is the address that is used.
 */
const pinnedLookup: net.LookupFunction = (hostname, options, callback) => {
  resolvePublicAddresses(hostname)
    .then((addresses) => {
      if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    })
    .catch((err: Error) => callback(Object.assign(err, { code: "EUNSAFE" }) as NodeJS.ErrnoException, "", 4));
};

export type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
  destroy: () => void;
};

export type Transport = (url: URL, headers: Record<string, string>, signal: AbortSignal) => Promise<RawResponse>;

const nodeTransport: Transport = (url, headers, signal) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: host,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: "GET",
        headers: { ...headers, Host: url.host, "Accept-Encoding": "gzip, deflate, br" },
        lookup: pinnedLookup,
        agent: false,
        signal,
      },
      (res) => {
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        let body: Readable = res;
        if (enc === "gzip" || enc === "x-gzip") body = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") body = res.pipe(zlib.createInflate());
        else if (enc === "br") body = res.pipe(zlib.createBrotliDecompress());
        res.on("error", (e) => body.destroy(e));
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
          destroy: () => {
            res.destroy();
            body.destroy();
          },
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "EUNSAFE" ? new UnsafeUrlError("Endereço não permitido.") : err),
    );
    req.end();
  });

export type SafeFetchOptions = {
  headers?: Record<string, string>;
  maxBytes: number;
  /** "truncate": keep the first maxBytes and stop; "error": fail when the body is larger. */
  onOverflow?: "truncate" | "error";
  timeoutMs?: number;
  /** Only for tests. */
  transport?: Transport;
};

export type SafeFetchResult = {
  status: number;
  ok: boolean;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  url: URL;
};

function header(res: RawResponse, name: string): string {
  const v = res.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

async function readCapped(res: RawResponse, maxBytes: number, onOverflow: "truncate" | "error"): Promise<Buffer> {
  const declared = Number(header(res, "content-length"));
  if (onOverflow === "error" && declared > maxBytes && !header(res, "content-encoding")) {
    res.destroy();
    throw new SafeFetchError("Resposta grande demais.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of res.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > maxBytes) {
        if (onOverflow === "error") throw new SafeFetchError("Resposta grande demais.");
        chunks.push(buf.subarray(0, buf.byteLength - (total - maxBytes)));
        break;
      }
      chunks.push(buf);
    }
  } finally {
    res.destroy();
  }
  return Buffer.concat(chunks);
}

/** GET a user-supplied URL safely. Throws UnsafeUrlError / SafeFetchError. */
export async function safeFetch(input: string | URL, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const transport = opts.transport ?? nodeTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let url = validateUrlSyntax(input);
    for (let hop = 0; ; hop++) {
      let res: RawResponse;
      try {
        res = await transport(url, opts.headers ?? {}, controller.signal);
      } catch (err) {
        if (err instanceof UnsafeUrlError) throw err;
        throw new SafeFetchError(controller.signal.aborted ? "Tempo esgotado." : `Falha na conexão: ${(err as Error).message}`);
      }

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = header(res, "location");
        res.destroy();
        if (!location) throw new SafeFetchError("Redirecionamento sem destino.");
        if (hop >= MAX_REDIRECTS) throw new SafeFetchError("Redirecionamentos demais.");
        url = validateUrlSyntax(new URL(location, url));
        continue;
      }

      const body = await readCapped(res, opts.maxBytes, opts.onOverflow ?? "truncate");
      return { status: res.status, ok: res.status >= 200 && res.status < 300, headers: res.headers, body, url };
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError || err instanceof SafeFetchError) throw err;
    throw new SafeFetchError(controller.signal.aborted ? "Tempo esgotado." : (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
