"use client";

import React from "react";
import "./Popup.css";

interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

export function ScrollArea({ children, className = "" }: ScrollAreaProps) {
  return <div className={`scroll-area ${className}`}>{children}</div>;
}
