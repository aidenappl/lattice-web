export type WorkerVersionInfo = {
    worker_id: number;
    name: string;
    runner_version: string | null;
    status: string;
    outdated: boolean;
};

export type VersionInfo = {
    api: {
        current: string;
        latest: string;
    };
    web: {
        latest: string;
    };
    runner: {
        latest: string;
        workers: WorkerVersionInfo[];
        outdated_count: number;
    };
    last_checked: string;
};
