export * from "./user.types";
export * from "./worker.types";
export * from "./stack.types";
export * from "./deployment.types";
export * from "./version.types";
export * from "./volume.types";
export * from "./admin.types";
export * from "./network.types";
export * from "./dashboard.types";

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
