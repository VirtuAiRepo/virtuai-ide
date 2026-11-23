import { describe, expect, test } from "bun:test";
import { cliCandidates, externalRunnerPid, parseRunnerLine } from "./virtuaiRunner";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("virtuaiRunner protocol", () => {
	test("reads the bridge protocol", () => {
		expect(
			parseRunnerLine(
				`@@virtuai ${JSON.stringify({
					type: "approval_request",
					id: "a1",
					command: "rm -rf build",
					reason: "no classifier",
					workdir: "/w",
				})}`,
			),
		).toEqual({
			type: "approval_request",
			id: "a1",
			command: "rm -rf build",
			reason: "no classifier",
			workdir: "/w",
		});
		expect(
			parseRunnerLine(
				`@@virtuai ${JSON.stringify({
					type: "approval_request",
					id: "a2",
					command: "npm install",
					base: "npm install",
					scopes: ["once", "conversation", "timed", "folder"],
				})}`,
			),
		).toEqual({
			type: "approval_request",
			id: "a2",
			command: "npm install",
			base: "npm install",
			scopes: ["once", "conversation", "timed", "folder"],
		});
		expect(parseRunnerLine(`@@virtuai ${JSON.stringify({ type: "state", state: "not_paired" })}`)).toEqual({
			type: "state",
			state: "not_paired",
		});
		expect(
			parseRunnerLine(
				`@@virtuai ${JSON.stringify({
					type: "status",
					level: "info",
					message: "Connected. Workdir: /w",
					state: "connected",
				})}`,
			),
		).toMatchObject({ type: "status", state: "connected" });
	});

	test("ignores ordinary output", () => {
		expect(parseRunnerLine("VirtuAI CLI v1.0.19 — Press Ctrl+C to stop.")).toBeNull();
		expect(parseRunnerLine("@@virtuai not json")).toBeNull();
	});
});

describe("virtuaiRunner cli lookup", () => {
	test("the bundled runner comes before anything installed", () => {
		const found = cliCandidates({
			bundledDir: "/Applications/VirtuAI.app/Contents/Resources/runner",
			home: "/Users/ana",
			pathEnv: "/usr/bin",
		});
		expect(found[0]).toBe("/Applications/VirtuAI.app/Contents/Resources/runner/virtuai");
		expect(found).toContain("/Users/ana/.local/bin/virtuai");
		expect(found.at(-1)).toBe("/usr/bin/virtuai");
	});

	test("without a bundle it falls back to an installed cli", () => {
		const found = cliCandidates({ home: "/Users/ana", pathEnv: null });
		expect(found[0]).toBe("/Users/ana/.local/bin/virtuai");
	});

	test("VIRTUAI_CLI override wins", () => {
		const found = cliCandidates({
			override: "/tmp/custom-virtuai",
			home: "/Users/ana",
		});
		expect(found[0]).toBe("/tmp/custom-virtuai");
	});

	test("externalRunnerPid reads a live lock and ignores a stale one", () => {
		const dir = mkdtempSync(join(tmpdir(), "virtuai-run-lock-"));
		const lock = join(dir, "run.lock");
		writeFileSync(lock, `${process.pid}\n`);
		expect(externalRunnerPid(lock)).toBe(process.pid);
		writeFileSync(lock, "99999999\n");
		expect(externalRunnerPid(lock)).toBeNull();
	});
});
