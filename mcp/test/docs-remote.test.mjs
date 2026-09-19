import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOsDoc, loadOsDocList, resolveDocsSource } from "../dist/docs.js";

describe("published docs source (no local clone)", () => {
  let close;

  it("fetches OS docs from BOOTSTRAP_OS_DOCS_BASE without company-os on disk", async () => {
    const empty = path.join(os.tmpdir(), `bootstrap-docs-empty-${process.pid}`);
    process.env.BOOTSTRAP_OS_ROOT = empty;
    process.env.BOOTSTRAP_OS_DOCS_SOURCE = "published";

    const fixture = await new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        if (req.url?.includes("ai-instructions.md")) {
          res.writeHead(200, { "Content-Type": "text/markdown" });
          res.end("# Remote AI instructions\nHard rules.\n");
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        resolve({
          base: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise((res, rej) => server.close((e) => (e ? rej(e) : res()))),
        });
      });
      server.once("error", reject);
    });
    close = fixture.close;
    process.env.BOOTSTRAP_OS_DOCS_BASE = fixture.base;

    assert.equal(resolveDocsSource(), "published");
    const list = await loadOsDocList();
    assert.equal(list.length, 7);
    assert.equal(list[0].source, "published");
    const body = await loadOsDoc("ai-instructions");
    assert.match(body, /Remote AI instructions/);
  });

  after(async () => {
    if (close) await close();
    delete process.env.BOOTSTRAP_OS_DOCS_SOURCE;
    delete process.env.BOOTSTRAP_OS_DOCS_BASE;
  });
});
