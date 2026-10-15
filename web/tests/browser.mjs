import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { decodeAbiParameters, parseAbiParameters } from "viem";
import {
  createFixture,
  installWallet,
  manifest,
  account,
  vault,
  token,
} from "./mock-chain.mjs";
const root = resolve(import.meta.dirname, "../.."),
  dist = resolve(root, "dist"),
  out = resolve(root, "docs/frontend");
await mkdir(resolve(out, "screenshots"), { recursive: true });
let fixture = createFixture();
const contentTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
async function rpc(input) {
  async function one(r) {
    try {
      return { jsonrpc: "2.0", id: r.id, result: await fixture.handle(r) };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: r.id,
        error: {
          code: e.code ?? -32000,
          message: e.message ?? "Mock error",
          ...(e.data ? { data: e.data } : {}),
        },
      };
    }
  }
  return Array.isArray(input) ? Promise.all(input.map(one)) : one(input);
}
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/mock-wallet") {
      let text = "";
      for await (const c of req) text += c;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(await rpc(JSON.parse(text))));
      return;
    }
    let path = decodeURIComponent(
      new URL(req.url, "http://test").pathname,
    ).replace(/^\/preview\//, "");
    if (!path || path === "/") path = "index.html";
    const file = resolve(dist, path);
    if (!file.startsWith(dist + "/")) throw new Error("bad path");
    res.setHeader(
      "content-type",
      contentTypes[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [],
  errors = [],
  requests = [];
let browser;
const test = async (name, fn) => {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log("PASS", name);
  } catch (e) {
    results.push({
      name,
      passed: false,
      error: e.message,
      durationMs: Date.now() - start,
    });
    console.error("FAIL", name, e.stack);
    throw e;
  }
};
async function pageFor(opts = {}, wallet) {
  fixture = createFixture(opts);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.stack);
  });
  page.on("response", (r) => {
    if (r.url().startsWith(base) && r.status() >= 400)
      requests.push({ url: new URL(r.url()).pathname, status: r.status() });
  });
  await page.route("https://**/*", async (route) => {
    if (
      manifest.network.rpcUrls.some((u) => route.request().url().startsWith(u))
    ) {
      const body = await rpc(route.request().postDataJSON());
      await route.fulfill({ json: body });
    } else await route.abort();
  });
  if (wallet) await installWallet(page, wallet === true ? {} : wallet);
  await page.goto(base);
  await page
    .getByText("800,000,000 BEG in the free vault", { exact: true })
    .waitFor()
    .catch(async (e) => {
      if (!opts.free && opts.free !== 0n) throw e;
      await page
        .getByText("Vault opening soon", { exact: true })
        .first()
        .waitFor();
    });
  return page;
}
async function connect(page) {
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Mock Wallet", exact: true }).click();
  await page
    .locator(".wallet-button")
    .filter({ hasText: /0x|Switch/ })
    .waitFor();
  await page.waitForTimeout(100);
}
async function enabled(locator) {
  await locator.waitFor();
  await locator
    .page()
    .waitForFunction((el) => !el.disabled, await locator.elementHandle());
}
async function confirm(page, label) {
  const previous = await page
    .getByText("Confirmed on Ethereum. State refreshed.", { exact: true })
    .count();
  const button = page.getByRole("button", { name: label, exact: true });
  await enabled(button);
  await button.click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Confirm / })
    .click();
  await page.waitForFunction(
    (count) =>
      [...document.querySelectorAll(".tx-feedback p")].filter(
        (p) => p.textContent === "Confirmed on Ethereum. State refreshed.",
      ).length > count,
    previous,
  );
}
async function closePage(page) {
  await page.context().close();
}
try {
  browser = await chromium.launch({ headless: true });
  await test("Static subpath, first screen, reflow at 320/390/768/1440 and metadata", async () => {
    const page = await pageFor();
    assert(
      await page.getByRole("button", { name: "Beg", exact: true }).isDisabled(),
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => document.fonts.ready);
      const box = await page
        .getByRole("button", { name: "Beg", exact: true })
        .boundingBox();
      if (width === 390) assert(box.y + box.height < 844);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow at ${width}`,
      );
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: resolve(out, `screenshots/${width}.png`),
          fullPage: false,
        });
    }
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute("content"),
      "./social.png",
    );
    const axe = await new AxeBuilder({ page }).analyze();
    await writeFile(
      resolve(out, "accessibility.json"),
      JSON.stringify(
        {
          violations: axe.violations,
          passes: axe.passes.length,
          incomplete: axe.incomplete.map((x) => ({
            id: x.id,
            description: x.description,
            nodes: x.nodes.map((n) => ({
              target: n.target,
              html: n.html,
              summary: n.failureSummary,
            })),
          })),
        },
        null,
        2,
      ),
    );
    assert.deepEqual(
      axe.violations.map((v) => v.id),
      [],
    );
    await closePage(page);
  });
  await test("UTF-8 counter, input length and keyboard odds slider", async () => {
    const p = await pageFor();
    await p.getByLabel("Your plea to the swarm").fill("😀".repeat(71));
    assert.equal(
      await p.locator("#byte-count").textContent(),
      "284 / 280 bytes",
    );
    assert.equal(
      await p.getByLabel("Your plea to the swarm").getAttribute("aria-invalid"),
      "true",
    );
    await p.getByRole("slider").focus();
    await p.keyboard.press("End");
    assert.equal(await p.locator("output").textContent(), "100 / 100");
    assert(
      await p.getByRole("cell", { name: "2.00%", exact: true }).isVisible(),
    );
    await closePage(p);
  });
  await test("EIP-6963 picker, keyboard focus return, unknown-chain add and switch", async () => {
    const p = await pageFor({}, { chain: "0x2105", unknown: true });
    await p.getByRole("button", { name: "Connect", exact: true }).click();
    assert.equal(
      await p
        .getByRole("button", { name: "Browser wallet", exact: true })
        .count(),
      0,
    );
    await p.keyboard.press("Escape");
    assert.equal(
      await p.evaluate(() => document.activeElement.textContent),
      "Connect",
    );
    await connect(p);
    await p.waitForFunction(
      () =>
        window.__walletCalls.filter(
          (c) => c.method === "wallet_switchEthereumChain",
        ).length >= 2,
    );
    const calls = await p.evaluate(() => window.__walletCalls);
    assert.deepEqual(
      calls.find((c) => c.method === "wallet_addEthereumChain").params,
      [manifest.walletAddChain],
    );
    await closePage(p);
  });
  await test("Wrong network remains explicit after switch rejection; writes disabled", async () => {
    const p = await pageFor({}, { chain: "0x2105", rejectSwitch: true });
    await connect(p);
    await p
      .getByRole("button", { name: "Switch to Ethereum", exact: true })
      .waitFor();
    await p.getByLabel("Your plea to the swarm").fill("A real test plea");
    assert(
      await p.getByRole("button", { name: "Beg", exact: true }).isDisabled(),
    );
    assert.equal(fixture.s.sent.length, 0);
    await closePage(p);
  });
  await test("Beg simulation, review, exact payment, confirmation and cooldown", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    await p
      .getByLabel("Your plea to the swarm")
      .fill("Spare a token for a test?");
    await confirm(p, "Beg");
    assert.equal(fixture.s.sent.length, 1);
    assert.equal(fixture.s.sent[0].functionName, "attempt");
    assert.equal(BigInt(fixture.s.sent[0].value), 5000000000000000n);
    assert.equal(fixture.s.sent[0].args[0], "Spare a token for a test?");
    assert(
      await p.getByRole("button", { name: "Beg", exact: true }).isDisabled(),
    );
    await p.getByText(/You can beg again in/).waitFor();
    await closePage(p);
  });
  await test("Wallet rejection is recoverable with no broadcast", async () => {
    const p = await pageFor({}, { rejectSend: true });
    await connect(p);
    await p.getByLabel("Your plea to the swarm").fill("An unsigned plea");
    const b = p.getByRole("button", { name: "Beg", exact: true });
    await enabled(b);
    await b.click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm beg", exact: true })
      .click();
    await p
      .getByText("Request declined in your wallet. Nothing was submitted.", {
        exact: true,
      })
      .waitFor();
    assert.equal(fixture.s.sent.length, 0);
    await enabled(b);
    await closePage(p);
  });
  await test("Simulation custom error prevents wallet prompt", async () => {
    const p = await pageFor({ revert: "OracleUnfunded" }, true);
    await connect(p);
    await p
      .getByLabel("Your plea to the swarm")
      .fill("Would close an unfunded oracle");
    const b = p.getByRole("button", { name: "Beg", exact: true });
    await enabled(b);
    await b.click();
    await p.getByText(/oracle request could not be paid or accepted/).waitFor();
    assert.equal(await p.getByRole("dialog").count(), 0);
    assert.equal(fixture.s.sent.length, 0);
    await closePage(p);
  });
  await test("Duplicate messages, active cooldown and unfunded vault block play", async () => {
    for (const opts of [
      { used: true },
      { cooldown: Math.floor(Date.now() / 1000) + 600 },
      { free: 0n },
    ]) {
      const p = await pageFor(opts, true);
      await connect(p);
      await p.getByLabel("Your plea to the swarm").fill("Already tried this");
      if (opts.used)
        await p
          .getByText("This exact message has already been used.", {
            exact: true,
          })
          .waitFor();
      else if (opts.cooldown)
        await p.getByText(/You can beg again in/).waitFor();
      assert(await p.locator(".beg-button").isDisabled());
      await closePage(p);
    }
  });
  await test("Oracle approval and funding are separate exact-amount transactions", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    await confirm(p, "Approve IMD");
    assert.equal(
      fixture.s.sent[0].to.toLowerCase(),
      manifest.network.pairToken.address,
    );
    assert.equal(fixture.s.sent[0].args[0].toLowerCase(), vault.address);
    assert.equal(fixture.s.sent[0].args[1], 500000000000000000n);
    await confirm(p, "Fund oracle");
    assert.equal(fixture.s.sent[1].functionName, "fundOracle");
    assert.equal(fixture.s.sent[1].args[0], 500000000000000000n);
    await closePage(p);
  });
  await test("Expired refund credits ETH; Claim withdraws; messages stay plain text", async () => {
    const p = await pageFor(
      { withHistory: true, batchStatus: 4, age: 90000 },
      true,
    );
    await connect(p);
    await p.locator("#feed blockquote").waitFor();
    assert.equal(await p.locator("#feed blockquote img").count(), 0);
    assert.equal(await p.evaluate(() => window.injected), undefined);
    await confirm(p, "Refund entry #1");
    assert.equal(fixture.s.creditEth, 5000000000000000n);
    await confirm(p, "Claim prizes and credits");
    assert.equal(fixture.s.creditEth, 0n);
    assert.deepEqual(
      fixture.s.sent.map((s) => s.functionName),
      ["refund", "claim"],
    );
    await closePage(p);
  });
  await test("Keeper close, reveal, rearm and expiry eligibility", async () => {
    for (const [opts, button, fn] of [
      [{ batchSize: 1, age: 1900 }, "Close batch", "closeBatch"],
      [{ batchSize: 1, batchStatus: 2 }, "Reveal", "reveal"],
      [{ batchSize: 1, batchStatus: 2, rearm: true }, "Rearm reveal", "reveal"],
      [{ batchSize: 1, batchStatus: 1, age: 90000 }, "Expire", "expireBatch"],
    ]) {
      const p = await pageFor(opts, true);
      await connect(p);
      await confirm(p, button);
      assert.equal(fixture.s.sent[0].functionName, fn);
      await closePage(p);
    }
  });
  await test("ETH buy uses configured router, exact pool key, minimum output and native value", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    await p.getByLabel("Spend (ETH)").fill("0.01");
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await confirm(p, "Swap ETH for BEG");
    const sent = fixture.s.sent[0];
    assert.equal(
      sent.to.toLowerCase(),
      manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(sent.value), 10000000000000000n);
    assert.equal(sent.args[0], "0x10");
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      sent.args[1][0],
    );
    assert.equal(actions, "0x060c0f");
    const [tuple] = decodeAbiParameters(
      parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),bool,uint128,uint128,bytes)",
      ),
      params[0],
    );
    assert.equal(tuple[0].hooks.toLowerCase(), manifest.poolKey.hooks);
    assert.equal(tuple[3], 9950000000000000000n);
    await closePage(p);
  });
  await test("BEG sell requires ERC20 approval, Permit2 router approval, then swap with zero value", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    await p.getByRole("button", { name: "Sell BEG", exact: true }).click();
    await p.getByLabel("Spend (BEG)").fill("1");
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await confirm(p, "Approve BEG");
    await confirm(p, "Authorize router");
    await confirm(p, "Swap BEG for ETH");
    assert.deepEqual(
      fixture.s.sent.map((s) => s.functionName),
      ["approve", "approve", "execute"],
    );
    assert.equal(
      fixture.s.sent[0].args[0].toLowerCase(),
      manifest.network.uniswapV4.permit2,
    );
    assert.equal(
      fixture.s.sent[1].to.toLowerCase(),
      manifest.network.uniswapV4.permit2,
    );
    assert.equal(
      fixture.s.sent[1].args[1].toLowerCase(),
      manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(BigInt(fixture.s.sent[2].value ?? 0), 0n);
    await closePage(p);
  });
  await test("RPC failure leaves cached state visible but disables actions", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    await p
      .getByLabel("Your plea to the swarm")
      .fill("Do not send with stale state");
    await enabled(p.getByRole("button", { name: "Beg", exact: true }));
    fixture.s.failRpc = true;
    await p.getByRole("button", { name: "Refresh", exact: true }).click();
    await p.getByText(/Live reads unavailable/).waitFor();
    assert(
      await p.getByRole("button", { name: "Beg", exact: true }).isDisabled(),
    );
    assert(
      await p
        .getByText("800,000,000 BEG in the free vault", { exact: true })
        .isVisible(),
    );
    await p.reload();
    await p.getByText("Cached", { exact: true }).waitFor();
    await p
      .getByText("800,000,000 BEG in the free vault", { exact: true })
      .waitFor();
    assert(await p.locator(".beg-button").isDisabled());
    await closePage(p);
  });
  await test("Mobile wallet paths and Coinbase Smart Wallet", async () => {
    fixture = createFixture();
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    const p = await ctx.newPage();
    await p.route("https://**/*", async (r) =>
      r.fulfill({ json: await rpc(r.request().postDataJSON()) }),
    );
    await p.goto(base);
    await p.getByRole("button", { name: "Connect", exact: true }).click();
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      assert(
        await p
          .getByRole("link", { name: `Open in ${name}`, exact: false })
          .isVisible(),
      );
    assert(
      await p
        .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
        .isVisible(),
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Browser wallet", exact: true })
        .count(),
      0,
    );
    await p.screenshot({ path: resolve(out, "screenshots/wallet-390.png") });
    await ctx.close();
  });
  await test("Long balance and full-address reflow", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    for (const width of [320, 390]) {
      await p.setViewportSize({ width, height: 844 });
      await p.evaluate(() => {
        document.querySelector(".stats-grid dd").textContent =
          "999,999,999,999,999,999,999,999.99999 BEG";
        document.querySelector(".jackpot strong").textContent =
          "999,999,999,999,999,999.99999 ETH";
      });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p.locator(".wallet-button").click();
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
    }
    await closePage(p);
  });

  await test("Adaptive log ranges recover from a ten-block provider limit", async () => {
    const p = await pageFor({ logRange: 10, withHistory: true });
    await p.waitForFunction(
      () =>
        document.querySelector("#feed>p")?.textContent?.startsWith("Synced"),
      {},
      { timeout: 30000 },
    );
    assert(await p.locator("#feed blockquote").isVisible());
    assert(
      fixture.s.calls.filter((c) => c.method === "eth_getLogs").length > 10,
    );
    await closePage(p);
  });
  await test("Quote expiry and slippage validation prevent stale signing", async () => {
    const p = await pageFor({}, true);
    await connect(p);
    await p.getByLabel("Spend (ETH)").fill("0.01");
    await p.getByLabel("Slippage (%)").fill("0");
    assert(
      await p
        .getByRole("button", { name: "Get quote", exact: true })
        .isDisabled(),
    );
    await p.getByLabel("Slippage (%)").fill("0.5");
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await enabled(
      p.getByRole("button", { name: "Swap ETH for BEG", exact: true }),
    );
    await p.clock.install();
    await p.clock.fastForward(61000);
    await p
      .getByText("Quote expired. Get a fresh quote.", { exact: true })
      .waitFor();
    assert(
      await p
        .getByRole("button", { name: "Swap ETH for BEG", exact: true })
        .isDisabled(),
    );
    assert.equal(fixture.s.sent.length, 0);
    await closePage(p);
  });
  await test("Invalid keeper IDs, 200% text, and reduced motion remain usable", async () => {
    const p = await pageFor({ batchSize: 1, age: 1900 }, true);
    await connect(p);
    await p.getByLabel("Batch number").fill("0");
    assert(
      await p
        .getByRole("button", { name: "Close batch", exact: true })
        .isDisabled(),
    );
    await p
      .getByText("Enter a positive whole batch number.", { exact: true })
      .waitFor();
    await p.getByLabel("Batch number").fill("");
    await p.evaluate(() => (document.documentElement.style.fontSize = "200%"));

    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.emulateMedia({ reducedMotion: "reduce" });
    const duration = await p.locator(".swarm-eye").evaluate((el) => {
      el.classList.add("pulse");
      return getComputedStyle(el).animationName;
    });
    assert.equal(duration, "none");
    await closePage(p);
  });

  await test("Keyboard connection, submission and review with visible focus", async () => {
    const p = await pageFor({}, true);
    await p.getByRole("button", { name: "Connect", exact: true }).focus();
    await p.keyboard.press("Enter");
    await p.getByRole("dialog").waitFor();
    await p.keyboard.press("Tab");
    await p.keyboard.press("Enter");
    await p.locator(".wallet-button").filter({ hasText: /0x/ }).waitFor();
    await p.getByLabel("Your plea to the swarm").focus();
    await p.keyboard.type("A keyboard can beg too.");
    const beg = p.getByRole("button", { name: "Beg", exact: true });
    await enabled(beg);
    await p.keyboard.press("Tab");
    assert(await beg.evaluate((el) => el === document.activeElement));
    await p.screenshot({
      path: resolve(out, "screenshots/keyboard-focus.png"),
    });
    await p.keyboard.press("Enter");
    await p.getByRole("dialog").waitFor();
    await p.keyboard.press("Tab");
    await p.keyboard.press("Tab");
    await p.keyboard.press("Tab");
    await p.keyboard.press("Enter");
    await p
      .getByText("Confirmed on Ethereum. State refreshed.", { exact: true })
      .waitFor();
    assert.equal(fixture.s.sent[0].functionName, "attempt");
    await closePage(p);
  });
  await test("No browser script errors or missing static resources", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
  });
  await browser.close();
  browser = undefined;
  try {
    browser = await webkit.launch({ headless: true });
    await test("WebKit: connect and submit primary action", async () => {
      const p = await pageFor({}, true);
      await connect(p);
      await p
        .getByLabel("Your plea to the swarm")
        .fill("Safari asks the swarm");
      await confirm(p, "Beg");
      assert.equal(fixture.s.sent[0].functionName, "attempt");
      await p.screenshot({ path: resolve(out, "screenshots/webkit-390.png") });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await closePage(p);
    });
  } catch (e) {
    if (results.at(-1)?.name?.startsWith("WebKit:") && !results.at(-1).passed)
      throw e;
    results.push({
      name: "WebKit browser availability",
      passed: false,
      limitation: e.message.slice(0, 1000),
    });
    console.log("WEBKIT UNAVAILABLE", e.message.slice(0, 300));
  }
} catch (e) {
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    resolve(out, "browser-results.json"),
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        mockedRpc: true,
        realTransactions: 0,
        results,
        scriptErrors: errors,
        staticFailures: requests,
      },
      null,
      2,
    ) + "\n",
  );
}
