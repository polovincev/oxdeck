import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger";
};

export function Button({ variant, className, ...props }: ButtonProps) {
  const classes = [variant && `button-${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes || undefined} {...props} />;
}
