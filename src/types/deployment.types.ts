export type Deployment = {
    id: number;
    stack_id: number;
    status: "pending" | "approved" | "deploying" | "deployed" | "failed" | "rolled_back";
    strategy: "rolling" | "blue-green" | "canary";
    triggered_by: number | null;
    approved_by: number | null;
    started_at: string | null;
    completed_at: string | null;
    inserted_at: string;
    updated_at: string;
};
