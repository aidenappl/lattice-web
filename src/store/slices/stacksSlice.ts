import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { Stack } from "@/types";
import { reqGetStacks, reqGetStack } from "@/services/stacks.service";
import type { RootState } from "../index";

interface StacksState {
    list: Stack[];
    current: Stack | null;
    loading: boolean;
    error: string | null;
}

const initialState: StacksState = {
    list: [],
    current: null,
    loading: true,
    error: null,
};

export const fetchStacks = createAsyncThunk(
    "stacks/fetchStacks",
    async () => {
        const res = await reqGetStacks();
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

export const fetchStack = createAsyncThunk(
    "stacks/fetchStack",
    async (id: number) => {
        const res = await reqGetStack(id);
        if (res.success) return res.data;
        throw new Error(res.error_message);
    },
);

const stacksSlice = createSlice({
    name: "stacks",
    initialState,
    reducers: {
        setCurrent(state, action: PayloadAction<Stack | null>) {
            state.current = action.payload;
        },
        updateCurrent(state, action: PayloadAction<Partial<Stack>>) {
            if (state.current) {
                Object.assign(state.current, action.payload);
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchStacks.pending, (state) => {
                state.error = null;
            })
            .addCase(fetchStacks.fulfilled, (state, action) => {
                state.list = action.payload;
                state.loading = false;
            })
            .addCase(fetchStacks.rejected, (state, action) => {
                state.error = action.error.message ?? "Failed to load stacks";
                state.loading = false;
            })
            .addCase(fetchStack.fulfilled, (state, action) => {
                state.current = action.payload;
                state.loading = false;
            });
    },
});

export const { setCurrent, updateCurrent } = stacksSlice.actions;

export const selectStacks = (state: RootState) => state.stacks.list;
export const selectCurrentStack = (state: RootState) => state.stacks.current;
export const selectStacksLoading = (state: RootState) => state.stacks.loading;
export const selectStackNameMap = (state: RootState) => {
    const map: Record<number, string> = {};
    state.stacks.list.forEach((s) => { map[s.id] = s.name; });
    return map;
};

export default stacksSlice.reducer;
