export type User = {
    id: number;
    email: string;
    name: string | null;
    auth_type: "oauth" | "local" | "sso";
    profile_image_url: string | null;
    role: "admin" | "editor" | "viewer" | "pending";
    active: boolean;
    inserted_at: string;
    updated_at: string;
};
