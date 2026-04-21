export type User = {
    id: number;
    email: string;
    name: string | null;
    auth_type: "oauth" | "local";
    role: "admin" | "editor" | "viewer" | "pending";
    active: boolean;
    inserted_at: string;
    updated_at: string;
};
