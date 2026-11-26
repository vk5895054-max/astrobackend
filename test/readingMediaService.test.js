const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  UPLOAD_ROOT,
  deleteReadingMedia,
  persistReadingImages,
} = require("../services/readingMediaService");

const directory = path.join(
  UPLOAD_ROOT,
  "graphology",
  `test-${crypto.randomUUID()}`,
);

test.after(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

test("deleting a locally stored reading report also removes its photo", async () => {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, "sample.png");
  await fs.writeFile(file, Buffer.from("sample-bytes"));
  const url = `/uploads/readings/graphology/${path.basename(directory)}/sample.png`;

  assert.equal(await deleteReadingMedia({ provider: "local", url }), true);
  await assert.rejects(() => fs.access(file), { code: "ENOENT" });
});

test("local deletion cannot escape the reading upload directory", async () => {
  assert.equal(
    await deleteReadingMedia({
      provider: "local",
      url: "/uploads/readings/../../etc/passwd",
    }),
    false,
  );
});

test("partial multi-image uploads are cleaned up when a later image fails", async () => {
  const good = {
    buffer: Buffer.from("image"),
    mimetype: "image/png",
    originalname: "first.png",
    size: 5,
  };
  const bad = { ...good, buffer: null };

  await assert.rejects(() =>
    persistReadingImages([good, bad], "partial-cleanup-test", "graphology"),
  );

  const userDir = path.join(UPLOAD_ROOT, "graphology", "partial-cleanup-test");
  assert.deepEqual(await fs.readdir(userDir), []);
  await fs.rm(userDir, { recursive: true, force: true });
});
