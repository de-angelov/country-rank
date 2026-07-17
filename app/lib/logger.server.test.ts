import { describe, expect, it } from "vitest";

import {
  createApplicationLogger,
  defaultLogLevel,
  getLogLevel,
  redactedLogValue,
  sensitiveLogRedactionPaths,
} from "./logger.server";

const createMemoryLogStream = () => {
  const lines: string[] = [];

  return {
    lines,
    stream: {
      write: (line: string) => {
        lines.push(line);
      },
    },
  };
};

describe("getLogLevel", () => {
  it("defaults to info when LOG_LEVEL is not configured", () => {
    expect(getLogLevel({})).toBe(defaultLogLevel);
  });

  it("uses a configured supported LOG_LEVEL", () => {
    expect(getLogLevel({ LOG_LEVEL: " debug " })).toBe("debug");
    expect(getLogLevel({ LOG_LEVEL: "SILENT" })).toBe("silent");
  });

  it("falls back to info when LOG_LEVEL is not supported", () => {
    expect(getLogLevel({ LOG_LEVEL: "verbose" })).toBe(defaultLogLevel);
  });
});

describe("createApplicationLogger", () => {
  it("writes structured JSON log lines with the configured level", () => {
    const output = createMemoryLogStream();
    const logger = createApplicationLogger({
      env: { LOG_LEVEL: "trace" },
      stream: output.stream,
    });

    logger.trace({ countryCode: "BG" }, "country total loaded");

    expect(output.lines).toHaveLength(1);
    expect(JSON.parse(output.lines[0] ?? "{}")).toMatchObject({
      level: 10,
      countryCode: "BG",
      msg: "country total loaded",
    });
  });

  it("redacts configured sensitive structured fields before writing logs", () => {
    const output = createMemoryLogStream();
    const logger = createApplicationLogger({
      env: { LOG_LEVEL: "info" },
      stream: output.stream,
    });

    logger.info({
      authorization: "Bearer app-token",
      headers: {
        cookie: "session=abc",
        "stripe-signature": "sig_secret",
      },
      STRIPE_SECRET_KEY: "sk_test_secret",
      stripe: {
        webhookSecret: "whsec_secret",
        rawPayload: "raw-stripe-payload",
      },
      rawBody: "raw-request-body",
      card: {
        number: "4242424242424242",
      },
      paymentMethod: {
        id: "pm_secret",
      },
      safeField: "country-ranking",
    });

    expect(output.lines).toHaveLength(1);

    const logLine = output.lines[0] ?? "";
    const parsedLog = JSON.parse(logLine);

    expect(parsedLog).toMatchObject({
      authorization: redactedLogValue,
      headers: {
        cookie: redactedLogValue,
        "stripe-signature": redactedLogValue,
      },
      STRIPE_SECRET_KEY: redactedLogValue,
      stripe: {
        webhookSecret: redactedLogValue,
        rawPayload: redactedLogValue,
      },
      rawBody: redactedLogValue,
      card: redactedLogValue,
      paymentMethod: redactedLogValue,
      safeField: "country-ranking",
    });
    expect(logLine).not.toContain("Bearer app-token");
    expect(logLine).not.toContain("sk_test_secret");
    expect(logLine).not.toContain("whsec_secret");
    expect(logLine).not.toContain("raw-stripe-payload");
    expect(logLine).not.toContain("4242424242424242");
  });

  it("keeps explicit redaction paths for expected secret categories", () => {
    expect(sensitiveLogRedactionPaths).toEqual(
      expect.arrayContaining([
        "headers.authorization",
        "headers.cookie",
        'headers["stripe-signature"]',
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "stripe.secretKey",
        "stripe.webhookSecret",
        "rawBody",
        "rawWebhookPayload",
        "card",
        "paymentMethod",
      ]),
    );
  });
});
