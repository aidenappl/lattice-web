export * from "./user.types";
export * from "./worker.types";
export * from "./stack.types";
export * from "./deployment.types";
export * from "./version.types";
export * from "./volume.types";
export * from "./admin.types";
export * from "./network.types";
export * from "./dashboard.types";
export * from "./webhook.types";
export * from "./database.types";

export type SearchResults = {
    workers: { id: number; name: string; hostname: string; status: string }[];
    stacks: { id: number; name: string; description: string | null; status: string }[];
    containers: { id: number; stack_id: number; name: string; image: string; tag: string; status: string }[];
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ApiSuccess<T> = {
    success: true;
    status: number;
    message: string;
    data: T;
};

export type ApiError = {
    success: false;
    status: number;
    error: string;
    error_message: string;
    error_code: number;
};
