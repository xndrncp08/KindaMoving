export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.KM_DEPLOYMENT &&
    process.env.KM_DEPLOYMENT !== 'development'
  ) {
    const { deploymentErrors } = await import('./lib/server/deployment');
    const errors = deploymentErrors();
    if (errors.length)
      throw new Error('Invalid deployment configuration: ' + errors.join('; '));
  }
}
