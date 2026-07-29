/**
 * License Key Generator
 *
 * Usage:
 *   node scripts/generate-license.js <propertyId> <tier>
 *
 * Examples:
 *   node scripts/generate-license.js 42 PRO
 *   node scripts/generate-license.js 42 TRIAL
 *   node scripts/generate-license.js 42 MULTI
 *
 * Phase 4
 */
require('dotenv').config({ path: './server/config/.env' });
const { generate, TIERS } = require('./server/services/licenseService');

const [,, propertyId, tier = 'TRIAL'] = process.argv;

if (!propertyId) {
  console.error('Usage: node scripts/generate-license.js <propertyId> <tier>');
  console.error('Tiers:', Object.keys(TIERS).join(', '));
  process.exit(1);
}

if (!TIERS[tier]) {
  console.error(`Unknown tier "${tier}". Valid tiers: ${Object.keys(TIERS).join(', ')}`);
  process.exit(1);
}

const key = generate(propertyId, tier);
const info = TIERS[tier];

console.log('\n──────────────────────────────────');
console.log('  License Key Generated');
console.log('──────────────────────────────────');
console.log(`  Key:        ${key}`);
console.log(`  Property:   ${propertyId}`);
console.log(`  Tier:       ${tier}`);
console.log(`  Duration:   ${info.days} days`);
console.log(`  Properties: ${info.properties === -1 ? 'unlimited' : info.properties}`);
console.log(`  Pipeline:   ${info.pipeline ? 'yes' : 'no'}`);
console.log('──────────────────────────────────\n');
