import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { Worker, WorkerMetrics, WorkerToken } from "@/types";
import { reqGetWorkers, reqGetWorker, reqGetWorkerMetrics, reqGetWorkerTokens } from "@/services/workers.service";
import type { RootState } from "../index";

interface WorkersState {
    list: Worker[];
    current: Worker | null;
    metrics: WorkerMetrics[];
    tokens: WorkerToken[];
    loading: boolean;
    error: string | null;
}

const initialState: WorkersState = {
    list: [],
    current: null,
    metrics: [],
    tokens: [],
    loading: true,
    error: null,
};

export const fetchWorkers = createAsyncThunk(
    "workers/fetchWorkers",
    async () => {
        const res = await reqGetWorkers();
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

export const fetchWorker = createAsyncThunk(
    "workers/fetchWorker",
    async (id: number) => {
        const res = await reqGetWorker(id);
        if (res.success) return res.data;
        throw new Error(res.error_message);
    },
);

export const fetchWorkerMetrics = createAsyncThunk(
    "workers/fetchWorkerMetrics",
    async (id: number) => {
        const res = await reqGetWorkerMetrics(id);
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

export const fetchWorkerTokens = createAsyncThunk(
    "workers/fetchWorkerTokens",
    async (id: number) => {
        const res = await reqGetWorkerTokens(id);
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

const workersSlice = createSlice({
    name: "workers",
    initialState,
    reducers: {
        setCurrent(state, action: PayloadAction<Worker | null>) {
            state.current = action.payload;
        },
        updateCurrent(state, action: PayloadAction<Partial<Worker>>) {
            if (state.current) {
                Object.assign(state.current, action.payload);
            }
        },
        setTokens(state, action: PayloadAction<WorkerToken[]>) {
            state.tokens = action.payload;
        },
        addToken(state, action: PayloadAction<WorkerToken>) {
            state.tokens = [action.payload, ...state.tokens];
        },
        removeToken(state, action: PayloadAction<number>) {
            state.tokens = state.tokens.filter((t) => t.id !== action.payload);
        },
        pushMetricsSnapshot(state, action: PayloadAction<WorkerMetrics>) {
            state.metrics = [action.payload, ...state.metrics.slice(0, 99)];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchWorkers.pending, (state) => {
                state.error = null;
            })
            .addCase(fetchWorkers.fulfilled, (state, action) => {
                state.list = action.payload;
                state.loading = false;
            })
            .addCase(fetchWorkers.rejected, (state, action) => {
                state.error = action.error.message ?? "Failed to load workers";
                state.loading = false;
            })
            .addCase(fetchWorker.fulfilled, (state, action) => {
                state.current = action.payload;
                state.loading = false;
            })
            .addCase(fetchWorker.rejected, (state, action) => {
                state.error = action.error.message ?? "Failed to load worker";
                state.loading = false;
            })
            .addCase(fetchWorkerMetrics.fulfilled, (state, action) => {
                state.metrics = action.payload;
            })
            .addCase(fetchWorkerMetrics.rejected, () => {
                // Metrics are supplementary — fail silently
            })
            .addCase(fetchWorkerTokens.fulfilled, (state, action) => {
                state.tokens = action.payload;
            })
            .addCase(fetchWorkerTokens.rejected, () => {
                // Tokens list failure is non-critical
            });
    },
});

export const { setCurrent, updateCurrent, setTokens, addToken, removeToken, pushMetricsSnapshot } =
    workersSlice.actions;

export const selectWorkers = (state: RootState) => state.workers.list;
export const selectCurrentWorker = (state: RootState) => state.workers.current;
export const selectWorkerMetrics = (state: RootState) => state.workers.metrics;
export const selectWorkerTokens = (state: RootState) => state.workers.tokens;
export const selectWorkersLoading = (state: RootState) => state.workers.loading;

export default workersSlice.reducer;
