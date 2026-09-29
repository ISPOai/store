import { describe, expect, test } from "bun:test";
import { cloudJobPendingRef, cloudJobTerminalMessage, isCloudJobPendingError, isCloudJobUnavailableError, pollCloudJob, type CloudJobSnapshot } from "./cloud-job-poll";

function snapshots(states: Array<CloudJobSnapshot["state"]>): CloudJobSnapshot[] {
	return states.map((state) => ({ state } as CloudJobSnapshot));
}

describe("managed Cloud job polling", () => {
	test("recognizes direct, nested, and legacy message pending errors", () => {
		const cases: Array<[unknown, string]> = [
			[{ code: "pending", jobRef: "direct-pending" }, "direct-pending"],
			[{ rpcError: { code: "pending", jobRef: "nested-pending" } }, "nested-pending"],
			[new Error("Error invoking remote method 'project-call': Storyboard image generation is still running as managed Cloud job 'message-pending'; resume it."), "message-pending"],
		];
		for (const [error, jobRef] of cases) {
			expect(isCloudJobPendingError(error)).toBe(true);
			expect(cloudJobPendingRef(error)).toBe(jobRef);
		}
	});

	test("recognizes typed and message-based unavailable job errors", () => {
		const cases: unknown[] = [
			{ code: "job-unavailable" },
			{ code: "invalid-job-ref" },
			{ rpcError: { code: "job-unavailable" } },
			{ rpcError: { code: "invalid-job-ref" } },
			new Error("Cloud job 'job-1' is no longer available"),
			new Error("Cloud job 'job-2' is not owned by this project"),
		];
		for (const error of cases) expect(isCloudJobUnavailableError(error)).toBe(true);
	});

	test("uses the fast cadence, then the slow cadence, until success", async () => {
		let now = 0;
		const delays: number[] = [];
		const jobs = snapshots([...Array.from({ length: 10 }, () => "running" as const), "succeeded"]);
		const result = await pollCloudJob("job-sequence", async () => jobs.shift()!, {
			now: () => now,
			waitForPoll: async (delayMs) => { delays.push(delayMs); now += delayMs; },
		});

		expect(result.kind).toBe("succeeded");
		expect(delays).toEqual([...Array.from({ length: 10 }, () => 3_000), 10_000]);
	});

	test("does not spend the active ceiling while consent is awaiting", async () => {
		let now = 0;
		let calls = 0;
		const observed: Array<[string, string]> = [];
		const delays: number[] = [];
		const jobs = snapshots(["awaiting-consent", "awaiting-consent", "running", "succeeded"]);
		const result = await pollCloudJob("job-consent", async () => {
			calls += 1;
			return jobs.shift()!;
		}, {
			now: () => now,
			maxWaitMs: 6_000,
			waitForPoll: async (delayMs) => { delays.push(delayMs); now += calls === 0 ? 600_000 : delayMs; },
			onState: (state, message) => observed.push([state, message]),
		});

		expect(result.kind).toBe("succeeded");
		expect(observed[0]).toEqual(["awaiting-consent", "waiting for your approval"]);
		expect(observed.map(([state]) => state)).toEqual(["awaiting-consent", "awaiting-consent", "running", "succeeded"]);
		expect(delays).toEqual([3_000, 10_000, 10_000, 3_000]);
	});

	test("fast path returns awaiting consent immediately without waiting for a poll cadence", async () => {
		const delays: number[] = [];
		const result = await pollCloudJob("job-fast", async () => ({ state: "awaiting-consent" } as CloudJobSnapshot), {
			fastPath: true,
			waitForPoll: async (delayMs) => { delays.push(delayMs); },
		});

		expect(result).toEqual({ kind: "pending", lastState: "awaiting-consent" });
		expect(delays).toEqual([]);
	});

	test("returns pending without cancelling the owned job when aborted", async () => {
		const controller = new AbortController();
		const result = await pollCloudJob("job-abort", async () => ({ state: "awaiting-consent" } as CloudJobSnapshot), {
			signal: controller.signal,
			waitForPoll: async () => { controller.abort(); },
		});

		expect(result).toEqual({ kind: "pending" });
	});

	test("normalizes a serialized pending host error inside the polling loop", async () => {
		let calls = 0;
		const observed: string[] = [];
		const result = await pollCloudJob("job-poll", async () => {
			calls += 1;
			if (calls === 1) throw { code: "pending", jobRef: "job-poll", message: "Error invoking remote method 'project-call': pending" };
			return { state: "succeeded" } as CloudJobSnapshot;
		}, {
			waitForPoll: async () => undefined,
			onState: (state, message) => observed.push(`${state}:${message}`),
		});

		expect(result.kind).toBe("succeeded");
		expect(observed).toEqual(["awaiting-consent:waiting for your approval", "succeeded:Cloud job is succeeded"]);
		expect(JSON.stringify(result)).not.toContain("Error invoking remote method");
	});

	test("returns the host message for terminal failures", async () => {
		let now = 0;
		const failed = { state: "failed", error: { message: "The provider rejected this request." } } as CloudJobSnapshot;
		const result = await pollCloudJob("job-failed", async () => failed, {
			now: () => now,
			waitForPoll: async (delayMs) => { now += delayMs; },
		});

		expect(result.kind).toBe("terminal");
		if (result.kind === "terminal") expect(cloudJobTerminalMessage(result.job)).toBe("The provider rejected this request.");
	});

	test("does not expose IPC details from terminal failures", () => {
		const failed = { state: "failed", error: { message: "Error invoking remote method 'project-call': provider exploded" } } as CloudJobSnapshot;
		expect(cloudJobTerminalMessage(failed)).toBe("The Cloud job failed on the host. Please try again.");
	});
});
