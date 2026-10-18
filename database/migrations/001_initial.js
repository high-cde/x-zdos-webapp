export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable('workspaces', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createTable('users', {
    id: { type: 'text', primaryKey: true },
    oidc_issuer: { type: 'text', notNull: true },
    oidc_subject: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true },
    display_name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('users', 'users_oidc_identity_unique', { unique: ['oidc_issuer', 'oidc_subject'] });
  pgm.createTable('workspace_memberships', {
    workspace_id: { type: 'text', notNull: true, references: 'workspaces', onDelete: 'CASCADE' },
    user_id: { type: 'text', notNull: true, references: 'users', onDelete: 'CASCADE' },
    role: { type: 'text', notNull: true, check: "role IN ('viewer','member','manager','admin')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('workspace_memberships', 'workspace_memberships_pk', { primaryKey: ['workspace_id', 'user_id'] });
  pgm.createTable('missions', {
    id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true, references: 'workspaces', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    domain: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'planned', check: "status IN ('planned','active','blocked','completed','cancelled')" },
    progress: { type: 'integer', notNull: true, default: 0, check: 'progress BETWEEN 0 AND 100' },
    owner_id: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('missions', 'missions_owner_membership_fk', { foreignKeys: { columns: ['workspace_id', 'owner_id'], references: { name: 'workspace_memberships', columns: ['workspace_id', 'user_id'] } } });
  pgm.createTable('events', {
    id: { type: 'text', primaryKey: true },
    workspace_id: { type: 'text', notNull: true, references: 'workspaces', onDelete: 'CASCADE' },
    event_type: { type: 'text', notNull: true },
    actor_id: { type: 'text' },
    payload_json: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.addConstraint('events', 'events_actor_membership_fk', { foreignKeys: { columns: ['workspace_id', 'actor_id'], references: { name: 'workspace_memberships', columns: ['workspace_id', 'user_id'] } } });
  pgm.createIndex('missions', ['workspace_id', 'id'], { name: 'missions_workspace_id_idx' });
  pgm.createIndex('missions', ['workspace_id', 'status', 'id'], { name: 'missions_workspace_id_status_idx' });
  pgm.createIndex('events', ['workspace_id', 'created_at'], { name: 'events_workspace_id_created_at_idx' });
  pgm.createTable('sessions', {
    id_hash: { type: 'text', primaryKey: true },
    user_id: { type: 'text', notNull: true, references: 'users', onDelete: 'CASCADE' },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('sessions', 'expires_at', { name: 'sessions_expires_at_idx' });
  pgm.createTable('oidc_transactions', {
    id_hash: { type: 'text', primaryKey: true },
    state: { type: 'text', notNull: true },
    nonce: { type: 'text', notNull: true },
    code_verifier: { type: 'text', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true }
  });
}

export async function down(pgm) {
  pgm.dropTable('oidc_transactions');
  pgm.dropTable('sessions');
  pgm.dropTable('events');
  pgm.dropTable('missions');
  pgm.dropTable('workspace_memberships');
  pgm.dropTable('users');
  pgm.dropTable('workspaces');
}
