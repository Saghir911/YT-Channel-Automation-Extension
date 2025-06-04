"use client";

import React from "react";
import "./Popup.css";


interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline";
  children: React.ReactNode;
}

export function Button({ variant = "default", children, className = "", ...rest }: ButtonProps) {
  const baseClass = variant === "outline" ? "btn btn-outline" : "btn";
  return (
    <button className={`${baseClass} ${className}`} {...rest}>
      {children}
    </button>
  );
}
