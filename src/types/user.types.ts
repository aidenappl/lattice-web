export type User = {
    id: number;
    email: string;
    name: string | null;
    auth_type: "oauth" | "local";
    forta_id: number | null;
    role: "admin" | "editor" | "viewer";
    active: boolean;
    inserted_at: string;
    updated_at: string;
};
