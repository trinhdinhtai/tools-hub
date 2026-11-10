import { describe, expect, it } from "vitest";
import { MAX_LENGTH, redact, restore } from "./logic";

function redacted(text: string) {
  const result = redact(text);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("redact", () => {
  it("replaces an email with a placeholder, the same value with the same placeholder", () => {
    const result = redacted("Mail ana@example.com, then ana@example.com again, or bo@example.org.");
    expect(result.text).toBe("Mail [EMAIL_1], then [EMAIL_1] again, or [EMAIL_2].");
    expect(result.redactions).toEqual([
      { placeholder: "[EMAIL_1]", value: "ana@example.com", kind: "email" },
      { placeholder: "[EMAIL_2]", value: "bo@example.org", kind: "email" },
    ]);
  });
});

// Fake secrets in the shape of real ones, put together here so no scanner takes this file for a leak.
const AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";
const GITHUB_TOKEN = "ghp" + "_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
const GITHUB_PAT = "github" + "_pat_" + "11ABCDEFG0" + "x".repeat(72);
const STRIPE_KEY = "sk" + "_live_" + "4eC39HqLyjWDarjtT1zdp7dc";
const JWT = "eyJ" + "hbGciOiJIUzI1NiJ9" + ".eyJ" + "zdWIiOiIxMjM0In0" + ".c2lnbmF0dXJlLWhlcmU";
const PEM = ["-----BEGIN " + "RSA PRIVATE KEY-----", "MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn", "-----END RSA PRIVATE KEY-----"].join("\n");

describe("redact common secrets", () => {
  it.each([
    ["an AWS access key", `aws_key: ${AWS_KEY}`, "aws_key: [AWS_KEY_1]"],
    ["a GitHub token", `token ${GITHUB_TOKEN} ok`, "token [GITHUB_TOKEN_1] ok"],
    ["a GitHub fine-grained token", `use ${GITHUB_PAT}`, "use [GITHUB_TOKEN_1]"],
    ["a Stripe secret key", `Stripe: ${STRIPE_KEY}.`, "Stripe: [STRIPE_KEY_1]."],
    ["a JWT", `Authorization: Bearer ${JWT}`, "Authorization: Bearer [JWT_1]"],
    ["a PEM private key", `key:\n${PEM}\nend`, "key:\n[PRIVATE_KEY_1]\nend"],
  ])("hides %s", (_, text, expected) => {
    expect(redacted(text).text).toBe(expected);
  });
});

const OPENAI_KEY = "sk-" + "proj-" + "Ab12Cd34Ef56Gh78Ij90Kl12Mn34";
const ANTHROPIC_KEY = "sk-" + "ant-api03-" + "Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2";
const GOOGLE_KEY = "AIza" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
const PGP = ["-----BEGIN PGP " + "PRIVATE KEY BLOCK-----", "lQOYBGXyz", "-----END PGP PRIVATE KEY BLOCK-----"].join("\n");
const WEBHOOK_SECRET = "whsec" + "_" + "MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const SLACK_TOKEN ="xoxb" + "-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx";

describe("redact passwords and API keys", () => {
  it.each([
    ["a password set in config", "DB_PASSWORD=hunter2!x\nDB_USER=app", "DB_PASSWORD=[PASSWORD_1]\nDB_USER=app"],
    ["a quoted password in JSON", '{"password": "p@ss w0rd", "user": "an"}', '{"password": "[PASSWORD_1]", "user": "an"}'],
    ["a secret in YAML", "client_secret: s3cr3tValue\nname: x", "client_secret: [SECRET_1]\nname: x"],
    ["an api_key assignment", "api_key = 'abcdef123456'", "api_key = '[SECRET_1]'"],
    ["the password of a connection URL", "postgres://app:Sup3rS3cret@db:5432/main", "postgres://app:[PASSWORD_1]@db:5432/main"],
    ["an OpenAI key", `OPENAI ${OPENAI_KEY}`, "OPENAI [API_KEY_1]"],
    ["an Anthropic key", `key ${ANTHROPIC_KEY}`, "key [API_KEY_1]"],
    ["a Google API key", `maps ${GOOGLE_KEY}`, "maps [API_KEY_1]"],
    ["a Slack token", `slack ${SLACK_TOKEN}`, "slack [API_KEY_1]"],
  ])("hides %s", (_, text, expected) => {
    expect(redacted(text).text).toBe(expected);
  });

  it.each([
    ["a Vietnamese password key", "mật khẩu: Abc@12345\nmat_khau=Xyz98765", "mật khẩu: [PASSWORD_1]\nmat_khau=[PASSWORD_2]"],
    ["a PGP private key", `x\n${PGP}\ny`, "x\n[PRIVATE_KEY_1]\ny"],
    ["a Stripe webhook secret", `hook ${WEBHOOK_SECRET}`, "hook [STRIPE_KEY_1]"],
    ["a Vietnamese ID number named as such", "Số CCCD: 001234567890, CMND 123456789", "Số CCCD: [ID_NUMBER_1], CMND [ID_NUMBER_2]"],
  ])("hides %s", (_, text, expected) => {
    expect(redacted(text).text).toBe(expected);
  });

  it("leaves code that only names a secret, with a type or an empty value, alone", () => {
    const code = [
      "interface Auth { token: string; password?: string }",
      "let secret = null;",
      "const apiKey = process.env.API_KEY;",
      "password: undefined,",
      "token = None",
    ].join("\n");
    expect(redacted(code).text).toBe(code);
  });

  it("numbers the placeholders of a kind in the order they appear in the text", () => {
    const result = redacted("DB_PASSWORD=hunter2x\npostgres://app:Sup3r@db/main\nadmin_password: Hunter3y");
    expect(result.text).toBe("DB_PASSWORD=[PASSWORD_1]\npostgres://app:[PASSWORD_2]@db/main\nadmin_password: [PASSWORD_3]");
    expect(result.redactions.map((r) => [r.placeholder, r.value])).toEqual([
      ["[PASSWORD_1]", "hunter2x"],
      ["[PASSWORD_2]", "Sup3r"],
      ["[PASSWORD_3]", "Hunter3y"],
    ]);
  });

  it("hides a token once, even when it is also the value of a secret key", () => {
    const result = redacted(`GITHUB_TOKEN=${GITHUB_TOKEN}`);
    expect(result.text).toBe("GITHUB_TOKEN=[GITHUB_TOKEN_1]");
    expect(result.redactions).toHaveLength(1);
  });

  it("leaves a key with no value, or words that only mention passwords, alone", () => {
    expect(redacted("password:\nThe password policy is strict.").text).toBe("password:\nThe password policy is strict.");
  });
});

describe("redact personal data", () => {
  it.each([
    ["an email with Vietnamese letters", "Gửi nguyễn.an@ví-dụ.vn nhé", "Gửi [EMAIL_1] nhé"],
    ["an international phone number", "Call +84 912 345 678 or +1 (415) 555-0132.", "Call [PHONE_1] or [PHONE_2]."],
    ["a Vietnamese mobile number", "SĐT: 0912345678, 0912.345.678", "SĐT: [PHONE_1], [PHONE_2]"],
    ["a card number", "Card 4111 1111 1111 1111 exp 12/29", "Card [CARD_1] exp 12/29"],
    ["an IPv4 address", "from 203.0.113.42 to 10.0.0.1", "from [IP_1] to [IP_2]"],
  ])("hides %s", (_, text, expected) => {
    expect(redacted(text).text).toBe(expected);
  });

  it("leaves numbers that only look alike alone", () => {
    const text = "Order 1234 5678 9012 3456 shipped on 2024-05-01, version 1.2.3, total 1,234,567 VND, port 8080.";
    expect(redacted(text).text).toBe(text);
  });
});

describe("redact edge cases", () => {
  it("finds nothing in an empty text or one without secrets", () => {
    expect(redact("")).toEqual({ ok: true, text: "", redactions: [] });
    expect(redact("Xin chào, thế giới! 👋")).toEqual({ ok: true, text: "Xin chào, thế giới! 👋", redactions: [] });
  });

  it("never gives out a placeholder the text already holds, so restoring cannot mistake it", () => {
    const result = redacted("Template [EMAIL_1] goes to ana@example.com");
    expect(result.text).toBe("Template [EMAIL_1] goes to [EMAIL_2]");
    expect(restore(result.text, result.redactions).text).toBe("Template [EMAIL_1] goes to ana@example.com");
  });

  it("keeps private use characters of the text as they are", () => {
    const odd = String.fromCharCode(0xe000) + "42" + String.fromCharCode(0xe001);
    const text = `odd ${odd} chars, mail ana@example.com`;
    expect(redacted(text).text).toBe(`odd ${odd} chars, mail [EMAIL_1]`);
  });

  it("refuses a text too large to scan", () => {
    expect(redact("x".repeat(MAX_LENGTH + 1))).toEqual({ ok: false, reason: "too-large" });
  });

  it("scans a large text quickly", () => {
    const line = `user ${"ana@example.com"} logged in from 203.0.113.42 with token ${GITHUB_TOKEN}\n`;
    const text = line.repeat(10_000);
    const started = performance.now();
    const result = redacted(text);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(result.redactions).toHaveLength(3);
    expect(result.text.split("\n")[0]).toBe("user [EMAIL_1] logged in from [IP_1] with token [GITHUB_TOKEN_1]");
  });
});

describe("restore", () => {
  it("puts the original values back in place of their placeholders", () => {
    const { redactions } = redacted("Mail ana@example.com or bo@example.org.");
    expect(restore("Sure, I wrote to [EMAIL_2] and cc'd [EMAIL_1].", redactions)).toEqual({
      text: "Sure, I wrote to bo@example.org and cc'd ana@example.com.",
      restored: 2,
      unknown: [],
    });
  });

  it("restores a whole round trip, secrets of every kind included", () => {
    const original = `key ${AWS_KEY}\n${PEM}\npostgres://app:Sup3r@db/main\nCall +84 912 345 678`;
    const { text, redactions } = redacted(original);
    expect(text).not.toContain("Sup3r");
    expect(restore(text, redactions)).toMatchObject({ text: original, restored: 4, unknown: [] });
  });

  it("leaves placeholders it did not make as they are, and lists them once", () => {
    const { redactions } = redacted("Mail ana@example.com");
    expect(restore("[EMAIL_1] and [EMAIL_9], [PHONE_2], [EMAIL_9]", redactions)).toEqual({
      text: "ana@example.com and [EMAIL_9], [PHONE_2], [EMAIL_9]",
      restored: 1,
      unknown: ["[EMAIL_9]", "[PHONE_2]"],
    });
  });

  it("recognises a placeholder the AI wrote in other case or with spaces inside the brackets", () => {
    const { redactions } = redacted("Mail ana@example.com");
    expect(restore("Hi [email_1], [ EMAIL_1 ] and [Email_1]; not [email_2]", redactions)).toEqual({
      text: "Hi ana@example.com, ana@example.com and ana@example.com; not [email_2]",
      restored: 3,
      unknown: ["[email_2]"],
    });
  });

  it("changes nothing when there is nothing to restore", () => {
    expect(restore("", [])).toEqual({ text: "", restored: 0, unknown: [] });
    expect(restore("no placeholders here", [])).toEqual({ text: "no placeholders here", restored: 0, unknown: [] });
  });
});
