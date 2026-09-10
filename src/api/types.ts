// 1. Користувачі
export interface CreateUserPayload {
    name: string;
    silpo_token?: string;
}

export interface User {
    id: string;
    name: string;
    created_at: string;
}

export interface AuthResponse {
    user: User;
    token: string;
}

// 2. Параметри та обмеження
export interface WorkoutSchedule {
    [day: string]: string; // наприклад: { "ПН": "силові", "ВТ": "кардіо" }
}

export interface UserSettings {
    user_id?: string;
    weight: number;
    target_weight: number;
    height: number;
    age: number;
    sex: string; // "чол." | "жін."
    focus: string; // "Схуднення" | "Підтримка" | "Набір маси"
    weekly_pace: number; // наприклад: -0.6
    workouts_per_week: number;
    workout_schedule: WorkoutSchedule;
    missed_workout_today: boolean;
    allergens: string[];
    excluded_products: string[];
    diet_type: string; // наприклад: "БЕЗ ОБМЕЖЕНЬ"
    weekly_budget: number;
    promo_priority: string; // "Високий" | "Середній" | "Низький"
    delivery_included: boolean;
    updated_at?: string;
}

// 3. Silpo MCP Токен
export interface SilpoTokenPayload {
    access_token: string;
}

// 4. Події SSE для генерації плану
export type SSEEvent =
    | { type: "tool_call"; tool: string; input?: unknown }
    | { type: "token"; text: string }
    | { type: "plan"; answer: string; plan: Record<string, unknown> };

export interface PlanStreamParams {
    budget_uah?: number;
    workouts?: number;
    note?: string;
    fridge?: string;
    plan_id?: string;
}

// 5. Історія планів
export interface PlanHistoryItem {
    id: string;
    user_id: string;
    created_at: string;
    data: Record<string, unknown>;
}