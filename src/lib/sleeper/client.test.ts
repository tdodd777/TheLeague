import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SleeperApiError, sleeper } from "./client";

/**
 * Nothing here touches the network: `globalThis.fetch` is replaced for the
 * duration of each case and restored afterwards. Retryable cases answer with
 * `Retry-After: 0` so the client's own backoff never sleeps, which keeps the
 * suite instant and free of jitter. One case deliberately omits the header to
 * prove the built-in backoff path retries too.
 */
interface StubResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

interface FetchStub {
  /** URLs requested, in order. One entry per attempt. */
  calls: string[];
  restore: () => void;
}

function stubFetch(plan: readonly StubResponse[] | ((attempt: number) => StubResponse)): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    calls.push(String(input));
    const attempt = calls.length;
    const spec =
      typeof plan === "function"
        ? plan(attempt)
        : (plan[Math.min(attempt, plan.length) - 1] ?? { status: 500 });
    return Promise.resolve(
      new Response(spec.body ?? "{}", {
        status: spec.status,
        headers: spec.headers ?? {},
      }),
    );
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const NOW_HEADERS = { "retry-after": "0" };

describe("sleeper client retry classification", () => {
  for (const status of [429, 500, 502, 503]) {
    it(`retries a ${status} up to the attempt ceiling`, async () => {
      const stub = stubFetch([{ status, headers: NOW_HEADERS }]);
      try {
        await assert.rejects(
          sleeper.league("123"),
          (err: unknown) => err instanceof SleeperApiError && err.status === status,
        );
        assert.equal(stub.calls.length, 3);
      } finally {
        stub.restore();
      }
    });
  }

  for (const status of [400, 401, 403, 404, 422]) {
    it(`does not retry a ${status}`, async () => {
      const stub = stubFetch([{ status, headers: NOW_HEADERS }]);
      try {
        await assert.rejects(
          sleeper.league("123"),
          (err: unknown) => err instanceof SleeperApiError && err.status === status,
        );
        // A 404 is an answer, not a failure. Retrying it burns the run budget.
        assert.equal(stub.calls.length, 1);
      } finally {
        stub.restore();
      }
    });
  }

  it("returns the payload once a retried request succeeds", async () => {
    const stub = stubFetch([
      { status: 429, headers: NOW_HEADERS },
      { status: 200, body: JSON.stringify({ league_id: "123" }) },
    ]);
    try {
      const league = await sleeper.league("123");
      assert.equal(league.league_id, "123");
      assert.equal(stub.calls.length, 2);
    } finally {
      stub.restore();
    }
  });

  it("retries without a Retry-After header, on its own backoff", async () => {
    const stub = stubFetch([{ status: 503 }]);
    try {
      await assert.rejects(sleeper.matchups("123", 4));
      assert.equal(stub.calls.length, 3);
    } finally {
      stub.restore();
    }
  });

  it("stops when the server asks for a longer pause than the run will hold", async () => {
    const stub = stubFetch([{ status: 429, headers: { "retry-after": "600" } }]);
    try {
      await assert.rejects(
        sleeper.league("123"),
        (err: unknown) => err instanceof SleeperApiError && err.status === 429,
      );
      // 600s is past the ceiling, so retrying early would only earn a second
      // 429. The client surfaces the error instead.
      assert.equal(stub.calls.length, 1);
    } finally {
      stub.restore();
    }
  });

  it("hits the endpoint the caller asked for", async () => {
    const stub = stubFetch([{ status: 200, body: "[]" }]);
    try {
      await sleeper.matchups("999", 7);
      assert.equal(stub.calls[0], "https://api.sleeper.app/v1/league/999/matchups/7");
    } finally {
      stub.restore();
    }
  });
});
