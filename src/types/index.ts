export * from "./user.types";
export * from "./worker.types";
export * from "./stack.types";
export * from "./deployment.types";

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
