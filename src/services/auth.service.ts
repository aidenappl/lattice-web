import { User } from "@/types";
import { fetchApi } from "./api.service";

export const reqGetSelf = () =>
    fetchApi<User>({
        method: "GET",
        url: "/auth/self",
    });

export const reqLogin = (email: string, password: string) =>
    fetchApi<{ user: User; access_token: string; expires_at: string }>({
        method: "POST",
        url: "/auth/login",
        data: { email, password },
    });

export const reqLogout = () =>
    fetchApi<null>({
        method: "POST",
        url: "/auth/logout",
    });

export const reqUpdateSelf = (data: { name?: string; current_password?: string; new_password?: string; profile_image_url?: string }) =>
    fetchApi<User>({
        method: "PUT",
        url: "/auth/self",
        data,
    });
