export type DockerVolume = {
    name: string;
    driver: string;
    mountpoint: string;
    created_at: string;
    scope: string;
    labels: Record<string, string> | null;
};

export type DockerNetwork = {
    id: string;
    name: string;
    driver: string;
    scope: string;
    internal: boolean;
    containers: Record<string, string>;
    created: string;
};
