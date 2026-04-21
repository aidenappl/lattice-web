export type WebhookConfig = {
    id: number;
    name: string;
    url: string;
    events: string; // JSON array
    active: boolean;
    secret: string | null;
    updated_at: string;
    inserted_at: string;
};
