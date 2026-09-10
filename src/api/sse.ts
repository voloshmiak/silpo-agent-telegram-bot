import { config } from "../config";
import type { PlanStreamParams, SSEEvent } from "./types";

export async function* streamPlan(
    params: PlanStreamParams,
    token: string
): AsyncGenerator<SSEEvent, void, unknown> {
    const query = new URLSearchParams();
    if (params.budget_uah) query.append("budget_uah", params.budget_uah.toString());
    if (params.workouts) query.append("workouts", params.workouts.toString());
    if (params.note) query.append("note", params.note);
    if (params.fridge) query.append("fridge", params.fridge);
    if (params.plan_id) query.append("plan_id", params.plan_id);

    const url = `${config.API_BASE_URL}/plan/stream?${query.toString()}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok || !response.body) {
        const error = await response.text();
        throw new Error(`SSE Connection failed [${response.status}]: ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
                const jsonStr = trimmed.replace(/^data:\s*/, "");
                if (!jsonStr) continue;
                try {
                    const parsed = JSON.parse(jsonStr) as SSEEvent;
                    yield parsed;
                } catch {
                    // Игнорируем неполные чанки или комментарии
                }
            }
        }
    }
}