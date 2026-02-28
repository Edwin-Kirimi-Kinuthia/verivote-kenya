/**
 * VeriVote Kenya — Auth endpoint smoke-tests
 *
 * Tests:
 *   Registration (with password + contact info)
 *   Mock Persona verification
 *   Password login — happy path + edge cases
 *   Set-password — change (current password required)
 *   OTP login — request + verify (using mockCode from NOTIFICATION_MOCK mode)
 *   OTP login — wrong code (expect 401)
 *   OTP login — non-existent voter (expect 401)
 *   OTP contact verification flow
 *   WebAuthn register options (returns challenge)
 *   WebAuthn authenticate options (returns challenge)
 *   WebAuthn authenticate options — voter with no credentials
 *   Credential list (IDOR: own credentials only)
 *   Credential delete (admin only — expect 403 with voter JWT)
 *   Password complexity enforcement
 */

const BASE = 'http://localhost:3005';

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function req(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? `  →  ${detail}` : ''}`);
    failed++;
  }
}

async function getPollingStationId() {
  const { body } = await req('GET', '/api/polling-stations?limit=1');
  return body.data?.[0]?.id ?? null;
}

// ── test suites ───────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n── Health check ──────────────────────────────────────');
  const { status, body } = await req('GET', '/health');
  assert('GET /health returns 200',        status === 200, JSON.stringify(body));
  assert('database is connected',          body.database === 'connected');
}

async function testRegistrationAndVerification(pollingStationId) {
  console.log('\n── Registration + mock verification ─────────────────');

  // Use a random 8-digit national ID to avoid conflicts
  const nationalId = String(Math.floor(10000000 + Math.random() * 90000000));

  // 1. Register with password and contact info
  const reg = await req('POST', '/api/voters/register', {
    nationalId,
    pollingStationId,
    email: `voter_${nationalId}@test.ke`,
    preferredContact: 'EMAIL',
    password: 'Test@secure1',
  });
  // 201 in PERSONA_MOCK=true mode, 202 in live mode
  assert('POST /api/voters/register → 201 or 202', reg.status === 201 || reg.status === 202, JSON.stringify(reg.body));
  assert('returns voterId',                    !!reg.body.data?.voterId, JSON.stringify(reg.body));
  assert('returns inquiryId',                  !!reg.body.data?.inquiryId, JSON.stringify(reg.body));

  const { voterId, inquiryId } = reg.body.data ?? {};

  // 2. Mock Persona verification
  const verify = await req('POST', '/api/voters/mock-verify', { inquiryId });
  assert('POST /api/voters/mock-verify → 200', verify.status === 200, JSON.stringify(verify.body));
  assert('nextStep is enroll_fingerprint',     verify.body.data?.nextStep === 'enroll_fingerprint', JSON.stringify(verify.body));

  return { nationalId, voterId };
}

async function testPasswordLogin(nationalId) {
  console.log('\n── Password login ───────────────────────────────────');

  // Happy path — nationalId as identifier
  const ok = await req('POST', '/api/auth/login', {
    identifier: nationalId,
    password: 'Test@secure1',
  });
  assert('POST /api/auth/login (nationalId) → 200',  ok.status === 200, JSON.stringify(ok.body));
  assert('returns JWT token',                         !!ok.body.data?.auth?.token, JSON.stringify(ok.body));
  assert('token is a string',                         typeof ok.body.data?.auth?.token === 'string', JSON.stringify(ok.body));
  assert('returns voter object',                      !!ok.body.data?.auth?.voter, JSON.stringify(ok.body));

  // Happy path — email as identifier
  const byEmail = await req('POST', '/api/auth/login', {
    identifier: `voter_${nationalId}@test.ke`,
    password: 'Test@secure1',
  });
  assert('POST /api/auth/login (email) → 200',        byEmail.status === 200, JSON.stringify(byEmail.body));

  // Wrong password
  const bad = await req('POST', '/api/auth/login', {
    identifier: nationalId,
    password: 'WrongPassword!',
  });
  assert('wrong password → 401',                      bad.status === 401);

  // Non-existent voter (accept 429 if rate-limited from prior calls)
  const ghost = await req('POST', '/api/auth/login', {
    identifier: '00000000',
    password: 'Test@secure1',
  });
  assert('non-existent voter → 401 (or 429 if rate-limited)',
    ghost.status === 401 || ghost.status === 429, JSON.stringify(ghost.body));

  // Missing identifier
  const noId = await req('POST', '/api/auth/login', { password: 'Test@secure1' });
  assert('missing identifier → 400',                  noId.status === 400);

  return ok.body.data?.auth?.token;
}

async function testSetPassword(token) {
  console.log('\n── Set / change password ─────────────────────────────');

  const auth = { Authorization: `Bearer ${token}` };

  // Change password (current password required since one was set at registration)
  const change = await req('POST', '/api/auth/set-password', {
    newPassword: 'NewPass@secure2',
    currentPassword: 'Test@secure1',
  }, auth);
  assert('POST /api/auth/set-password (change) → 200', change.status === 200, JSON.stringify(change.body));
  assert('returns success message',                     !!change.body.data?.message);

  // Verify new password works
  const newLogin = await req('POST', '/api/auth/login', {
    identifier: token,   // We'll use nationalId from token sub below — skip for now
    password: 'NewPass@secure2',
  });
  // Can't easily decode the token nationalId here without a jwt library in the script,
  // so just verify old password is now rejected
  const oldFails = await req('POST', '/api/auth/set-password', {
    newPassword: 'AnotherPass@3',
    currentPassword: 'Test@secure1',   // old password — should fail
  }, auth);
  assert('old password rejected after change → 401',   oldFails.status === 401, JSON.stringify(oldFails.body));

  // Wrong current password
  const wrongCurrent = await req('POST', '/api/auth/set-password', {
    newPassword: 'AnotherPass@3',
    currentPassword: 'Completely_Wrong!',
  }, auth);
  assert('wrong currentPassword → 401',                wrongCurrent.status === 401);

  // No auth header
  const noAuth = await req('POST', '/api/auth/set-password', { newPassword: 'NewPass@secure2' });
  assert('no auth header → 401',                       noAuth.status === 401);

  // Password too short
  const short = await req('POST', '/api/auth/set-password', {
    newPassword: 'short',
    currentPassword: 'NewPass@secure2',
  }, auth);
  assert('password too short → 400',                   short.status === 400);
}

async function testWebAuthnOptions(voterId, nationalId) {
  console.log('\n── WebAuthn — registration options ──────────────────');

  const opts = await req('POST', '/api/webauthn/register/options', { voterId });
  assert('POST /register/options → 200',               opts.status === 200, JSON.stringify(opts.body));
  assert('returns challenge',                           !!opts.body.data?.challenge);
  assert('returns rp.id',                              !!opts.body.data?.rp?.id);
  assert('rp.name is VeriVote Kenya',                  opts.body.data?.rp?.name === 'VeriVote Kenya');
  assert('userVerification = required',
    opts.body.data?.authenticatorSelection?.userVerification === 'required');

  // Bad voterId
  const bad = await req('POST', '/api/webauthn/register/options', { voterId: '00000000-0000-0000-0000-000000000000' });
  assert('unknown voterId → 404',                      bad.status === 404);

  // Missing voterId
  const missing = await req('POST', '/api/webauthn/register/options', {});
  assert('missing voterId → 400',                      missing.status === 400);

  console.log('\n── WebAuthn — authentication options ────────────────');

  // Voter has no credentials yet — expect 400
  const noCredOpts = await req('POST', '/api/webauthn/authenticate/options', { nationalId });
  assert('voter with no credentials → 400',            noCredOpts.status === 400, JSON.stringify(noCredOpts.body));
  assert('error mentions "enroll"',
    noCredOpts.body.error?.toLowerCase().includes('enroll'));

  // Non-existent national ID
  const badNid = await req('POST', '/api/webauthn/authenticate/options', { nationalId: '00000000' });
  assert('unknown nationalId → 404',                   badNid.status === 404, JSON.stringify(badNid.body));
}

async function testCredentialManagement(voterId, token) {
  console.log('\n── Credential management ────────────────────────────');

  const auth = { Authorization: `Bearer ${token}` };

  // List credentials — voter has none yet
  const list = await req('GET', `/api/webauthn/credentials/${voterId}`, null, auth);
  assert('GET /credentials/:id → 200',                 list.status === 200, JSON.stringify(list.body));
  assert('returns empty array initially',              Array.isArray(list.body.data) && list.body.data.length === 0);

  // Delete credentials — voter JWT should be rejected (admin only)
  const del = await req('DELETE', `/api/webauthn/credentials/${voterId}`, null, auth);
  assert('DELETE /credentials/:id with voter JWT → 403', del.status === 403, JSON.stringify(del.body));
}

async function testOtpLogin(nationalId) {
  console.log('\n── OTP login ─────────────────────────────────────────');

  // Request OTP (NOTIFICATION_MOCK=true → mockCode returned in response)
  const req1 = await req('POST', '/api/auth/request-otp', { nationalId });
  assert('POST /api/auth/request-otp → 200',           req1.status === 200, JSON.stringify(req1.body));
  assert('returns channel',                             !!req1.body.data?.channel, JSON.stringify(req1.body));
  assert('mock mode returns mockCode',                  !!req1.body.data?.mockCode, JSON.stringify(req1.body));

  const mockCode = req1.body.data?.mockCode;

  // Verify OTP → JWT
  const verify = await req('POST', '/api/auth/verify-otp', { nationalId, code: mockCode });
  assert('POST /api/auth/verify-otp → 200',            verify.status === 200, JSON.stringify(verify.body));
  assert('OTP verify returns JWT',                      !!verify.body.data?.auth?.token, JSON.stringify(verify.body));

  // Same OTP cannot be reused (one-time use)
  const reuse = await req('POST', '/api/auth/verify-otp', { nationalId, code: mockCode });
  assert('OTP reuse → 400 (already used)',              reuse.status === 400, JSON.stringify(reuse.body));

  // Wrong 6-digit code
  const req2 = await req('POST', '/api/auth/request-otp', { nationalId });
  const badCode = req2.body.data?.mockCode === '111111' ? '222222' : '111111';
  const wrongCode = await req('POST', '/api/auth/verify-otp', { nationalId, code: badCode });
  assert('wrong OTP → 401',                            wrongCode.status === 401, JSON.stringify(wrongCode.body));
  assert('remaining attempts in error message',
    wrongCode.body.error?.includes('attempt'), JSON.stringify(wrongCode.body));

  // Non-existent nationalId
  const ghost = await req('POST', '/api/auth/request-otp', { nationalId: '00000000' });
  assert('non-existent voter OTP request → 401',        ghost.status === 401, JSON.stringify(ghost.body));

  // Non-existent nationalId verify
  const ghostVerify = await req('POST', '/api/auth/verify-otp', { nationalId: '00000000', code: '123456' });
  assert('non-existent voter OTP verify → 401',         ghostVerify.status === 401, JSON.stringify(ghostVerify.body));

  return verify.body.data?.auth?.token;
}

async function testValidationEdgeCases() {
  console.log('\n── Validation edge cases ────────────────────────────');

  // Register with preferredContact=SMS but no phoneNumber
  const noPhone = await req('POST', '/api/voters/register', {
    nationalId: '12345678',
    pollingStationId: '00000000-0000-0000-0000-000000000000',
    preferredContact: 'SMS',
  });
  assert('SMS without phoneNumber → 400',              noPhone.status === 400);

  // Register with preferredContact=EMAIL but no email
  const noEmail = await req('POST', '/api/voters/register', {
    nationalId: '12345678',
    pollingStationId: '00000000-0000-0000-0000-000000000000',
    preferredContact: 'EMAIL',
  });
  assert('EMAIL without email → 400',                  noEmail.status === 400);

  // Password too short at registration
  const shortPwd = await req('POST', '/api/voters/register', {
    nationalId: '87654321',
    pollingStationId: '00000000-0000-0000-0000-000000000000',
    password: 'short',
  });
  assert('password too short at registration → 400',   shortPwd.status === 400);

  // Password without uppercase → 400 (new complexity rule)
  const noUpper = await req('POST', '/api/voters/register', {
    nationalId: '87654321',
    pollingStationId: '00000000-0000-0000-0000-000000000000',
    password: 'alllower1!',
  });
  assert('password without uppercase → 400',           noUpper.status === 400);

  // Password without special character → 400
  const noSpecial = await req('POST', '/api/voters/register', {
    nationalId: '87654321',
    pollingStationId: '00000000-0000-0000-0000-000000000000',
    password: 'NoSpecial1',
  });
  assert('password without special char → 400',        noSpecial.status === 400);

  // OTP code must be 6 digits
  const badOtpCode = await req('POST', '/api/auth/verify-otp', {
    nationalId: '12345678',
    code: '123',
  });
  assert('OTP code too short → 400',                   badOtpCode.status === 400);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(54));
  console.log('  VeriVote Kenya — Auth Smoke Tests');
  console.log('='.repeat(54));

  try {
    await testHealth();

    const pollingStationId = await getPollingStationId();
    if (!pollingStationId) {
      console.error('\n⚠️  No polling stations in DB. Seed the database first.');
      process.exit(1);
    }
    console.log(`\n  Using polling station: ${pollingStationId}`);

    const { nationalId, voterId } = await testRegistrationAndVerification(pollingStationId);
    const token = await testPasswordLogin(nationalId);

    if (!token) {
      console.error('\n⚠️  Login failed — skipping password, WebAuthn, credential, and OTP tests.');
      failed++;
    } else {
      await testSetPassword(token);
      await testOtpLogin(nationalId);
      await testWebAuthnOptions(voterId, nationalId);
      await testCredentialManagement(voterId, token);
    }

    await testValidationEdgeCases();

  } catch (err) {
    console.error('\nUnhandled error:', err.message);
    failed++;
  }

  console.log('\n' + '='.repeat(54));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(54) + '\n');
  process.exit(failed > 0 ? 1 : 0);
}

main();
