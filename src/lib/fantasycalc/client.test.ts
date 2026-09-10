import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FantasyCalcApiError, fetchValues, tepMultiplier } from "./client";
import type { FantasyCalcParams } from "./types";

/**
 * The retry rules live in both API clients, so both are tested. Nothing here
 * touches the network: `globalThis.fetch` is replaced per case and restored
 * afterwards, and retryable answers carry `Retry-After: 0` so no wait happens.
 */
interface StubResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

interface FetchStub {
  calls: string[];
  restore: () => void;
}

function stubFetch(plan: readonly StubResponse[]): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    calls.push(String(input));
    const spec = plan[Math.min(calls.length, plan.length) - 1] ?? {
      status: 500,
    };
    return Promise.resolve(
      new Response(spec.body ?? "[]", {
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

const PARAMS: FantasyCalcParams = {
  isDynasty: true,
  numQbs: 2,
  numTeams: 12,
  ppr: 1,
};

describe("fantasycalc client retry classification", () => {
  for (const status of [429, 500, 503]) {
    it(`retries a ${status} up to the attempt ceiling`, async () => {
      const stub = stubFetch([{ status, headers: NOW_HEADERS }]);
      try {
        await assert.rejects(
          fetchValues(PARAMS),
          (err: unknown) => err instanceof FantasyCalcApiError && err.status === status,
        );
        assert.equal(stub.calls.length, 3);
      } finally {
        stub.restore();
      }
    });
  }

  for (const status of [400, 404, 422]) {
    it(`does not retry a ${status}`, async () => {
      const stub = stubFetch([{ status, headers: NOW_HEADERS }]);
      try {
        await assert.rejects(
          fetchValues(PARAMS),
          (err: unknown) => err instanceof FantasyCalcApiError && err.status === status,
        );
        assert.equal(stub.calls.length, 1);
      } finally {
        stub.restore();
      }
    });
  }

  it("returns the payload once a retried request succeeds", async () => {
    const stub = stubFetch([
      { status: 429, headers: NOW_HEADERS },
      { status: 200, body: "[]" },
    ]);
    try {
      const values = await fetchValues(PARAMS);
      assert.deepEqual(values, []);
      assert.equal(stub.calls.length, 2);
    } finally {
      stub.restore();
    }
  });

  it("sends the league shape as query parameters", async () => {
    const stub = stubFetch([{ status: 200, body: "[]" }]);
    try {
      await fetchValues(PARAMS);
      const url = new URL(stub.calls[0] ?? "");
      assert.equal(url.searchParams.get("isDynasty"), "true");
      assert.equal(url.searchParams.get("numQbs"), "2");
      assert.equal(url.searchParams.get("numTeams"), "12");
      assert.equal(url.searchParams.get("ppr"), "1");
    } finally {
      stub.restore();
    }
  });
});

describe("tepMultiplier", () => {
  it("is neutral when the league has no TE premium", () => {
    assert.equal(tepMultiplier(0), 1);
    assert.equal(tepMultiplier(-1), 1);
    assert.equal(tepMultiplier(Number.NaN), 1);
  });

  it("scales with the bonus", () => {
    assert.equal(tepMultiplier(0.5), 1.25);
    assert.equal(tepMultiplier(1), 1.5);
  });
});
