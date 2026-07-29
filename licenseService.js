/**
 * License key service
 *
 * Generates and validates license keys for commercial customers.
 * Each license is tied to a property ID and has an expiry date and tier.
 *
 * Key format: HD-{TIER}-{PROPERTY_HASH}-{EXPIRY_HASH}-{CHECKSUM}
 * Example:    HD-PRO-A3F9-20261231-7C2B
 *
 * Tiers:
 *   TRIAL  — 30 days, single property, no pipeline
 *   PRO    — 1 year, single property, SFTP pipeline
 *   MULTI  — 1 year, unlimited properties, full API + white-label
 */
const crypto = require('crypto');

const TIERS = {
  TRIAL: { days: 30,  properties: 1,  pipeline: false },
  PRO:   { days: 365, properties: 1,  pipeline: true  },
  MULTI: { days: 365, properties: -1, pipeline: true  }  // -1 = unlimited
};

function generate(propertyId, tier = 'TRIAL') {
  if (!TIERS[tier]) throw new Error(`Unknown license tier: ${tier}`);

  const expiry   = new Date();
  expiry.setDate(expiry.getDate() + TIERS[tier].days);
  const expiryStr = expiry.toISOString().slice(0, 10).replace(/-/g, '');

  const propHash = crypto
    .createHmac('sha256', process.env.LICENSE_SECRET || 'dev-secret')
    .update(String(propertyId))
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();

  const payload  = `HD-${tier}-${propHash}-${expiryStr}`;
  const checksum = crypto
    .createHmac('sha256', process.env.LICENSE_SECRET || 'dev-secret')
    .update(payload)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();

  return `${payload}-${checksum}`;
}

function validate(licenseKey, propertyId) {
  try {
    const parts = licenseKey.split('-');
    // Expected: ['HD', tier, propHash, expiryStr, checksum]
    if (parts.length !== 5 || parts[0] !== 'HD') {
      return { valid: false, reason: 'Malformed license key.' };
    }

    const [, tier, propHash, expiryStr, checksum] = parts;

    if (!TIERS[tier]) {
      return { valid: false, reason: 'Unknown license tier.' };
    }

    // Verify checksum
    const payload       = `HD-${tier}-${propHash}-${expiryStr}`;
    const expectedCheck = crypto
      .createHmac('sha256', process.env.LICENSE_SECRET || 'dev-secret')
      .update(payload)
      .digest('hex')
      .slice(0, 4)
      .toUpperCase();

    if (checksum !== expectedCheck) {
      return { valid: false, reason: 'License key checksum invalid.' };
    }

    // Verify property binding
    const expectedPropHash = crypto
      .createHmac('sha256', process.env.LICENSE_SECRET || 'dev-secret')
      .update(String(propertyId))
      .digest('hex')
      .slice(0, 4)
      .toUpperCase();

    if (propHash !== expectedPropHash) {
      return { valid: false, reason: 'License key not valid for this property.' };
    }

    // Check expiry
    const expiry = new Date(
      `${expiryStr.slice(0,4)}-${expiryStr.slice(4,6)}-${expiryStr.slice(6,8)}`
    );
    if (new Date() > expiry) {
      return { valid: false, reason: 'License key has expired.' };
    }

    return {
      valid: true,
      license: { tier, expiry, features: TIERS[tier] }
    };
  } catch (err) {
    return { valid: false, reason: 'License validation error.' };
  }
}

module.exports = { generate, validate, TIERS };
