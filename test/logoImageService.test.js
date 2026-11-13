const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLogoImagePrompt,
  buildFallbackLogoSvg,
  createLogoSvg,
  createLogoImageService,
} = require("../services/logo/logoImageService");

const design = {
  companyName: "Private Brand",
  companyType: "artisan bakery",
  fullName: "Private Owner",
  dateOfBirth: "1995-08-23",
  location: "Private City",
  variants: [
    {
      id: "monogram",
      style: "monogram",
      motif: "sun",
      monogram: "PB",
      companyType: "artisan bakery",
      colors: {
        primary: "#E8850C",
        secondary: "#F6C453",
        accent: "#7C2D12",
        ink: "#3D250C",
      },
    },
    {
      id: "emblem",
      style: "emblem",
      motif: "moon",
      monogram: "PB",
      companyType: "artisan bakery",
      colors: {
        primary: "#4C6C8F",
        secondary: "#9CC0DC",
        accent: "#0EA5E9",
        ink: "#1E293B",
      },
    },
    {
      id: "wordmark",
      style: "wordmark",
      motif: "lotus",
      monogram: "PB",
      companyType: "artisan bakery",
      colors: {
        primary: "#6D28D9",
        secondary: "#C4B5FD",
        accent: "#DB2777",
        ink: "#2E1065",
      },
    },
  ],
};

const vectorResponse = () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          shapes: [
            { type: "circle", cx: 50, cy: 50, r: 36, fill: "primary" },
            {
              type: "path",
              d: "M 50 18 L 76 72 L 24 72 Z",
              fill: "secondary",
              stroke: "ink",
              strokeWidth: 2,
            },
          ],
        }),
      },
    },
  ],
});

test("logo image prompts use the art direction but omit personal details", () => {
  const prompt = buildLogoImagePrompt(design.variants[0]);

  assert.match(prompt, /clear, readable company-initial monogram/);
  assert.match(prompt, /Use the initials "PB" clearly and legibly/);
  assert.match(prompt, /Business category .*artisan bakery/);
  assert.match(prompt, /bread loaf, coffee cup/);
  assert.match(prompt, /numerology motif is optional/);
  assert.match(prompt, /Use only 2-5 shapes/);
  assert.match(prompt, /Do not make abstract concept art/);
  assert.match(prompt, /artisan bakery/);
  assert.match(prompt, /#E8850C/);
  assert.match(prompt, /No text elements, labels/);
  assert.doesNotMatch(
    prompt,
    /Private Brand|Private Owner|1995-08-23|Private City/,
  );

  assert.match(
    buildLogoImagePrompt(design.variants[1]),
    /one clear business symbol paired with small, readable company initials/,
  );
  assert.match(
    buildLogoImagePrompt(design.variants[2]),
    /one simple business symbol designed to sit beside the company name/,
  );
  assert.doesNotMatch(buildLogoImagePrompt(design.variants[2]), /initials "PB"/);
});

test("builds safe SVG artwork from validated vector shapes", () => {
  const svg = createLogoSvg(
    vectorResponse().choices[0].message.content,
    design.variants[0],
  );

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /fill="#E8850C"/);
  assert.match(svg, /<path d="M 50 18 L 76 72 L 24 72 Z"/);
  assert.throws(
    () =>
      createLogoSvg(
        JSON.stringify({
          shapes: [{ type: "path", d: 'M 0 0"/><script>alert(1)</script>', fill: "primary" }],
        }),
        design.variants[0],
      ),
    { statusCode: 502 },
  );
});

test("builds valid fallback artwork for each generated logo direction", () => {
  const outputs = design.variants.map((variant) => buildFallbackLogoSvg(variant));
  for (const svg of outputs) {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<(path|circle|polygon) /);
  }
  assert.match(outputs[0], /<text[^>]*>PB<\/text>/);
  assert.match(outputs[1], /<text[^>]*>PB<\/text>/);
  assert.doesNotMatch(outputs[2], /<text/);
});

test("generates and stores artwork for each direction", async () => {
  const prompts = [];
  const uploads = [];
  let activeGenerations = 0;
  let maxActiveGenerations = 0;
  const service = createLogoImageService({
    model: "test-image-model",
    aiClient: {
      chat: {
        completions: {
          create: async ({ model, messages }) => {
            assert.equal(model, "test-image-model");
            prompts.push(messages[1].content);
            activeGenerations += 1;
            maxActiveGenerations = Math.max(
              maxActiveGenerations,
              activeGenerations,
            );
            await new Promise((resolve) => setTimeout(resolve, 1));
            activeGenerations -= 1;
            return vectorResponse();
          },
        },
      },
    },
    uploadImage: async (buffer, userId, variantId) => {
      uploads.push({ buffer, userId, variantId });
      return {
        secure_url: `https://cdn.example/${variantId}.png`,
        public_id: `logos/${variantId}`,
      };
    },
  });

  const result = await service(design, "user-123");

  assert.equal(prompts.length, 3);
  assert.equal(maxActiveGenerations, 1);
  assert.equal(uploads.length, 3);
  assert.ok(
    uploads.every((upload) => upload.buffer.toString().startsWith("<svg")),
  );
  assert.ok(
    uploads.every((upload) => upload.buffer.toString().includes("L 76 72")),
  );
  assert.deepEqual(
    result.variants.map((variant) => variant.imageUrl),
    [
      "https://cdn.example/monogram.png",
      "https://cdn.example/emblem.png",
      "https://cdn.example/wordmark.png",
    ],
  );
  assert.ok(uploads.every((upload) => upload.userId === "user-123"));
  assert.ok(uploads.every((upload) => upload.buffer.toString().includes("<circle")));
  assert.equal(result.companyName, design.companyName);
});

test("uses a motif fallback instead of failing when the model returns invalid shapes", async () => {
  const uploads = [];
  const service = createLogoImageService({
    aiClient: {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify({ shapes: [] }) } }],
          }),
        },
      },
    },
    uploadImage: async (buffer, _, variantId) => {
      uploads.push({ buffer, variantId });
      return {
        secure_url: `https://cdn.example/${variantId}.png`,
        public_id: `logos/${variantId}`,
      };
    },
  });

  const result = await service(design, "user-123");

  assert.equal(uploads.length, design.variants.length);
  assert.ok(uploads.every(({ buffer }) => buffer.toString().startsWith("<svg")));
  assert.ok(result.variants.every((variant) => variant.imageUrl));
});

test("retries transient 429 responses with bounded backoff", async () => {
  let attempts = 0;
  const waits = [];
  const service = createLogoImageService({
    aiClient: {
      chat: {
        completions: {
          create: async () => {
            attempts += 1;
            if (attempts === 1) {
              const error = new Error("Too many requests");
              error.name = "RateLimitError";
              error.status = 429;
              error.headers = { get: () => null };
              throw error;
            }
            return vectorResponse();
          },
        },
      },
    },
    uploadImage: async (_, __, variantId) => ({
      secure_url: `https://cdn.example/${variantId}.png`,
      public_id: `logos/${variantId}`,
    }),
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  await service(design, "user-123");

  assert.equal(attempts, 4);
  assert.deepEqual(waits, [1000]);
});

test("retries temporary 503 model outages with bounded backoff", async () => {
  let attempts = 0;
  const waits = [];
  const service = createLogoImageService({
    aiClient: {
      chat: {
        completions: {
          create: async () => {
            attempts += 1;
            if (attempts === 1) {
              const error = new Error(
                "This model is currently experiencing high demand.",
              );
              error.name = "ApiError";
              error.status = 503;
              error.error = { status: "UNAVAILABLE" };
              throw error;
            }
            return vectorResponse();
          },
        },
      },
    },
    uploadImage: async (_, __, variantId) => ({
      secure_url: `https://cdn.example/${variantId}.png`,
      public_id: `logos/${variantId}`,
    }),
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  await service(design, "user-123");

  assert.equal(attempts, 4);
  assert.deepEqual(waits, [1000]);
});

test("serializes concurrent logo-generation requests", async () => {
  let activeGenerations = 0;
  let maxActiveGenerations = 0;
  const service = createLogoImageService({
    aiClient: {
      chat: {
        completions: {
          create: async () => {
            activeGenerations += 1;
            maxActiveGenerations = Math.max(
              maxActiveGenerations,
              activeGenerations,
            );
            await new Promise((resolve) => setTimeout(resolve, 1));
            activeGenerations -= 1;
            return vectorResponse();
          },
        },
      },
    },
    uploadImage: async (_, __, variantId) => ({
      secure_url: `https://cdn.example/${variantId}.png`,
      public_id: `logos/${variantId}`,
    }),
  });

  await Promise.all([
    service(design, "user-123"),
    service(design, "user-456"),
  ]);

  assert.equal(maxActiveGenerations, 1);
});

test("returns a clear 429 when the provider quota is exhausted", async () => {
  let attempts = 0;
  const service = createLogoImageService({
    aiClient: {
      chat: {
        completions: {
          create: async () => {
            attempts += 1;
            const error = new Error("Resource exhausted");
            error.name = "RateLimitError";
            error.status = 429;
            error.error = { message: "Quota exceeded for this model" };
            throw error;
          },
        },
      },
    },
    uploadImage: async () => {
      throw new Error("Should not upload without generated artwork.");
    },
    sleep: async () => {
      throw new Error("An exhausted quota should not be retried.");
    },
  });

  await assert.rejects(service(design, "user-123"), {
    statusCode: 429,
    message: /quota is exhausted/i,
  });
  assert.equal(attempts, 1);
});

test("does not return a vector-only result when image generation is unconfigured", async () => {
  const service = createLogoImageService({
    aiClient: null,
    uploadImage: null,
  });

  await assert.rejects(service(design, "user-123"), {
    statusCode: 503,
    message: /GROQ_API_KEY/,
  });
});
