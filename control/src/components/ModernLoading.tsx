"use client";

import { Scale } from "lucide-react";

interface ModernLoadingProps {
  fullScreen?: boolean;
  message?: string;
}

export function ModernLoading({ fullScreen = false, message = "Cargando..." }: ModernLoadingProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Animated Logo */}
      <div className="relative">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center animate-pulse"
          style={{
            background: "linear-gradient(135deg, var(--lemon) 0%, #E6FFBF 100%)",
            boxShadow: "0 8px 32px rgba(156, 255, 0, 0.25)"
          }}
        >
          <Scale className="w-8 h-8" style={{ color: "#050606" }} />
        </div>
        
        {/* Spinning ring */}
        <div
          className="absolute inset-0 rounded-xl"
          style={{
            border: "3px solid transparent",
            borderTopColor: "var(--gold)",
            animation: "spin 1s linear infinite"
          }}
        />
      </div>

      {/* Message */}
      <div className="text-center">
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>
          {message}
        </p>
        <div className="flex items-center justify-center gap-1">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--gold)", animationDelay: "0ms" }}
          />
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--gold)", animationDelay: "150ms" }}
          />
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--gold)", animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{
          background: "rgba(5, 6, 6, 0.92)",
          backdropFilter: "blur(8px)"
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      {content}
    </div>
  );
}

// Add keyframes for spin animation
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `;
  document.head.appendChild(style);
}
