import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import overviewReducer from "./slices/overviewSlice";
import workersReducer from "./slices/workersSlice";
import stacksReducer from "./slices/stacksSlice";
import containersReducer from "./slices/containersSlice";

export const makeStore = () => {
    return configureStore({
        reducer: {
            auth: authReducer,
            overview: overviewReducer,
            workers: workersReducer,
            stacks: stacksReducer,
            containers: containersReducer,
        },
        middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
    });
};

// Infer the type of makeStore
export type AppStore = ReturnType<typeof makeStore>;
// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
