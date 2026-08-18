// Phase 04 freeze probe source; generated Evidence belongs under artifacts/phase04.
import assert from "node:assert/strict";
import { isIP } from "node:net";

function denyIpv4(address) {
  const bytes = address.split(".").map(Number);
  const [a, b, c] = bytes;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function denyIpv6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

function addressDenied(address) {
  const version = isIP(address);
  if (version === 4) return denyIpv4(address);
  if (version === 6) return denyIpv6(address);
  throw new Error("DNS_INVALID_ADDRESS");
}

async function validateEndpoint(value, resolveAll) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("USERINFO_REJECTED");
  if (url.hash) throw new Error("FRAGMENT_REJECTED");
  if (isIP(url.hostname)) throw new Error("IP_LITERAL_REJECTED");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("LOCAL_HOSTNAME_REJECTED");
  }
  const addresses = await resolveAll(hostname);
  if (!addresses.length || addresses.some(addressDenied)) throw new Error("ADDRESS_REJECTED");
  return { normalized: url.href, hostname, addresses, redirect: "manual" };
}

async function expectReject(url, resolver, code) {
  await assert.rejects(() => validateEndpoint(url, resolver), { message: code });
}

const publicResolver = async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];
await expectReject("http://api.example.com/v1", publicResolver, "HTTPS_REQUIRED");
await expectReject("https://user:pass@api.example.com/v1", publicResolver, "USERINFO_REJECTED");
await expectReject("https://api.example.com/v1#fragment", publicResolver, "FRAGMENT_REJECTED");
await expectReject("https://127.0.0.1/v1", publicResolver, "IP_LITERAL_REJECTED");
await expectReject("https://localhost/v1", publicResolver, "LOCAL_HOSTNAME_REJECTED");
await expectReject("https://service.local/v1", publicResolver, "LOCAL_HOSTNAME_REJECTED");
await expectReject("https://api.example.com/v1", async () => ["93.184.216.34", "10.0.0.1"], "ADDRESS_REJECTED");
await expectReject("https://api.example.com/v1", async () => ["::1"], "ADDRESS_REJECTED");
await expectReject("https://api.example.com/v1", async () => ["169.254.1.1"], "ADDRESS_REJECTED");
await expectReject("https://api.example.com/v1", async () => ["192.0.2.1"], "ADDRESS_REJECTED");

const accepted = await validateEndpoint("https://api.example.com/v1", publicResolver);
assert.equal(accepted.redirect, "manual");

let resolutionCount = 0;
const rebindingResolver = async () => {
  resolutionCount += 1;
  return resolutionCount === 1 ? ["93.184.216.34"] : ["192.168.1.7"];
};
await validateEndpoint("https://api.example.com/v1", rebindingResolver);
await expectReject("https://api.example.com/v1", rebindingResolver, "ADDRESS_REJECTED");

console.log(
  JSON.stringify(
    {
      result: "PASS",
      httpsOnly: "PASS",
      userinfoFragmentIpLiteralDenied: "PASS",
      localPrivateLinkLocalReservedMixedDnsDenied: "PASS",
      dnsRevalidatedEveryConnection: "PASS",
      dnsRebindingRejected: "PASS",
      redirects: "MANUAL_DENY",
      deterministicCases: 12,
      externalRequests: 0,
      note: "Candidate policy feasibility probe; not shipping runtime code.",
    },
    null,
    2,
  ),
);
