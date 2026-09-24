"use client";

import { useState } from "react";

export function ShareButton({ text, title }: { text: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "sharing" | "shared" | "copied" | "failed">("idle");

  async function share() {
    if (!text || status === "sharing") return;
    setStatus("sharing");
    const touch =
      window.matchMedia("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ text, title });
        setStatus("shared");
        return;
      } catch {
        // A dismissed share sheet still leaves the player a copied result.
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setStatus("copied");
        return;
      } catch {
        // Permissions or insecure contexts may still allow the legacy copy path.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      setStatus(document.execCommand("copy") ? "copied" : "failed");
    } catch {
      setStatus("failed");
    } finally {
      textarea.remove();
    }
  }

  return (
    <button
      type="button"
      className="primary"
      onClick={share}
      disabled={!text || status === "sharing"}
      aria-live="polite"
    >
      {status === "copied"
        ? "Copied"
        : status === "shared"
          ? "Shared"
          : status === "failed"
            ? "Couldn’t copy"
            : "Share"}
    </button>
  );
}
