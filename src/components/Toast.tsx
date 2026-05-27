"use client";

import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = "info", duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const config = {
    success: {
      icon: <CheckCircle size={20} />,
      color: "#4ADE80",
      bg: "rgba(42, 107, 79, 0.95)",
      border: "#4ADE80"
    },
    error: {
      icon: <AlertCircle size={20} />,
      color: "var(--red)",
      bg: "rgba(139, 32, 32, 0.95)",
      border: "var(--red)"
    },
    warning: {
      icon: <AlertCircle size={20} />,
      color: "#FBBF24",
      bg: "rgba(160, 92, 26, 0.95)",
      border: "#FBBF24"
    },
    info: {
      icon: <Info size={20} />,
      color: "#60A5FA",
      bg: "rgba(26, 74, 122, 0.95)",
      border: "#60A5FA"
    }
  };

  const currentConfig = config[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl transition-all duration-300 ${
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
      style={{
        background: currentConfig.bg,
        border: `1px solid ${currentConfig.border}`,
        backdropFilter: "blur(10px)",
        minWidth: "300px",
        maxWidth: "500px"
      }}
    >
      <div style={{ color: "var(--text)" }}>{currentConfig.icon}</div>
      <p className="flex-1 text-sm font-medium text-[var(--text)]">{message}</p>
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="p-1 rounded hover:bg-[var(--surface)]/20 transition-colors"
        style={{ color: "var(--text)" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// Toast Container Component
interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            animation: "slideIn 0.3s ease-out",
            animationDelay: `${index * 100}ms`
          }}
        >
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => onRemove(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
