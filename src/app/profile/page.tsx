"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/store/hooks";
import { reqGetSelf, reqUpdateSelf } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
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
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);
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
      setProfileImageUrl(user.profile_image_url || "");
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
        <button
          type="button"
          onClick={() => setEditingAvatar(!editingAvatar)}
          className="relative group cursor-pointer rounded-full"
          title="Change profile picture"
        >
          <Avatar src={user.profile_image_url} name={user.name} email={user.email} size={72} />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-white text-[10px] font-medium">Edit</span>
          </div>
        </button>

        {editingAvatar && (
          <div className="w-full max-w-sm space-y-2">
            <Input
              id="profile-image-url"
              label="Profile Image URL"
              type="url"
              placeholder="https://example.com/photo.jpg"
              value={profileImageUrl}
              onChange={(e) => setProfileImageUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const res = await reqUpdateSelf({ profile_image_url: profileImageUrl || undefined });
                  setSaving(false);
                  if (res.success) {
                    toast.success("Profile picture updated");
                    dispatch(setUser(res.data as User));
                    setEditingAvatar(false);
                  } else {
                    toast.error("Failed to update picture");
                  }
                }}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingAvatar(false)}>
                Cancel
              </Button>
              {user.profile_image_url && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    const res = await reqUpdateSelf({ profile_image_url: "" });
                    setSaving(false);
                    if (res.success) {
                      toast.success("Profile picture removed");
                      dispatch(setUser(res.data as User));
                      setProfileImageUrl("");
                      setEditingAvatar(false);
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
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
