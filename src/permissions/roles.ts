import { adminAc, ownerAc } from "better-auth/plugins/organization/access";
import { ac } from "./permission.js";

export const owner = ac.newRole({
  song: ["create", "access", "update", "delete"],
  service: ["create", "access", "update", "delete"],
  folder: ["create", "update", "access", "delete"],
  settings: ["manage"],
  export: ["pdf", "backup"],
  import: ["songs", "backup"],
  billing: ["manage", "access"],
  ...ownerAc.statements,
});

export const admin = ac.newRole({
  song: ["create", "access", "update", "delete"],
  service: ["create", "access", "update", "delete"],
  folder: ["create", "update", "access", "delete"],
  settings: ["manage"],
  export: ["pdf"],
  import: ["songs"],
  ...adminAc.statements,
});

export const teamLeader = ac.newRole({
  song: ["create", "access", "update"],
  service: ["create", "access", "update"],
  folder: ["create", "access"],
  invitation: ["create"],
  team: ["create", "update"],
  export: ["pdf"],
});

export const editor = ac.newRole({
  song: ["create", "access", "update"],
  service: ["create", "access", "update"],
  folder: ["create", "update", "access"],
  export: ["pdf"],
});

export const musician = ac.newRole({
  song: ["create", "access", "update"],
  service: ["access", "update"],
  export: ["pdf"],
});

export const guest = ac.newRole({
  song: ["access"],
  service: ["access"],
  export: ["pdf"],
});

export const roles = {
  owner,
  admin,
  teamLeader,
  editor,
  musician,
  guest,
} as const;

export type AppRole = keyof typeof roles;
