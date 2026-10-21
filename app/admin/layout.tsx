"use client";

import React, { useEffect, useState } from "react";
import { isValidAdminSession, clearAdminSession } from "../admin-session";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return isValidAdminSession();
    }
    return false;
  });

  const [isChecking, setIsChecking] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return !isValidAdminSession();
    }
    return true;
  });

  useEffect(() => {
    const valid = isValidAdminSession();
    if (!valid) {
      clearAdminSession();
      // Absolute immediate redirect to /
      window.location.replace("/");
      return;
    }
    setIsAuthenticated(true);
    setIsChecking(false);
  }, []);

  // Direct URL Lockout: Never render any admin UI, shell, or components if unauthenticated
  if (isChecking || !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#070b14]" />
    );
  }

  return <>{children}</>;
}
