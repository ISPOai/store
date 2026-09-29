#!/usr/bin/env node

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const candidateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hostRoot = "/Users/venge/Code/weekend2";
const reportRoot = "/Users/venge/.bb/thread-storage/thr_bniun3jd7g/orchestration/reports/W5-render";
const chromiumPackage = `${hostRoot}/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs`;
const chromiumExecutable = "/Users/venge/Code/weekend2/node_modules/.pnpm/electron@43.1.1_supports-color@10.2.2/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
const chromiumFallbackExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function buildFixture(distRoot) {
	const { performOneShotBuild } = await import(`${hostRoot}/apps/desktop/src/main/projects/build-runner-core.ts`);
	const { computeHostNodeModulesPaths } = await import(`${hostRoot}/apps/desktop/src/main/projects/build-host-paths.ts`);
	return performOneShotBuild({
		projectId: "proj_w5_fixture",
		projectRoot: candidateRoot,
		distRoot,
		manifestPath: path.join(candidateRoot, "package.json"),
		manifest: { name: "OpenCut W5 headless fixture", target: "react", appEntry: "scripts/render-fixture/browser-harness.ts" },
		mode: "production",
		requireProjectCommands: false,
		buildId: "w5-headless-render-fixture",
		buildProfile: "inline-v1",
		hostNodeModulesPaths: computeHostNodeModulesPaths({ appPath: path.join(hostRoot, "apps/desktop"), isPackaged: false }),
	});
}

function serveDirectory(directory, callbacks = {}) {
	const server = createServer(async (request, response) => {
		if (request.method === "POST" && (request.url === "/__w5-output" || request.url === "/__w5-result")) {
			const chunks = [];
			for await (const chunk of request) chunks.push(chunk);
			const body = Buffer.concat(chunks);
			if (request.url === "/__w5-output") await callbacks.output?.(body);
			else await callbacks.result?.(body);
			response.writeHead(204).end();
			return;
		}
		const requested = request.url === "/" ? "/index.html" : request.url?.split("?")[0] ?? "/index.html";
		const file = path.resolve(directory, `.${requested}`);
		if (!file.startsWith(`${path.resolve(directory)}${path.sep}`)) {
			response.writeHead(403).end();
			return;
		}
		try {
			const bytes = await readFile(file);
			response.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html" }).end(bytes);
		} catch {
			response.writeHead(404).end();
		}
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function freePort() {
	const probe = createServer();
	return new Promise((resolve, reject) => {
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const port = probe.address().port;
			probe.close((error) => error ? reject(error) : resolve(port));
		});
	});
}

async function waitForCdp(port) {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) return;
		} catch {
			// Electron takes a moment to bind its debugging endpoint.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Electron did not expose CDP on port ${port}`);
}

async function main() {
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "opencut-w5-render-"));
	const distRoot = path.join(temporaryRoot, "dist");
	let server;
	let browser;
	let electronProcess;
	let externalResult;
	try {
		const attestation = await buildFixture(distRoot);
		await writeFile(path.join(distRoot, "index.html"), "<!doctype html><meta charset=\"utf-8\"><script type=\"module\" src=\"/main.js\"></script>");
		const externalResultPromise = new Promise((resolve) => { externalResult = resolve; });
		server = await serveDirectory(distRoot, {
			output: async (body) => {
				await mkdir(reportRoot, { recursive: true });
				await writeFile(path.join(reportRoot, "w5-still-rough-cut.mp4"), body);
			},
			result: async (body) => {
				await mkdir(reportRoot, { recursive: true });
				const payload = JSON.parse(body.toString());
				const artifact = payload.rendered?.artifact ?? {};
				await writeFile(path.join(reportRoot, "w5-still-rough-cut.validation.json"), `${JSON.stringify({
					status: payload.rendered?.status ?? "completed",
					digest: artifact.sha256,
					duration: artifact.duration,
					dimensions: { width: artifact.width, height: artifact.height },
					streams: payload.streams,
					captionTiming: payload.captionTiming,
					arrangedElements: payload.arranged?.data?.elements?.length ?? 0,
					operationId: payload.rendered?.operationId,
					artifact,
				}, null, 2)}\n`);
				externalResult?.();
			},
		});
		const port = server.address().port;
		if (process.env.W5_RENDER_EXTERNAL === "1") {
			console.log(`External browser fixture URL: http://127.0.0.1:${port}/`);
			await externalResultPromise;
			return;
		}
		const { chromium } = await import(chromiumPackage);
		const selectedExecutable = chromiumFallbackExecutable;
		const cdpPort = await freePort();
		const browserArgs = ["--headless=new", "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(temporaryRoot, "chrome-profile")}`, `http://127.0.0.1:${port}/`];
		// Electron 43.1.1 aborts during AppKit registration on macOS 26. The
		// installed Chromium-compatible Chrome is used as the equivalent runner.
		electronProcess = spawn(selectedExecutable, browserArgs, { stdio: ["ignore", "pipe", "pipe"] });
		electronProcess.stderr.on("data", (chunk) => process.stderr.write(`[chromium] ${chunk}`));
		await waitForCdp(cdpPort);
		const selectedPort = cdpPort;
		browser = await chromium.connectOverCDP(`http://127.0.0.1:${selectedPort}`);
		const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
		page.on("console", (message) => process.stderr.write(`[browser:${message.type()}] ${message.text()}\n`));
		page.on("pageerror", (error) => process.stderr.write(`[browser:error] ${error.stack ?? error.message}\n`));
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 120_000 });
		await page.waitForFunction(() => window.__w5Result !== undefined || window.__w5Error !== undefined, null, { timeout: 300_000 });
		const outcome = await page.evaluate(() => ({ result: window.__w5Result, error: window.__w5Error }));
		if (outcome.error) throw new Error(outcome.error);
		if (!outcome.result) throw new Error("Headless fixture completed without a result");
		const { bytesBase64, rendered, arranged, captionTiming, streams } = outcome.result;
		const bytes = Buffer.from(bytesBase64, "base64");
		const digest = createHash("sha256").update(bytes).digest("hex");
		await mkdir(reportRoot, { recursive: true });
		const mp4Path = path.join(reportRoot, "w5-still-rough-cut.mp4");
		const validationPath = path.join(reportRoot, "w5-still-rough-cut.validation.json");
		await writeFile(mp4Path, bytes);
		await writeFile(validationPath, `${JSON.stringify({
			status: "completed",
			command: "arrange-timeline -> export-project/render operation",
			build: { commandBuildId: attestation.service?.commandBuildId ?? null, artifactDigest: attestation.artifactDigest },
			browser: { package: chromiumPackage, executable: selectedExecutable, fallbackFrom: chromiumExecutable, headless: true, args: ["--headless=new", "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"] },
			artifact: { path: mp4Path, byteLength: bytes.byteLength, sha256: digest, ...rendered.artifact },
			streams,
			captionTiming,
			arrangedElements: arranged.data.elements?.length ?? 0,
		}, null, 2)}\n`);
		console.log(JSON.stringify({ mp4Path, validationPath, byteLength: bytes.byteLength, sha256: digest, duration: rendered.artifact.duration, dimensions: `${rendered.artifact.width}x${rendered.artifact.height}` }));
	} finally {
		if (browser) await browser.close();
		if (electronProcess && !electronProcess.killed) electronProcess.kill("SIGTERM");
		if (server) await new Promise((resolve) => server.close(resolve));
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error.stack ?? error.message ?? String(error));
	process.exitCode = 1;
});
