import type { ReactNode } from "react";
import "./Dialog.css";

export function Dialog({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className="backdrop"><section className={`dialog ${className}`} role="dialog" aria-modal="true">{children}</section></div>;
}
