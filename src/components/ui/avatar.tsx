"use client";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string;
  size?: number;
  className?: string;
}

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email?.[0] ?? "?").toUpperCase();
}

export function Avatar({ src, name, email, size = 28, className = "" }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || email || ""}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.35,
        background: "linear-gradient(135deg, var(--brand), var(--violet))",
        color: "#000",
      }}
    >
      {getInitials(name, email)}
    </div>
  );
}
