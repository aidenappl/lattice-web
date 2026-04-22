"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/store/hooks";
import { reqGetSelf, reqUpdateSelf } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/utils";
import { useAppDispatch } from "@/store/hooks";
import { setUser } from "@/store/slices/authSlice";
import toast from "react-hot-toast";
import type { User } from "@/types";

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "admin":
      return "error" as const;
    case "editor":
      return "warning" as const;
    case "viewer":
      return "success" as const;
    case "pending":
      return "default" as const;
    default:
      return "default" as const;
  }
};

export default function ProfilePage() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setNameChanged(name !== (user.name || ""));
    }
  }, [name, user]);

  const handleSaveName = async () => {
    if (!nameChanged) return;
    setSaving(true);
    const res = await reqUpdateSelf({ name });
    setSaving(false);
    if (res.success) {
      toast.success("Profile updated.");
      dispatch(setUser(res.data as User));
    } else {
      toast.error(
        "error_message" in res ? res.error_message : "Failed to update profile",
      );
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }
    if (!newPassword) {
      setPasswordError("New password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setChangingPassword(true);
    const res = await reqUpdateSelf({
      current_password: currentPassword,
      new_password: newPassword,
    });
    setChangingPassword(false);

    if (res.success) {
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPasswordError(
        "error_message" in res
          ? res.error_message
          : "Failed to change password",
      );
    }
  };

  if (!user) return null;

  const isLocalAuth = user.auth_type === "local";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col items-center gap-3">
        {user.profile_image_url ? (
          <img
            src={user.profile_image_url}
            alt=""
            className="rounded-full object-cover"
            style={{ width: 72, height: 72 }}
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-full text-xl font-semibold"
            style={{
              width: 72,
              height: 72,
              background: "linear-gradient(135deg, var(--brand), var(--violet))",
              color: "#000",
            }}
          >
            {(user.name || user.email)
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
        )}
        <div className="text-center">
          <h1 className="text-lg font-semibold text-primary">Profile</h1>
          <p className="text-sm text-secondary mt-1">
            Manage your account settings.
          </p>
        </div>
      </div>

      {/* Profile info section */}
      <div className="rounded-lg border border-border-strong bg-surface p-5 space-y-5">
        <div className="space-y-4">
          <Input
            id="name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-secondary uppercase tracking-wider">
              Email
            </label>
            <div className="h-9 flex items-center px-3 rounded-lg border border-border-strong bg-surface-elevated text-sm text-muted">
              {user.email}
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                Role
              </label>
              <Badge variant={roleBadgeVariant(user.role)}>
                {user.role}
              </Badge>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                Auth Type
              </label>
              <span className="text-sm text-secondary">
                {user.auth_type === "local"
                  ? "Local"
                  : user.auth_type === "sso"
                    ? "SSO"
                    : "OAuth"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-secondary uppercase tracking-wider">
                Account Created
              </label>
              <span className="text-sm text-secondary">
                {formatDate(user.inserted_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border-subtle">
          <Button
            onClick={handleSaveName}
            loading={saving}
            disabled={!nameChanged}
          >
            Save Profile
          </Button>
        </div>
      </div>

      {/* Password change section (local auth only) */}
      {isLocalAuth && (
        <div className="rounded-lg border border-border-strong bg-surface p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-primary">
              Change Password
            </h2>
            <p className="text-xs text-secondary mt-1">
              Update your password. You will need to enter your current password
              for verification.
            </p>
          </div>

          {passwordError && (
            <Alert variant="error">{passwordError}</Alert>
          )}

          <Input
            id="current-password"
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />

          <Input
            id="new-password"
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
          />

          <Input
            id="confirm-password"
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />

          <div className="flex justify-end pt-2 border-t border-border-subtle">
            <Button
              onClick={handleChangePassword}
              loading={changingPassword}
              disabled={!currentPassword || !newPassword || !confirmPassword}
            >
              Change Password
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
