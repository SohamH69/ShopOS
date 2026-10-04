import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import type { Permission } from "../../lib/types";
import { NoAccess } from "./NoAccess";

export interface RequirePermissionProps {
  /** One permission, or several where any one is enough. */
  permission: Permission | readonly Permission[];
  children: ReactNode;
}

/** Renders children when the user has the permission; otherwise a calm "no access" message. */
export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { can } = useAuth();
  if (can(permission)) return <>{children}</>;
  return <NoAccess permission={typeof permission === "string" ? permission : permission[0]} />;
}
