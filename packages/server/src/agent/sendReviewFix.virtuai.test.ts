import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { createFauxCore } from "@earendil-works/pi-ai/providers/faux";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import {
	createSession,
	disposeAllSessions,
	removeSession,
	sendReviewFixToSession,
	setSessionManagerFactory,
	setSessionProjectResolver,
	setSkillAdmissionResolver,
	toWireModel,
} from "./agentSessionManager";
import { configurePiRuntime } from "./piRuntime";
import { admissionContextFor } from "./skillAdmission";
import * as virtuaiTurn from "./virtuaiTurn";

const faux = createFauxCore({
	provider: "fauxa",
	api: "fauxa",
	models: [
		{
			id: "fauxa",
			name: "fauxa",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 100_000,
			maxTokens: 4096,
		},
	],
	tokensPerSecond: 2000,
});

const tmpDirs: string[] = [];
function tmpCwd(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

let priorAgentDir: string | undefined;
let priorDataDir: string | undefined;
let priorOffline: string | undefined;

beforeAll(async () => {
	priorAgentDir = process.env.PI_CODING_AGENT_DIR;
	priorDataDir = process.env.THINKRAIL_DATA_DIR;
	priorOffline = process.env.PI_OFFLINE;
	process.env.PI_CODING_AGENT_DIR = tmpCwd("trpi-review-fix-agent-");
	process.env.THINKRAIL_DATA_DIR = tmpCwd("trpi-review-fix-data-");
	process.env.PI_OFFLINE = "1";

	const runtime = await ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		allowModelNetwork: false,
	});
	runtime.registerProvider("fauxa", {
		api: faux.api,
		baseUrl: "http://faux.local",
		apiKey: "faux",
		streamSimple: faux.streamSimple,
		models: [
			{
				id: "fauxa",
				name: "fauxa",
				reasoning: false,
				input: ["text" as const],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100_000,
				maxTokens: 4096,
				api: faux.api,
			},
		],
	});
	configurePiRuntime(runtime);
	setSessionManagerFactory(() => SessionManager.inMemory());
	setSessionProjectResolver((workspaceId) => `project-${workspaceId}`);
	setSkillAdmissionResolver(() => admissionContextFor({ piResourceTrust: "granted" }));
});

afterAll(() => {
	disposeAllSessions();
	setSkillAdmissionResolver(() => admissionContextFor(undefined));
	setSessionProjectResolver(() => null);
	setSessionManagerFactory((cwd) => SessionManager.create(cwd));
	configurePiRuntime(null);
	for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
	if (priorAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = priorAgentDir;
	if (priorDataDir === undefined) delete process.env.THINKRAIL_DATA_DIR;
	else process.env.THINKRAIL_DATA_DIR = priorDataDir;
	if (priorOffline === undefined) delete process.env.PI_OFFLINE;
	else process.env.PI_OFFLINE = priorOffline;
});

afterEach(() => {
	disposeAllSessions();
});

test("sendReviewFixToSession under VirtuAI prompts Completions with the package text", async () => {
	const owns = spyOn(virtuaiTurn, "virtuaiOwnsChat").mockReturnValue(true);
	const run = spyOn(virtuaiTurn, "runVirtuaiTurn").mockResolvedValue(undefined);
	try {
		const session = await createSession({
			cwd: tmpCwd("trpi-review-fix-"),
			workspaceId: "ws-review-fix",
			model: toWireModel(faux.getModel()),
		});
		const packageText = "## Fix request\n\nPlease address the findings.";
		await sendReviewFixToSession(session.sessionId, packageText, {
			itemId: "todo_1",
			itemTitle: "Ship it",
			comments: [],
		});
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0]?.[0]).toBe(session.sessionId);
		expect(run.mock.calls[0]?.[1]).toBe(packageText);
		removeSession(session.sessionId);
	} finally {
		owns.mockRestore();
		run.mockRestore();
	}
});

test("sendReviewFixToSession without VirtuAI still uses the Pi custom message path", async () => {
	const owns = spyOn(virtuaiTurn, "virtuaiOwnsChat").mockReturnValue(false);
	const run = spyOn(virtuaiTurn, "runVirtuaiTurn").mockResolvedValue(undefined);
	try {
		const session = await createSession({
			cwd: tmpCwd("trpi-review-fix-pi-"),
			workspaceId: "ws-review-fix-pi",
			model: toWireModel(faux.getModel()),
		});
		await sendReviewFixToSession(session.sessionId, "please fix", {
			itemId: "todo_2",
			itemTitle: "Other",
			comments: [],
		});
		expect(run).not.toHaveBeenCalled();
		removeSession(session.sessionId);
	} finally {
		owns.mockRestore();
		run.mockRestore();
	}
});
