/**
 * License key validation middleware.
 * Checks that the authenticated user's property has a valid, unexpired license.
 *
 * Phase 4 — plug this in after auth middleware on any licensed feature route.
 *
 * Usage:
 *   const auth    = require('../middleware/auth');
 *   const license = require('../middleware/license');
 *   router.get('/reports', auth, license, reportsController.get);
 */
const licenseService = require('../services/licenseService');

module.exports = async function licenseCheck(req, res, next) {
  try {
    const { licenseKey, propertyId } = req.user;
    if (!licenseKey) {
      return res.status(403).json({
        error: 'No license key associated with this account.',
        upgradeUrl: 'https://your-domain.com/pricing'
      });
    }

    const result = await licenseService.validate(licenseKey, propertyId);

    if (!result.valid) {
      return res.status(403).json({
        error: result.reason,
        upgradeUrl: 'https://your-domain.com/pricing'
      });
    }

    // Attach license metadata for downstream use
    req.license = result.license;
    next();
  } catch (err) {
    console.error('License check error:', err);
    return res.status(500).json({ error: 'License validation failed.' });
  }
};
