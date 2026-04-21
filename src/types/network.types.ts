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
