export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumn('oidc_transactions', {
    is_signup: { type: 'boolean', notNull: true, default: false }
  });
}

export async function down(pgm) {
  pgm.dropColumn('oidc_transactions', 'is_signup');
}
