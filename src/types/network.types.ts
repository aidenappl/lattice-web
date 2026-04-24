import type { Container, Stack } from "./stack.types";

export type PortEntry = {
    hostPort: string;
    containerPort: string;
    protocol: string;
    container: Container;
    stack: Stack;
};

export type WorkerGroup = {
    worker: import("./worker.types").Worker;
    ports: PortEntry[];
};

export type LatticeNetwork = {
    id: number;
    stack_id: number;
    name: string;
    driver: string;
    subnet: string | null;
    options: string | null;
    updated_at: string;
    inserted_at: string;
};
