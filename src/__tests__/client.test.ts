import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppStoreConnectClient } from "../asc/client.js";

function mockJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function mockBytes(buf: Buffer, contentType = "application/octet-stream") {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": contentType }),
    arrayBuffer: () =>
      Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  };
}

describe("AppStoreConnectClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const client = new AppStoreConnectClient(async () => "test-token");

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the v1 URL with query params and sends the bearer token", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [] }));
    await client.get("/apps", { "filter[bundleId]": "com.acme.app", limit: 10 });
    const [url, options] = mockFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.appstoreconnect.apple.com/v1/apps");
    expect(parsed.searchParams.get("filter[bundleId]")).toBe("com.acme.app");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect((options.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("joins array params with commas and skips empty/undefined values", async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [] }));
    await client.get("/builds", {
      include: ["preReleaseVersion", "app"],
      sort: undefined,
      empty: [],
    });
    const parsed = new URL(mockFetch.mock.calls[0][0]);
    expect(parsed.searchParams.get("include")).toBe("preReleaseVersion,app");
    expect(parsed.searchParams.has("sort")).toBe(false);
    expect(parsed.searchParams.has("empty")).toBe(false);
  });

  it("getAll follows links.next and accumulates data and included", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJson({
          data: [{ type: "apps", id: "1" }],
          included: [{ type: "builds", id: "b1" }],
          links: { next: "https://api.appstoreconnect.apple.com/v1/apps?cursor=2" },
        }),
      )
      .mockResolvedValueOnce(mockJson({ data: [{ type: "apps", id: "2" }] }));
    const { data, included } = await client.getAll("/apps");
    expect(data.map((d) => d.id)).toEqual(["1", "2"]);
    expect(included.map((d) => d.id)).toEqual(["b1"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api.appstoreconnect.apple.com/v1/apps?cursor=2",
    );
  });

  it("getAll stops at maxPages even if more pages exist", async () => {
    mockFetch.mockResolvedValue(
      mockJson({
        data: [{ type: "apps", id: "x" }],
        links: { next: "https://api.appstoreconnect.apple.com/v1/apps?c=n" },
      }),
    );
    await client.getAll("/apps", undefined, 3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws with status, statusText and body on non-2xx", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("NOT_AUTHORIZED"),
    });
    await expect(client.get("/apps")).rejects.toThrow("401 Unauthorized: NOT_AUTHORIZED");
  });

  it("translates a timeout into a clear error", async () => {
    mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(new DOMException("timed out", "TimeoutError"));
    });
    await expect(client.get("/apps")).rejects.toThrow(/timed out after/);
  });

  it("refuses to send the bearer token to any other origin", async () => {
    await expect(client.get("https://evil.example.com/v1/apps")).rejects.toThrow(
      "Refusing to send App Store Connect credentials to https://evil.example.com",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("downloadBinary returns base64 plus the content type", async () => {
    mockFetch.mockResolvedValueOnce(mockBytes(Buffer.from([1, 2, 3, 4]), "image/jpeg"));
    const { base64, mimeType } = await client.downloadBinary("https://example.com/shot.jpg");
    expect(base64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    expect(mimeType).toBe("image/jpeg");
  });
});
