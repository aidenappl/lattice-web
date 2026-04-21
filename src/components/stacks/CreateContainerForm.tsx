"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateContainerFormProps {
  onSubmit: (data: { name: string; image: string; tag: string }) => Promise<void>;
  onCancel: () => void;
}

export function CreateContainerForm({
  onSubmit,
  onCancel,
}: CreateContainerFormProps) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [tag, setTag] = useState("latest");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !image.trim()) return;
    setCreating(true);
    await onSubmit({ name: name.trim(), image: image.trim(), tag: tag.trim() || "latest" });
    setCreating(false);
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4">
      <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
        New Container
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Input
          id="new-container-name"
          label="Name"
          placeholder="my-service"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          id="new-container-image"
          label="Image"
          placeholder="nginx"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          required
        />
        <Input
          id="new-container-tag"
          label="Tag"
          placeholder="latest"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={creating || !name.trim() || !image.trim()}
        >
          {creating ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
