import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  SafeFetchError,
  UnsafeUrlError,
  isBlockedAddress,
  resolvePublicAddresses,
  safeFetch,
  validateUrlSyntax,
  type RawResponse,
  type Transport,
} from "./safe-fetch";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "127.8.8.8", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "100.127.255.255", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "::ffff:c0a8:101", "::10.0.0.1",
    "64:ff9b::7f00:1", "2002:7f00:1::1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "93.184.216.34",
    "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isBlockedAddress(ip)).toBe(false));
});

describe("validateUrlSyntax", () => {
  it.each([
    "ftp://example.com/", "file:///etc/passwd", "gopher://example.com", "javascript:alert(1)", "not a url",
    "http://localhost/", "http://localhost:3000/", "http://foo.localhost/", "http://my-recipes:3000/",
    "http://localinfra-s3:3903/", "http://postgres/", "http://router.lan/", "http://homeassistant.local:8123/",
    "http://127.0.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://2130706433/", "http://0x7f.1/",
    "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://user:pw@example.com/",
    "http://example.com:5432/", "https://example.com:3903/",
  ])("rejects %s", (u) => expect(() => validateUrlSyntax(u)).toThrow(UnsafeUrlError));

  it.each(["https://example.com/a?b=1", "http://example.com:8080/", "https://sub.example.co.uk/x", "http://1.1.1.1/"])(
    "accepts %s",
    (u) => expect(validateUrlSyntax(u).href).toBeTruthy(),
  );
});

describe("resolvePublicAddresses", () => {
  it("rejects when any resolved address is private", async () => {
    const lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];
    await expect(resolvePublicAddresses("example.com", lookup)).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects an empty answer and accepts public ones", async () => {
    await expect(resolvePublicAddresses("x.com", async () => [])).rejects.toThrow(UnsafeUrlError);
    await expect(resolvePublicAddresses("x.com", async () => [{ address: "93.184.216.34", family: 4 }])).resolves.toHaveLength(1);
  });
});

function res(status: number, headers: Record<string, string>, body = ""): RawResponse {
  const stream = Readable.from([Buffer.from(body)]);
  return { status, headers, body: stream, destroy: () => stream.destroy() };
}

describe("safeFetch redirects and caps", () => {
  it("follows a redirect and returns the body", async () => {
    const transport: Transport = vi.fn(async (url) =>
      url.pathname === "/a" ? res(302, { location: "/b" }) : res(200, { "content-type": "text/html" }, "hello"),
    );
    const out = await safeFetch("https://example.com/a", { maxBytes: 100, transport });
    expect(out.body.toString()).toBe("hello");
    expect(out.url.pathname).toBe("/b");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect to an internal address", async () => {
    const transport: Transport = vi.fn(async () => res(302, { location: "http://169.254.169.254/latest" }));
    await expect(safeFetch("https://example.com/", { maxBytes: 100, transport })).rejects.toThrow(UnsafeUrlError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("refuses redirects to other schemes and to docker service names", async () => {
    for (const location of ["file:///etc/passwd", "http://localinfra-s3:3900/", "http://localhost/"]) {
      const transport: Transport = async () => res(301, { location });
      await expect(safeFetch("https://example.com/", { maxBytes: 100, transport })).rejects.toThrow(UnsafeUrlError);
    }
  });

  it("stops after 5 hops", async () => {
    const transport: Transport = vi.fn(async () => res(302, { location: "/next" }));
    await expect(safeFetch("https://example.com/", { maxBytes: 100, transport })).rejects.toThrow(SafeFetchError);
    expect(transport).toHaveBeenCalledTimes(6);
  });

  it("truncates or errors past the byte cap", async () => {
    const big = "x".repeat(50);
    const t: Transport = async () => res(200, {}, big);
    const cut = await safeFetch("https://example.com/", { maxBytes: 10, onOverflow: "truncate", transport: t });
    expect(cut.body.byteLength).toBe(10);
    await expect(safeFetch("https://example.com/", { maxBytes: 10, onOverflow: "error", transport: t })).rejects.toThrow(
      SafeFetchError,
    );
  });

  it("rejects a declared Content-Length over the cap without reading", async () => {
    const t: Transport = async () => res(200, { "content-length": "999999" }, "x");
    await expect(safeFetch("https://example.com/", { maxBytes: 10, onOverflow: "error", transport: t })).rejects.toThrow(
      SafeFetchError,
    );
  });

  it("validates the first URL before any request", async () => {
    const transport: Transport = vi.fn();
    await expect(safeFetch("http://10.0.0.1/", { maxBytes: 10, transport })).rejects.toThrow(UnsafeUrlError);
    expect(transport).not.toHaveBeenCalled();
  });
});
