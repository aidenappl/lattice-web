export type Stack = {
    id: number;
    name: string;
    description: string | null;
    worker_id: number | null;
    status: "active" | "stopped" | "deploying" | "error";
    deployment_strategy: "rolling" | "blue-green" | "canary";
    auto_deploy: boolean;
    env_vars: string | null;
    active: boolean;
    inserted_at: string;
    updated_at: string;
};

export type Container = {
    id: number;
    stack_id: number;
    name: string;
    image: string;
    tag: string;
    status: "running" | "stopped" | "error" | "pending";
    port_mappings: string | null;
    env_vars: string | null;
    volumes: string | null;
    cpu_limit: number | null;
    memory_limit: number | null;
    replicas: number;
    restart_policy: string | null;
    command: string | null;
    entrypoint: string | null;
    registry_id: number | null;
    active: boolean;
    inserted_at: string;
    updated_at: string;
};

export type Registry = {
    id: number;
    name: string;
    url: string;
    type: "dockerhub" | "ghcr" | "custom";
    username: string | null;
    active: boolean;
    inserted_at: string;
    updated_at: string;
};

export type ContainerLog = {
    id: number;
    container_id: number | null;
    worker_id: number;
    stream: "stdout" | "stderr";
    message: string;
    recorded_at: string;
};
