/**
 * Host half of the danmaku plugin.
 *
 * The feature is browser-side; this half only exposes a one-way diagnostic route
 * so the plugin can report its own boot state to a file (the page is gated behind
 * a per-process token the author cannot read).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export const DIAG_PATH = "/danmaku-diag";

function logFile() {
	return join(tmpdir(), "dsh-plugin-danmaku", "diag.log");
}

function record(body) {
	try {
		const file = logFile();
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, `${body}\n`, "utf8");
		return `ok -> ${file}`;
	} catch (error) {
		return `log failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

export const inject = ["webServer"];

export function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: DIAG_PATH,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
				res.end("POST a report");
				return;
			}
			const chunks = [];
			req.on("data", (chunk) => chunks.push(chunk));
			await new Promise((resolve) => req.on("end", resolve));
			const body = Buffer.concat(chunks).toString("utf8").slice(0, 4000);
			res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
			res.end(record(body));
		}
	}), "danmaku: diagnostic route");
}
