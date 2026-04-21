export type Stack = {
    id: number;
    name: string;
    description: string | null;
    worker_id: number | null;
    status: "active" | "stopped" | "deploying" | "deployed" | "failed" | "error";
    deployment_strategy: "rolling" | "blue-green" | "canary";
    auto_deploy: boolean;
    placement_constraints: string | null;
    env_vars: string | null;
    compose_yaml: string | null;
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
    status: "running" | "stopped" | "error" | "pending" | "paused";
    port_mappings: string | null;
    env_vars: string | null;
    volumes: string | null;
    cpu_limit: number | null;
    memory_limit: number | null;
    replicas: number;
    restart_policy: string | null;
    command: string | null;
    entrypoint: string | null;
    health_check: string | null;
    health_status: "healthy" | "unhealthy" | "starting" | "none";
    depends_on: string | null;
    registry_id: number | null;
    active: boolean;
    inserted_at: string;
    updated_at: string;
};

export type ComposeNetwork = {
    id: number;
    stack_id: number;
    name: string;
    driver: string;
    subnet: string | null;
    options: string | null;
    updated_at: string;
    inserted_at: string;
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
    container_name: string | null;
    worker_id: number;
    stream: "stdout" | "stderr";
    message: string;
    recorded_at: string;
};

export type LifecycleLog = {
    id: number;
    container_id: number | null;
    container_name: string | null;
    worker_id: number;
    event: string;
    message: string;
    recorded_at: string;
};
