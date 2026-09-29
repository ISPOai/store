import type { FeedbackEntry, SubmitFeedbackInput } from "./types";

export async function submitFeedback({
	message: _message,
}: SubmitFeedbackInput): Promise<FeedbackEntry> {
	throw new Error("Feedback submission is unavailable in this desktop build.");
}
