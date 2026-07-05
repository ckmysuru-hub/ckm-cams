export const ROLES = ["director", "ops_manager", "coach", "front_desk", "finance"];

export const ROLE_LABELS = {
  director: "Director",
  ops_manager: "Ops Manager",
  coach: "Coach",
  front_desk: "Front Desk",
  finance: "Finance",
};

/** A user may have `roles` (array, current accounts) or only a legacy
 * singular `role` (older accounts before multi-role support). This checks
 * membership across either shape. */
export function hasRole(user, role) {
  if (!user) return false;
  if (Array.isArray(user.roles)) return user.roles.includes(role);
  return user.role === role;
}

export function isDirector(user) {
  return hasRole(user, "director");
}

export function userRoles(user) {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length) return user.roles;
  return user.role ? [user.role] : [];
}

export function formatRoles(user) {
  return userRoles(user).map((r) => ROLE_LABELS[r] || r.replace("_", " ")).join(", ");
}
