import { User } from "@/types";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
    is_logged: boolean;
    is_loading: boolean;
    user: User | null;
}

const initialState: AuthState = {
    is_logged: false,
    is_loading: true,
    user: null,
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        setIsLogged(state, action: PayloadAction<boolean>) {
            state.is_logged = action.payload;
        },
        setUser(state, action: PayloadAction<User | null>) {
            state.user = action.payload;
        },
        setIsLoading(state, action: PayloadAction<boolean>) {
            state.is_loading = action.payload;
        },
    },
});

export const { setIsLogged, setUser, setIsLoading } = authSlice.actions;
export const selectIsLogged = (state: { auth: AuthState }) =>
    state.auth.is_logged;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsLoading = (state: { auth: AuthState }) =>
    state.auth.is_loading;
export default authSlice.reducer;
