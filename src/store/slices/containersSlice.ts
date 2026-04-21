import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { Container } from "@/types";
import { reqGetAllContainers, reqGetContainers } from "@/services/stacks.service";
import type { RootState } from "../index";

interface ContainersState {
    list: Container[];
    stackContainers: Container[];
    loading: boolean;
    error: string | null;
}

const initialState: ContainersState = {
    list: [],
    stackContainers: [],
    loading: true,
    error: null,
};

export const fetchAllContainers = createAsyncThunk(
    "containers/fetchAll",
    async () => {
        const res = await reqGetAllContainers();
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

export const fetchContainersByStack = createAsyncThunk(
    "containers/fetchByStack",
    async (stackId: number) => {
        const res = await reqGetContainers(stackId);
        if (res.success) return res.data ?? [];
        throw new Error(res.error_message);
    },
);

const containersSlice = createSlice({
    name: "containers",
    initialState,
    reducers: {
        setStackContainers(state, action: PayloadAction<Container[]>) {
            state.stackContainers = action.payload;
        },
        addStackContainer(state, action: PayloadAction<Container>) {
            state.stackContainers = [...state.stackContainers, action.payload];
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchAllContainers.pending, (state) => {
                state.error = null;
            })
            .addCase(fetchAllContainers.fulfilled, (state, action) => {
                state.list = action.payload;
                state.loading = false;
            })
            .addCase(fetchAllContainers.rejected, (state, action) => {
                state.error = action.error.message ?? "Failed to load containers";
                state.loading = false;
            })
            .addCase(fetchContainersByStack.fulfilled, (state, action) => {
                state.stackContainers = action.payload;
                state.loading = false;
            });
    },
});

export const { setStackContainers, addStackContainer } = containersSlice.actions;

export const selectAllContainers = (state: RootState) => state.containers.list;
export const selectStackContainers = (state: RootState) => state.containers.stackContainers;
export const selectContainersLoading = (state: RootState) => state.containers.loading;

export default containersSlice.reducer;
