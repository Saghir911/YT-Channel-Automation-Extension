"use client";

import React from "react";
import "./Popup.css";


interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode; // optional icon wrapper if you want to pass one
}

export function Input({ icon, className = "", ...rest }: InputProps) {
  return (
    <div className="input-wrapper">
      {icon && <div className="input-icon">{icon}</div>}
      <input className={`search-input ${className}`} {...rest} />
    </div>
  );
}
