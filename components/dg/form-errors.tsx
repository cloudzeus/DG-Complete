"use client";

import { createContext, useContext } from "react";

// Field errors returned by a Server Action (ADR-023), shown next to server-rendered fields.
const ErrorsContext = createContext<Record<string, string>>({});

export function ErrorsProvider({ errors, children }: { errors?: Record<string, string>; children: React.ReactNode }) {
  return <ErrorsContext.Provider value={errors ?? {}}>{children}</ErrorsContext.Provider>;
}

export function FieldError({ name }: { name: string }) {
  const msg = useContext(ErrorsContext)[name];
  if (!msg) return null;
  return (
    <p id={`${name}-error`} role="alert" className="text-xs font-medium text-danger-500">
      {msg}
    </p>
  );
}
