import { config } from "../config";
import type {
    AuthResponse,
    CreateUserPayload,
    SilpoTokenPayload,
    User,
    UserSettings,
    PlanHistoryItem,
} from "./types";

export class ApiClient {
    private baseUrl: string;

    constructor() {
        this.baseUrl = config.API_BASE_URL;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        token?: string
    ): Promise<T> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(options.headers as Record<string, string>),
        };

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `API Error [${response.status}] ${response.statusText}: ${errorBody}`
            );
        }

        return response.json() as Promise<T>;
    }

    // 1. Користувачі
    async createUser(payload: CreateUserPayload): Promise<AuthResponse> {
        return this.request<AuthResponse>("/users", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    async getMe(token: string): Promise<User> {
        return this.request<User>("/users/me", { method: "GET" }, token);
    }

    // 2. Параметри та обмеження
    async getSettings(token: string): Promise<UserSettings> {
        return this.request<UserSettings>("/users/me/settings", { method: "GET" }, token);
    }

    async updateSettings(
        payload: Partial<UserSettings>,
        token: string
    ): Promise<UserSettings> {
        return this.request<UserSettings>(
            "/users/me/settings",
            {
                method: "PUT",
                body: JSON.stringify(payload),
            },
            token
        );
    }

    // 3. Silpo Токен
    async setSilpoToken(accessToken: string, token: string): Promise<{ status: string }> {
        const payload: SilpoTokenPayload = { access_token: accessToken };
        return this.request<{ status: string }>(
            "/users/me/silpo-token",
            {
                method: "POST",
                body: JSON.stringify(payload),
            },
            token
        );
    }

    // 4. Авторизація Сільпо (SMS Flow)
    // TODO: Перевір у бекендера, чи правильні URL-шляхи ("/silpo-auth/request-sms" тощо)
    async requestSms(phone: string, token: string): Promise<{ status: string }> {
        return this.request<{ status: string }>(
            "/users/me/silpo-token",
            {
                method: "POST",
                body: JSON.stringify({ phone }),
            },
            token
        );
    }

    async verifySms(phone: string, code: string, token: string): Promise<{ access_token: string }> {
        return this.request<{ access_token: string }>(
            "/silpo-auth/verify-sms",
            {
                method: "POST",
                body: JSON.stringify({ phone, code }),
            },
            token
        );
    }

    // 5. Історія планів
    async getPlans(
        token: string,
        limit = 20,
        offset = 0
    ): Promise<PlanHistoryItem[]> {
        return this.request<PlanHistoryItem[]>(
            `/plans?limit=${limit}&offset=${offset}`,
            { method: "GET" },
            token
        );
    }

    async getPlanById(id: string, token: string): Promise<PlanHistoryItem> {
        return this.request<PlanHistoryItem>(`/plans/${id}`, { method: "GET" }, token);
    }
}

export const api = new ApiClient();