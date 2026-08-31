import { describe, expect, it } from "vitest";
import { isAllowedProductUrl } from "./allowedDomains";

describe("isAllowedProductUrl", () => {
  const allowed = ["https://glasses.ua/*", "https://cdn.glasses.ua/*"];

  it("allows a URL on an exact configured host", () => {
    expect(isAllowedProductUrl(allowed, "https://glasses.ua/images/rayban.jpg")).toBe(true);
    expect(isAllowedProductUrl(allowed, "https://cdn.glasses.ua/x/y/z.png")).toBe(true);
  });

  it("rejects a different host, including a look-alike subdomain", () => {
    expect(isAllowedProductUrl(allowed, "https://evil.com/rayban.jpg")).toBe(false);
    expect(isAllowedProductUrl(allowed, "https://notglasses.ua/rayban.jpg")).toBe(false);
    expect(isAllowedProductUrl(allowed, "https://glasses.ua.evil.com/rayban.jpg")).toBe(false);
  });

  it("rejects non-http(s) protocols even on an allowed host", () => {
    expect(isAllowedProductUrl(allowed, "file:///etc/passwd")).toBe(false);
    expect(isAllowedProductUrl(["glasses.ua"], "ftp://glasses.ua/x.jpg")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedProductUrl(allowed, "not a url")).toBe(false);
  });

  it("supports a bare-hostname pattern matching any protocol", () => {
    expect(isAllowedProductUrl(["glasses.ua"], "https://glasses.ua/a.jpg")).toBe(true);
    expect(isAllowedProductUrl(["glasses.ua"], "http://glasses.ua/a.jpg")).toBe(true);
  });

  it("matches regardless of the pattern's own protocol — a merchant-saved https:// pattern still allows a real http:// image on the same host", () => {
    // Confirmed on a real Shopify store: the merchant saved
    // "https://w7q0ap-zp.myshopify.com/" (copy-pasted from the address
    // bar), but the theme's own product data emitted the image as a
    // plain http:// URL on that same host — same domain, no actual
    // ownership question, just a scheme the merchant never chose.
    expect(isAllowedProductUrl(["https://glasses.ua/*"], "http://glasses.ua/a.jpg")).toBe(true);
    expect(isAllowedProductUrl(["http://glasses.ua"], "https://glasses.ua/a.jpg")).toBe(true);
  });

  it("is case-insensitive on hostname", () => {
    expect(isAllowedProductUrl(["https://Glasses.UA/*"], "https://glasses.ua/a.jpg")).toBe(true);
  });

  it("rejects when allowedDomains is empty", () => {
    expect(isAllowedProductUrl([], "https://glasses.ua/a.jpg")).toBe(false);
  });
});
