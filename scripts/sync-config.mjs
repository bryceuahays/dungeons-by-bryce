// Copies the plan limits from src/config/plans.ts into the database, where the limits
// are enforced.   npm run sync-config
import { admin } from '../tests/helpers.mjs';
import { dbPlanConfig } from '../src/config/plans.ts';

const value = JSON.stringify(dbPlanConfig());
const { error } = await admin.from('app_config').upsert({ key: 'plans', value });
if (error) { console.error(error.message); process.exit(1); }
console.log('Plan limits written to the database:', value);
