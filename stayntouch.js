/**
 * StayNTouch REST API Client
 *
 * Alternative to SFTP — pulls data directly from StayNTouch via their REST API.
 * Requires OAuth2 credentials from StayNTouch.
 *
 * Phase 3 Option B — implement after confirming API access with StayNTouch.
 *
 * StayNTouch API docs: https://developer.stayntouch.com
 * Contact your StayNTouch account manager to request API credentials.
 */
const axios = require('axios');

const BASE_URL = process.env.STAYNTOUCH_API_BASE || 'https://api.stayntouch.com/v1';

let _accessToken   = null;
let _tokenExpiry   = null;

/* ── OAuth2 Authentication ───────────────────────────────────────────── */
async function getAccessToken() {
  if (_accessToken && _tokenExpiry && Date.now() < _tokenExpiry) {
    return _accessToken; // reuse valid token
  }

  // TODO Phase 3: confirm correct OAuth2 endpoint with StayNTouch
  const resp = await axios.post(`${BASE_URL}/oauth/token`, {
    grant_type:    'client_credentials',
    client_id:     process.env.STAYNTOUCH_CLIENT_ID,
    client_secret: process.env.STAYNTOUCH_CLIENT_SECRET
  });

  _accessToken = resp.data.access_token;
  _tokenExpiry = Date.now() + (resp.data.expires_in * 1000) - 60000; // refresh 1 min early
  return _accessToken;
}

function authHeader() {
  return { Authorization: `Bearer ${_accessToken}` };
}

/* ── API Endpoints ───────────────────────────────────────────────────── */

/**
 * Get Business on the Books for a date range.
 * @param {string} propertyId   - StayNTouch property identifier
 * @param {string} startDate    - YYYY-MM-DD
 * @param {string} endDate      - YYYY-MM-DD
 */
async function getBusinessOnBooks(propertyId, startDate, endDate) {
  // TODO Phase 3: confirm exact endpoint path with StayNTouch docs
  await getAccessToken();
  const resp = await axios.get(`${BASE_URL}/properties/${propertyId}/reports/business-on-books`, {
    headers: authHeader(),
    params:  { start_date: startDate, end_date: endDate }
  });
  return resp.data;
}

/**
 * Get daily revenue statistics.
 */
async function getDailyRevenue(propertyId, startDate, endDate) {
  await getAccessToken();
  const resp = await axios.get(`${BASE_URL}/properties/${propertyId}/reports/daily-revenue`, {
    headers: authHeader(),
    params:  { start_date: startDate, end_date: endDate }
  });
  return resp.data;
}

/**
 * Get production by rate plan.
 */
async function getProductionByRate(propertyId, startDate, endDate) {
  await getAccessToken();
  const resp = await axios.get(`${BASE_URL}/properties/${propertyId}/reports/production-by-rate`, {
    headers: authHeader(),
    params:  { start_date: startDate, end_date: endDate }
  });
  return resp.data;
}

module.exports = { getAccessToken, getBusinessOnBooks, getDailyRevenue, getProductionByRate };
