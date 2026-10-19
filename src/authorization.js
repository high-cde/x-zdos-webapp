const permissions = {
  viewer: new Set(['mission:read']),
  member: new Set(['mission:read', 'mission:write', 'event:write', 'ai:generate']),
  manager: new Set(['mission:read', 'mission:write', 'mission:manage', 'event:write', 'ai:generate']),
  admin: new Set(['mission:read', 'mission:write', 'mission:manage', 'event:write', 'ai:generate', 'workspace:admin'])
};

export function can(role, permission) {
  return permissions[role]?.has(permission) ?? false;
}

export function assertTransition(from, to, progress) {
  const allowed = {
    planned: ['active', 'cancelled'],
    active: ['blocked', 'completed', 'cancelled'],
    blocked: ['active', 'cancelled'],
    completed: [],
    cancelled: []
  };
  if (!Object.hasOwn(allowed, from) || !allowed[from].includes(to)) throw Object.assign(new Error('Invalid mission status transition'), { statusCode: 422 });
  if (to === 'completed' && progress !== 100) throw Object.assign(new Error('Completed missions must have progress 100'), { statusCode: 422 });
}
