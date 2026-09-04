import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger";
  wide?: boolean;
};

export function Button({ variant, wide, className, ...props }: ButtonProps) {
  const classes = [variant && `button-${variant}`, wide && "button-wide", className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes || undefined} {...props} />;
}
