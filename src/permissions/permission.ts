import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  billing: ["manage", "access"],
  song: ["create", "access", "update", "delete"],
  service: ["create", "access", "update", "delete"],
  folder: ["create", "update", "access", "delete"],
  settings: ["manage"],
  export: ["pdf", "backup"],
  import: ["songs", "backup"],
} as const;

export const ac = createAccessControl(statement);

export type Statement = typeof statement;
export type Resource = keyof Statement;
export type ActionFor<R extends Resource> = Statement[R][number];

export type PermissionString = {
  [R in Resource]: `${R}.${ActionFor<R>}`;
}[Resource];

export type PermissionRequest = {
  [R in Resource]?: ActionFor<R>[];
};

export function toPermissionRequest(
  permission: PermissionString,
): PermissionRequest {
  const dotIndex = permission.indexOf(".");
  const resource = permission.slice(0, dotIndex) as Resource;
  const action = permission.slice(dotIndex + 1) as ActionFor<typeof resource>;
  return { [resource]: [action] } as PermissionRequest;
}
