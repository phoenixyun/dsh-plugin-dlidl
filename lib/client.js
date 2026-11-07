/**
 * Danmaku mode: the model's streaming reply flies across the top of the window
 * as Bilibili-style bullet comments, while the composer keeps its place.
 *
 * Where the text comes from: `ctx.sessions` binding exposes a SessionEventWindow
 * whose transient entries carry the original `StreamChunk`s — including every
 * `text-delta`. The Chat projection renders those chunks, but the raw window is
 * the only place that also keeps the *partial* text while it arrives, so this is
 * the source. The window is polled (no MutationObserver on purpose; an earlier
 * plugin froze the UI with one), and DOM writes happen only for new text.
 *
 * Defaults: only newly streamed text is shown (no replay), the transcript is
 * hidden so the page is "all danmaku", and Alt+D toggles the mode.
 */
(() => {
	const PLUGIN_ID = "dsh-plugin-dlidl";
	const LAYER_ID = "dshld-danmaku";
	const GEAR_ID = "dshld-danmaku-gear";
	const KEY = "dshld.danmaku.v1";

	/** One-way diagnostic report: the host route appends it to a temp file. */
	function report(event, extra) {
		try {
			void fetch("/danmaku-diag", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ event, ...extra, at: Date.now() })
			}).catch(() => {});
		} catch {
			// diagnostics never break the surface
		}
	}

	const DEFAULTS = {
		on: true,
		speed: 120,   // px per second
		size: 18,     // px
		opacity: 0.9,
		lanes: 5,
		area: 20,     // % of viewport height
		color: true,
		collapseSidebar: true,
		showReason: false,
		filterEnglish: true
	};

	const COLORS = ["#ffffff", "#ffd666", "#7ce7ff", "#9dff9d", "#ffb3d9", "#c9b8ff"];

	const CSS = `
		html[data-dshld-danmaku="on"] [data-chat-node-key] {
			visibility: hidden !important;
		}
		#${LAYER_ID} {
			position: fixed;
			top: var(--dsh-windows-titlebar-height, 40px);
			left: 0;
			right: 0;
			height: calc(var(--dshld-dm-area, 20) * 1vh);
			overflow: hidden;
			pointer-events: none;
			z-index: 8;
			contain: layout paint;
		}
		#${LAYER_ID} .dshld_dm_item {
			position: absolute;
			left: 0;
			top: 0;
			white-space: nowrap;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
			font-weight: 600;
			letter-spacing: 0.01em;
			line-height: 1;
			text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55), 0 0 12px rgba(0, 0, 0, 0.35);
			will-change: transform;
		}
		#${GEAR_ID} {
			position: fixed;
			top: calc(var(--dshld-dm-area, 20) * 1vh + 42px);
			right: 20px;
			z-index: 2147482500;
			display: flex;
			align-items: center;
			gap: 8px;
			-webkit-app-region: no-drag;
		}
		#${GEAR_ID} button.dshld_dm_gear {
			width: 30px;
			height: 30px;
			border-radius: 50%;
			border: 1px solid rgba(255, 255, 255, 0.65);
			background: linear-gradient(150deg, rgba(255, 255, 255, 0.88), rgba(240, 245, 250, 0.64));
			color: #27313c;
			font-size: 14px;
			line-height: 1;
			cursor: pointer;
			-webkit-backdrop-filter: blur(16px) saturate(180%);
			backdrop-filter: blur(16px) saturate(180%);
			box-shadow: 0 8px 22px rgba(8, 16, 24, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.95);
		}
		#${GEAR_ID} .dshld_dm_panel {
			position: fixed;
			top: 92px;
			right: 24px;
			width: 262px;
			padding: 14px 16px 12px;
			border: 1px solid rgba(255, 255, 255, 0.72);
			border-radius: 18px;
			background: linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(243, 247, 251, 0.7));
			-webkit-backdrop-filter: blur(30px) saturate(180%) brightness(1.04);
			backdrop-filter: blur(30px) saturate(180%) brightness(1.04);
			box-shadow: 0 26px 68px rgba(6, 14, 22, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.96);
			color: #1a2430;
			font: 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
		}
		#${GEAR_ID} .dshld_dm_panel[hidden] { display: none; }
		#${GEAR_ID} .dshld_dm_head {
			display: flex;
			align-items: center;
			gap: 8px;
			padding-bottom: 9px;
			margin-bottom: 8px;
			border-bottom: 1px solid rgba(20, 26, 34, 0.08);
		}
		#${GEAR_ID} .dshld_dm_head b { font-size: 13px; font-weight: 650; }
		#${GEAR_ID} .dshld_dm_hint { font-size: 10px; color: rgba(26, 36, 48, 0.45); }
		#${GEAR_ID} .dshld_dm_close {
			margin-left: auto; width: 20px; height: 20px; border: 0; border-radius: 999px;
			background: transparent; color: rgba(26, 36, 48, 0.5); font-size: 15px; line-height: 1; cursor: pointer;
		}
		#${GEAR_ID} .dshld_dm_row {
			display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 3px 10px; margin: 9px 0;
		}
		#${GEAR_ID} .dshld_dm_name { color: rgba(22, 31, 42, 0.82); }
		#${GEAR_ID} .dshld_dm_val { color: rgba(22, 31, 42, 0.55); font-variant-numeric: tabular-nums; font-size: 11.5px; }
		#${GEAR_ID} input[type="range"] {
			grid-column: 1 / -1; width: 100%; height: 18px; margin: 1px 0 0;
			-webkit-appearance: none; appearance: none; background: transparent; cursor: pointer;
		}
		#${GEAR_ID} input[type="range"]::-webkit-slider-runnable-track {
			height: 4px; border-radius: 999px; background: rgba(22, 31, 42, 0.14);
		}
		#${GEAR_ID} input[type="range"]::-webkit-slider-thumb {
			-webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -6px;
			border-radius: 50%; border: 1px solid rgba(10, 18, 26, 0.08); background: #fff;
			box-shadow: 0 2px 8px rgba(6, 14, 22, 0.3);
		}
		#${GEAR_ID} .dshld_dm_check {
			display: flex; align-items: center; gap: 10px; margin: 10px 0 2px; cursor: pointer; color: rgba(22, 31, 42, 0.82);
		}
		#${GEAR_ID} .dshld_dm_check input[type="checkbox"] {
			-webkit-appearance: none; appearance: none; width: 34px; height: 20px; border-radius: 999px;
			background-color: rgba(22, 31, 42, 0.18);
			background-image: radial-gradient(circle at center, #fff 6.5px, rgba(255, 255, 255, 0) 7px);
			background-size: 16px 16px; background-position: 2px center; background-repeat: no-repeat;
			box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12); cursor: pointer; transition: background 160ms ease;
		}
		#${GEAR_ID} .dshld_dm_check input[type="checkbox"]:checked {
			background-color: rgba(70, 148, 220, 0.92); background-position: 16px center;
		}
		#${GEAR_ID} .dshld_dm_demo {
			margin-top: 10px; width: 100%; height: 28px; border-radius: 999px;
			border: 1px solid rgba(20, 26, 34, 0.12); background: rgba(255, 255, 255, 0.6);
			color: rgba(26, 36, 48, 0.82); font: inherit; cursor: pointer;
		}
		#${GEAR_ID} .dshld_dm_demo:hover { background: rgba(255, 255, 255, 0.9); }
		#${GEAR_ID} .dshld_dm_tabs { display: flex; gap: 6px; margin: 2px 0 10px; }
		#${GEAR_ID} .dshld_dm_tab {
			flex: 1; height: 28px; border-radius: 999px; border: 1px solid rgba(20, 26, 34, 0.1);
			background: rgba(255, 255, 255, 0.42); color: rgba(26, 36, 48, 0.72);
			font: inherit; font-size: 12px; cursor: pointer;
		}
		#${GEAR_ID} .dshld_dm_tab.is-active {
			background: rgba(255, 255, 255, 0.94); color: #121a23; font-weight: 600;
			box-shadow: 0 2px 8px rgba(6, 14, 22, 0.12);
		}
		#${GEAR_ID} .dshld_dm_tabbody { max-height: 62vh; overflow: auto; }
		#${GEAR_ID} .dshld_dm_embed { min-height: 120px; }
	`;

	function readState() {
		const state = { ...DEFAULTS };
		try {
			const raw = globalThis.localStorage?.getItem(KEY);
			if (typeof raw !== "string") return state;
			const saved = JSON.parse(raw);
			for (const key of Object.keys(DEFAULTS)) {
				if (typeof saved?.[key] === typeof DEFAULTS[key]) state[key] = saved[key];
			}
		} catch {
			// Corrupt entry: defaults are fine.
		}
		return state;
	}

	function saveState(state) {
		try {
			globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
		} catch {
			// Private mode / quota: the current session still works.
		}
	}

	function ensureStyle() {
		if (document.getElementById(`${LAYER_ID}-css`) !== null) return;
		const style = document.createElement("style");
		style.id = `${LAYER_ID}-css`;
		style.dataset.plugin = PLUGIN_ID;
		style.textContent = CSS;
		document.head.append(style);
	}

	/** Session id: same resolution order as the rest of the shell's client plugins. */
	function currentSessionId(ctx) {
		try {
			const snapshot = ctx.sessions.list.getSnapshot();
			if (typeof snapshot?.current === "string") return snapshot.current;
		} catch {
			// fall through to the URL
		}
		try {
			const fromSearch = new URLSearchParams(globalThis.location.search).get("session");
			if (typeof fromSearch === "string" && fromSearch !== "") return fromSearch;
			const match = /(?:session|sessions)[/=]([A-Za-z0-9_-]+)/.exec(`${globalThis.location.hash}${globalThis.location.pathname}`);
			if (match !== null) return match[1];
		} catch {
			// no location
		}
		return void 0;
	}

	/**
	 * Read the assistant output straight from the rendered transcript.
	 *
	 * The event window only carries live chunks while a step is actually
	 * streaming; the transcript nodes keep every assistant paragraph, including
	 * finished ones. Polling their textContent therefore covers long answers and
	 * late-arriving blocks the same way, without depending on chunk shapes.
	 */
	function transcriptText() {
		try {
			let nodes = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')];
			if (nodes.length === 0) nodes = [...document.querySelectorAll("[data-chat-node-key]")];
			if (nodes.length === 0) return "";
			let text = "";
			for (const node of nodes) text += `${node.textContent.replace(/\s+/g, " ")}\n`;
			return text;
		} catch {
			return "";
		}
	}
	/** Concatenate the visible text carried by the event window's stream chunks. */
	function liveText(ctx) {
		const rendered = transcriptText();
		if (rendered !== "") return rendered;
		try {
			const sessionId = currentSessionId(ctx);
			if (sessionId === void 0) return "";
			const binding = ctx.sessions.binding(sessionId);
			const window = binding?.eventSource?.getSnapshot();
			if (window === null || window === void 0 || !Array.isArray(window.entries)) return "";
			let text = "";
			for (const entry of window.entries) {
				const chunk = entry?.event?.data?.chunk;
				if (chunk?.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
			}
			return text;
		} catch {
			return "";
		}
	}

	function start(ctx) {
		report("start", { ready: document.readyState, body: document.body !== null });
		if (typeof document === "undefined") return () => {};
		// Client plugins can be applied before <body> exists; wait for it instead of
		// silently doing nothing (this is how the first build stayed invisible).
		if (document.body === null) {
			const retry = setTimeout(() => start(ctx), 300);
			return () => clearTimeout(retry);
		}
		const state = readState();
		ensureStyle();

		const layer = document.createElement("div");
		layer.id = LAYER_ID;
		layer.setAttribute("aria-hidden", "true");

		const gear = document.createElement("div");
		gear.id = GEAR_ID;
		const gearButton = document.createElement("button");
		gearButton.type = "button";
		gearButton.className = "dshld_dm_gear";
		gearButton.title = "弹幕设置";
		gearButton.textContent = "⚙";
		const panel = document.createElement("div");
		panel.className = "dshld_dm_panel";
		panel.hidden = true;
		gear.append(gearButton, panel);

		const applyState = () => {
			document.documentElement.setAttribute("data-dshld-danmaku", state.on ? "on" : "off");
			layer.style.setProperty("--dshld-dm-area", String(state.area));
			layer.style.height = `${String(state.area)}vh`;
			gear.style.setProperty("--dshld-dm-area", String(state.area));
			gear.style.top = `calc(${String(state.area)}vh + 42px)`;
		};

		// ── settings panel ────────────────────────────────────────────────────
		let open = false;
		let activeTab = "danmaku";
		const setOpen = (next) => { if (!next) window.__dshldTuner?.detach?.();

			open = next;
			panel.hidden = !next;
			if (next) renderSettings();
		};
		const makeRow = (label, key, min, max, step, unit) => {
			const row = document.createElement("label");
			row.className = "dshld_dm_row";
			const name = document.createElement("span");
			name.className = "dshld_dm_name";
			name.textContent = label;
			const value = document.createElement("span");
			value.className = "dshld_dm_val";
			value.textContent = `${String(state[key])}${unit}`;
			const input = document.createElement("input");
			input.type = "range";
			input.min = String(min);
			input.max = String(max);
			input.step = String(step);
			input.value = String(state[key]);
			input.addEventListener("input", () => {
				state[key] = Number(input.value);
				value.textContent = `${String(state[key])}${unit}`;
				applyState();
				saveState(state);
			});
			row.append(name, value, input);
			return row;
		};
		const makeToggle = (label, key) => {
			const row = document.createElement("label");
			row.className = "dshld_dm_check";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.checked = state[key];
			const text = document.createElement("span");
			text.textContent = label;
			input.addEventListener("change", () => {
				state[key] = input.checked;
				applyState();
				saveState(state);
			});
			row.append(input, text);
			return row;
		};
		const renderSettings = () => {
			window.__dshldTuner?.detach?.();
			panel.textContent = "";
			const head = document.createElement("div");
			head.className = "dshld_dm_head";
			const title = document.createElement("b");
			title.textContent = "设置";
			const hint = document.createElement("span");
			hint.className = "dshld_dm_hint";
			hint.textContent = "实时生效";
			const close = document.createElement("button");
			close.type = "button";
			close.className = "dshld_dm_close";
			close.textContent = "×";
			close.addEventListener("click", () => setOpen(false));
			head.append(title, hint, close);
			panel.append(head);

			const tabs = document.createElement("div");
			tabs.className = "dshld_dm_tabs";
			for (const [key, label] of [["danmaku", "弹幕"], ["appearance", "外观"]]) {
				const tab = document.createElement("button");
				tab.type = "button";
				tab.className = key === activeTab ? "dshld_dm_tab is-active" : "dshld_dm_tab";
				tab.textContent = label;
				tab.addEventListener("click", () => {
					if (activeTab === key) return;
					activeTab = key;
					renderSettings();
				});
				tabs.append(tab);
			}
			panel.append(tabs);

			const body = document.createElement("div");
			body.className = "dshld_dm_tabbody";
			if (activeTab === "appearance") {
				const holder = document.createElement("div");
				holder.className = "dshld_dm_embed";
				body.append(holder);
				const tuner = window.__dshldTuner;
				if (tuner !== void 0) tuner.attach(holder);
				else {
					const missing = document.createElement("div");
					missing.className = "dshld_dm_hint";
					missing.textContent = "外观面板插件未加载（live-diff 需要先启用）。";
					body.append(missing);
				}
			} else {
				body.append(makeRow("速度", "speed", 40, 260, 5, " px/s"));
				body.append(makeRow("字号", "size", 14, 30, 1, " px"));
				body.append(makeRow("不透明度", "opacity", 0.2, 1, 0.02, ""));
				body.append(makeRow("轨道数", "lanes", 1, 8, 1, " 条"));
				body.append(makeRow("显示高度", "area", 10, 40, 1, "%"));
				body.append(makeToggle("弹幕模式", "on"));
				body.append(makeToggle("显示思考过程", "showReason"));
				body.append(makeToggle("过滤英文/代码碎片", "filterEnglish"));
				body.append(makeToggle("启动时折叠侧边栏", "collapseSidebar"));
				body.append(makeToggle("彩色弹幕", "color"));
				const demo = document.createElement("button");
				demo.type = "button";
				demo.className = "dshld_dm_demo";
				demo.textContent = "来一条演示弹幕";
				demo.addEventListener("click", () => emitOne("这是一条演示弹幕，用来检查滚动速度和轨道。", "text"));
				body.append(demo);
			}
			panel.append(body);
		};
		gearButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			setOpen(!open);
		});
		const onPointerDown = (event) => {
			if (open && !gear.contains(event.target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		const onKeyDown = (event) => {
			if (open && event.key === "Escape") setOpen(false);
			const chord = (event.ctrlKey || event.metaKey) && event.shiftKey;
			if (chord && (event.key === "d" || event.key === "D")) { report("chord", { key: event.key });
				event.preventDefault();
				state.on = !state.on;
				applyState();
				saveState(state);
				if (state.on) setOpen(false);
			}
			if (chord && (event.key === "m" || event.key === "M")) {
				event.preventDefault();
				report("chord", { key: event.key });
				emit("演示弹幕：模型输出会像这样从右向左飞过。");
			}
		};
		document.addEventListener("keydown", onKeyDown, true);

		document.body.append(layer, gear);
		applyState();
		report("mounted", { gear: document.getElementById(GEAR_ID) !== null, attr: document.documentElement.getAttribute("data-dshld-danmaku"), chatNodes: document.querySelectorAll("[data-chat-node-key]").length, gearTop: gear.style.top, gearRect: gear.getBoundingClientRect().top });
		setTimeout(() => {
			try {
				const kinds = [...new Set([...document.querySelectorAll("[data-chat-flow-kind]")].map((node) => node.getAttribute("data-chat-flow-kind")))];
				const text = transcriptText();
				const step = document.querySelector('[data-chat-flow-kind="assistant-step"]');
				report("dom", { kinds, transcript: text.slice(0, 80), length: text.length, on: state.on, stepClasses: step === null ? [] : [...step.querySelectorAll("[class]")].slice(0, 25).map((el) => String(el.className)), stepHtml: step === null ? "" : step.outerHTML.slice(0, 1200) });
			} catch (error) {
				report("dom", { failed: String(error) });
			}
		}, 2000);
		// This plugin wants the stage, not the navigation: collapse the left sidebar
		// once on start (only when the shell currently has it expanded).
		if (state.collapseSidebar) {
			try {
				if (document.querySelector("[data-sidebar-collapsed]") === null && typeof ctx.layout?.toggleSidebar === "function") {
					ctx.layout.toggleSidebar();
				}
			} catch {
				// layout service absent: leave the sidebar alone
			}
		}

		const startedAt = Date.now();
		// ── danmaku scheduling ────────────────────────────────────────────────
		// Everything goes through one FIFO queue, drained at a fixed pace. That is
		// what keeps the visual order equal to the arrival order: text is appended
		// when its delta lands, and only one item is launched per tick.
		const busyUntil = [];
		let colorIndex = 0;
		let nextLane = 0;
		const pending = [];
		const laneCount = () => Math.max(1, Math.round(state.lanes));
		const laneHeight = () => (layer.clientHeight || globalThis.innerHeight * state.area / 100) / laneCount();

		const splitInto = (text, limit) => {
			const pieces = [];
			let rest = String(text);
			while (rest !== "") {
				const match = /^([\s\S]*?[。！？!?；;\n])\s*/.exec(rest);
				if (match !== null) {
					pieces.push(match[1]);
					rest = rest.slice(match[0].length);
					continue;
				}
				if (rest.length <= limit) {
					pieces.push(rest);
					break;
				}
				const cut = rest.lastIndexOf("，", limit);
				const at = cut >= 10 ? cut : limit;
				pieces.push(rest.slice(0, at + 1));
				rest = rest.slice(at + 1);
			}
			return pieces.filter((piece) => piece.trim() !== "");
		};

		/** Strip code/URL/markdown noise and drop pieces the user cannot read. */
		const cleanPiece = (raw) => String(raw)
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`([^`]*)`/g, "$1")
			.replace(/https?:\/\/\S+/g, " ")
			.replace(/[*_#>~|]/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		const enqueue = (text, kind) => {
			if (kind === "reason" && !state.showReason) return;
			for (const raw of splitInto(text, kind === "reason" ? 26 : 38)) {
				const piece = cleanPiece(raw);
				if (piece.length < 2) continue;
				if (state.filterEnglish) {
					const cjk = (piece.match(/[\u4e00-\u9fff]/g) ?? []).length;
					const latin = (piece.match(/[A-Za-z]/g) ?? []).length;
					// A piece with no CJK and mostly Latin letters is unreadable here.
					if (cjk === 0 && latin > 4) continue;
				}
				if (pending.length > 0 && pending[pending.length - 1].text === piece) continue;
				pending.push({ text: piece, kind });
			}
		};

		const emitOne = (text, kind) => {
			const trimmed = String(text).trim();
			if (trimmed === "" || !state.on) return true;
			const areaPx = layer.clientHeight || globalThis.innerHeight * state.area / 100;
			// Never squeeze more lanes than the band can hold at this font size.
			const maxLanes = Math.max(1, Math.floor(areaPx / (state.size * 1.7)));
			const lanes = Math.min(laneCount(), maxLanes);
			const height = areaPx / lanes;
			const now = performance.now();
			let lane = -1;
			for (let attempt = 0; attempt < lanes; attempt += 1) {
				const candidate = (nextLane + attempt) % lanes;
				if ((busyUntil[candidate] ?? 0) <= now) {
					lane = candidate;
					nextLane = candidate + 1;
					break;
				}
			}
			// Every lane still has a tail near the spawn edge: keep the item queued
			// rather than stacking it on top of an older line.
			if (lane < 0) return false;
			const item = document.createElement("span");
			item.className = kind === "reason" ? "dshld_dm_item is-reason" : "dshld_dm_item";
			item.textContent = trimmed;
			item.style.fontSize = `${String(kind === "reason" ? Math.max(12, state.size - 3) : state.size)}px`;
			item.style.opacity = String(kind === "reason" ? Math.min(0.62, state.opacity * 0.62) : state.opacity);
			item.style.color = kind === "reason" ? "#b9c9da" : (state.color ? COLORS[colorIndex++ % COLORS.length] : "#ffffff");
			item.style.top = `${String(lane * height)}px`;
			item.style.height = `${String(height)}px`;
			item.style.display = "flex";
			item.style.alignItems = "center";
			item.style.lineHeight = "1";
			layer.append(item);
			const width = item.offsetWidth || trimmed.length * state.size;
			const distance = (layer.clientWidth || globalThis.innerWidth) + width;
			const duration = Math.max(1600, distance / Math.max(20, state.speed) * 1000);
			const animation = item.animate(
				[{ transform: `translateX(${String(globalThis.innerWidth)}px)` }, { transform: `translateX(${String(-width)}px)` }],
				{ duration, easing: "linear" }
			);
			// The lane is reusable once this line's tail has cleared the right edge
			// (plus a gap), not after its whole trip across the window.
			busyUntil[lane] = now + Math.max(650, (width + 72) / Math.max(20, state.speed) * 1000);
			animation.onfinish = () => item.remove();
			return true;
		};
		// Newest assistant reply, for the manual "replay" action only.
		const latestAssistant = () => {
			try {
				let nodes = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')];
				if (nodes.length === 0) nodes = [...document.querySelectorAll("[data-chat-node-key]")];
				if (nodes.length === 0) return "";
				return String(nodes[nodes.length - 1].textContent || "").replace(/\s+/g, " ").trim().slice(-900);
			} catch {
				return "";
			}
		};

		/**
		 * Per-node tracking, in DOM order.
		 *
		 * Each assistant-step node is one part of the current turn (reasoning or
		 * answer). Existing nodes are baselined on the first tick and never emitted;
		 * a node created afterwards starts at 0 and streams out as it grows. This
		 * keeps history out while preserving the reasoning-then-answer order, and it
		 * survives the step nodes being re-created between turns.
		 */
		const watchedLengths = new WeakMap();
		let primed = false;
		const tick = () => {
			if (!state.on) return;
			try {
				const nodes = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"]')];
				for (const node of nodes) {
					const text = String(node.textContent || "");
					const previous = watchedLengths.get(node);
					if (previous === void 0) {
						// Nodes created during the first seconds after a reload are the
						// transcript catching up with itself — history, not new output.
						// Baseline them; only nodes that appear later stream from zero.
						const grace = Date.now() - startedAt < 8000;
						watchedLengths.set(node, (primed && !grace) ? 0 : text.length);
						if (!primed || grace) continue;
					}
					if (text.length > (watchedLengths.get(node) ?? 0)) {
						const kind = node.getAttribute("data-chat-group-part") === "reasoning" ? "reason" : "text";
						enqueue(text.slice(watchedLengths.get(node) ?? 0), kind);
						watchedLengths.set(node, text.length);
					}
				}
				primed = true;
			} catch {
				// The transcript may be mid-render; the next tick retries.
			}
		};
		const timer = setInterval(tick, 140);
		const pumpTimer = setInterval(() => {
			if (!state.on || pending.length === 0) return;
			const next = pending[0];
			if (next !== void 0 && emitOne(next.text, next.kind)) pending.shift();
		}, 220);

		// The settings live behind the titlebar's single menu button (the titlebar
		// plugin calls these); the floating gear stays as a fallback entry.
		window.__dshldDanmaku = {
			openSettings: () => setOpen(true),
			closeSettings: () => setOpen(false),
			toggle: () => {
				state.on = !state.on;
				applyState();
				saveState(state);
			},
			demo: () => enqueue("演示弹幕：模型输出会像这样从右向左飞过。", "text"),
			replay: () => {
				const latest = latestAssistant();
				if (latest !== "") enqueue(latest, "text");
			}
		};


		return () => {
			clearInterval(timer);
			clearInterval(pumpTimer);
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeyDown, true);
			delete window.__dshldDanmaku;
			layer.remove();
			gear.remove();
			document.documentElement.removeAttribute("data-dshld-danmaku");
		};
	}

	report("module", { loader: typeof window.__ModuleLoader__ });
	window.__ModuleLoader__.load({
		id: PLUGIN_ID,
		factory: () => ({
			inject: ["sessions", "layout"],
			apply(ctx) {
				report("apply", { effect: typeof ctx?.effect });
				if (typeof ctx?.effect === "function") ctx.effect(() => start(ctx), "danmaku: layer");
				else start(ctx);
			}
		})
	});
})();
