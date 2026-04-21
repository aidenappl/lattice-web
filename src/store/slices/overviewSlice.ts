import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { OverviewData, FleetMetricsPoint, AuditLogEntry } from "@/types";
import { reqGetOverview, reqGetFleetMetrics, reqGetAuditLog } from "@/services/admin.service";
import type { RootState } from "../index";

interface OverviewState {
    data: OverviewData | null;
    fleetHistory: FleetMetricsPoint[];
    auditLog: AuditLogEntry[];
    loading: boolean;
    error: string | null;
}

const initialState: OverviewState = {
    data: null,
    fleetHistory: [],
    auditLog: [],
    loading: true,
    error: null,
};

export const fetchOverview = createAsyncThunk(
    "overview/fetchOverview",
    async () => {
        const res = await reqGetOverview();
        if (res.success) return res.data;
        throw new Error(res.error_message);
    },
);

export const fetchFleetMetrics = createAsyncThunk(
    "overview/fetchFleetMetrics",
    async (range: string = "1h") => {
        const res = await reqGetFleetMetrics(range);
        if (res.success) return res.data;
        throw new Error(res.error_message);
    },
);

export const fetchAuditLog = createAsyncThunk(
    "overview/fetchAuditLog",
    async () => {
        const res = await reqGetAuditLog();
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

const overviewSlice = createSlice({
    name: "overview",
    initialState,
    reducers: {
        updateOverviewField(state, action: PayloadAction<Partial<OverviewData>>) {
            if (state.data) {
                Object.assign(state.data, action.payload);
            }
        },
        // Increment/decrement reducers that read from current state inside the reducer
        // to avoid stale-closure issues in WebSocket handlers
        incrementOverviewField(state, action: PayloadAction<{ field: keyof OverviewData; delta: number }>) {
            if (state.data) {
                const current = state.data[action.payload.field];
                if (typeof current === "number") {
                    (state.data as Record<string, unknown>)[action.payload.field] = Math.max(0, current + action.payload.delta);
                }
            }
        },
        pushFleetHistoryPoint(state, action: PayloadAction<FleetMetricsPoint>) {
            state.fleetHistory = [...state.fleetHistory.slice(-299), action.payload];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchOverview.pending, (state) => {
                state.error = null;
            })
            .addCase(fetchOverview.fulfilled, (state, action) => {
                state.data = action.payload;
                state.loading = false;
            })
            .addCase(fetchOverview.rejected, (state, action) => {
                state.error = action.error.message ?? "Failed to load overview";
                state.loading = false;
            })
            .addCase(fetchFleetMetrics.fulfilled, (state, action) => {
                state.fleetHistory = action.payload;
            })
            .addCase(fetchFleetMetrics.rejected, () => {
                // Fleet metrics are supplementary — fail silently
            })
            .addCase(fetchAuditLog.fulfilled, (state, action) => {
                state.auditLog = action.payload;
            })
            .addCase(fetchAuditLog.rejected, () => {
                // Audit log is supplementary — fail silently
            });
    },
});

export const { updateOverviewField, incrementOverviewField, pushFleetHistoryPoint } = overviewSlice.actions;

export const selectOverview = (state: RootState) => state.overview.data;
export const selectOverviewLoading = (state: RootState) => state.overview.loading;
export const selectFleetHistory = (state: RootState) => state.overview.fleetHistory;
export const selectAuditLog = (state: RootState) => state.overview.auditLog;

export default overviewSlice.reducer;
