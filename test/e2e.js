// End-to-end test: node test/e2e.js  (needs a running MongoDB at MONGO_URI)
process.env.AUTH_RATE_LIMIT = '1000';
process.env.MESSAGE_RATE_LIMIT = '1000';
const assert = require('assert');
const mongoose = require('mongoose');

// Capture emails (OTP codes / reset links) instead of sending them.
const mailer = require('../src/utils/mailer');
const mails = [];
mailer.sendMail = async (m) => { mails.push(m); };

const app = require('../src/app');
const User = require('../src/models/User');

let base;
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + '/api/v1' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, raw: JSON.stringify(json) };
};
let passed = 0;
const check = (name, cond) => { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ok -', name); };
const lastMailCode = () => mails[mails.length - 1].text.match(/\b(\d{6})\b/)[1];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const reg = async (name) => (await api('POST', '/auth/register', { body: { name, username: name.toLowerCase(), email: `${name.toLowerCase()}@test.com`, password: 'Password123' } })).body;
  console.log('Auth');
  const alice = await reg('Alice'); const bob = await reg('Bob'); const carol = await reg('Carol');
  check('register returns tokens', alice.accessToken && alice.refreshToken && alice.user.id);
  check('duplicate email -> 409', (await api('POST', '/auth/register', { body: { name: 'Alice', username: 'alice2', email: 'alice@test.com', password: 'Password123' } })).status === 409);
  check('wrong password -> 401', (await api('POST', '/auth/login', { body: { email: 'bob@test.com', password: 'nope-nope-1' } })).status === 401);
  check('NoSQL injection in email -> 400', (await api('POST', '/auth/login', { body: { email: { $gt: '' }, password: 'x' } })).status === 400);
  check('no token -> 401', (await api('GET', '/users/me')).status === 401);
  const admin = await User.create({ name: 'Admin', username: 'admin', email: 'admin@test.com', password: 'Password123', role: 'admin' });
  const adminTok = (await api('POST', '/auth/login', { body: { email: 'admin@test.com', password: 'Password123' } })).body.accessToken;

  console.log('Anonymous messages');
  const found = await api('GET', '/users/by-username/bob', { token: alice.accessToken });
  check('find user by username', found.body.id === bob.user.id && !found.raw.includes('email'));
  check('cannot message yourself', (await api('POST', '/messages', { token: alice.accessToken, body: { receiverId: alice.user.id, content: 'hi' } })).status === 400);
  const m1 = (await api('POST', '/messages', { token: alice.accessToken, body: { receiverId: bob.user.id, content: 'secret admirer here' } })).body;
  check('send message', m1.id);
  const inbox = await api('GET', '/messages/inbox', { token: bob.accessToken });
  check('inbox has the message', inbox.body.total === 1 && inbox.body.data[0].content === 'secret admirer here');
  check('inbox never leaks sender id', !inbox.raw.includes(alice.user.id) && !inbox.raw.includes('sender'));
  const one = await api('GET', `/messages/${m1.id}`, { token: bob.accessToken });
  check('get message: sender hidden', one.body.sender === null && !one.raw.includes(alice.user.id));
  check('other user cannot read message -> 404', (await api('GET', `/messages/${m1.id}`, { token: carol.accessToken })).status === 404);
  check('invalid id -> 400', (await api('GET', '/messages/123', { token: bob.accessToken })).status === 400);

  console.log('Identity requests');
  check('sender cannot request identity -> 404', (await api('POST', `/messages/${m1.id}/identity-requests`, { token: alice.accessToken })).status === 404);
  const r1 = await api('POST', `/messages/${m1.id}/identity-requests`, { token: bob.accessToken });
  check('create request (pending)', r1.status === 201 && r1.body.status === 'pending');
  check('duplicate request -> 409', (await api('POST', `/messages/${m1.id}/identity-requests`, { token: bob.accessToken })).status === 409);
  const recv = await api('GET', '/identity-requests/received?status=pending', { token: alice.accessToken });
  check('sender sees pending request', recv.body.total === 1 && recv.body.data[0].requester.username === 'bob' && recv.body.data[0].message.content === 'secret admirer here');
  check('bad status filter -> 400', (await api('GET', '/identity-requests/received?status=x', { token: alice.accessToken })).status === 400);
  check('receiver sees no requests as sender', (await api('GET', '/identity-requests/received', { token: bob.accessToken })).body.total === 0);
  check('requester cannot accept -> 404', (await api('PATCH', `/identity-requests/${r1.body.id}/accept`, { token: bob.accessToken })).status === 404);
  check('stranger cannot accept -> 404', (await api('PATCH', `/identity-requests/${r1.body.id}/accept`, { token: carol.accessToken })).status === 404);

  const m2 = (await api('POST', '/messages', { token: alice.accessToken, body: { receiverId: bob.user.id, content: 'second one' } })).body;
  const r2 = (await api('POST', `/messages/${m2.id}/identity-requests`, { token: bob.accessToken })).body;
  const rej = await api('PATCH', `/identity-requests/${r2.id}/reject`, { token: alice.accessToken });
  check('reject request', rej.status === 200 && rej.body.request.status === 'rejected');
  const afterRej = await api('GET', `/messages/${m2.id}`, { token: bob.accessToken });
  check('after reject identity stays hidden', afterRej.body.sender === null && afterRej.body.identityRequestStatus === 'rejected' && !afterRej.raw.includes(alice.user.id));
  check('cannot change decision -> 409', (await api('PATCH', `/identity-requests/${r2.id}/accept`, { token: alice.accessToken })).status === 409);
  const sentBefore = await api('GET', '/identity-requests/sent', { token: bob.accessToken });
  check('requester list hides sender before accept', !sentBefore.raw.includes(alice.user.id));

  const acc = await api('PATCH', `/identity-requests/${r1.body.id}/accept`, { token: alice.accessToken });
  check('accept request + conversation created', acc.status === 200 && acc.body.conversation.id && acc.body.conversation.originalMessageId === m1.id);
  const afterAcc = await api('GET', `/messages/${m1.id}`, { token: bob.accessToken });
  check('after accept sender revealed', afterAcc.body.sender.id === alice.user.id && afterAcc.body.sender.username === 'alice' && afterAcc.body.identityRequestStatus === 'accepted');
  const sentAfter = await api('GET', '/identity-requests/sent?status=accepted', { token: bob.accessToken });
  check('requester list reveals sender after accept', sentAfter.body.data[0].sender.username === 'alice');

  console.log('Conversations');
  const cid = acc.body.conversation.id;
  check('bob sends in conversation', (await api('POST', `/conversations/${cid}/messages`, { token: bob.accessToken, body: { content: 'Is it really you?' } })).status === 201);
  check('alice sends in conversation', (await api('POST', `/conversations/${cid}/messages`, { token: alice.accessToken, body: { content: 'Yes :)' } })).status === 201);
  check('outsider cannot send -> 403', (await api('POST', `/conversations/${cid}/messages`, { token: carol.accessToken, body: { content: 'hack' } })).status === 403);
  check('outsider cannot read -> 403', (await api('GET', `/conversations/${cid}/messages`, { token: carol.accessToken })).status === 403);
  const msgs = await api('GET', `/conversations/${cid}/messages?page=1&limit=10`, { token: alice.accessToken });
  check('participant reads messages (newest first)', msgs.body.total === 2 && msgs.body.data[0].content === 'Yes :)');
  const convs = await api('GET', '/conversations', { token: bob.accessToken });
  check('conversation list shows other party', convs.body.data[0].with.username === 'alice');
  check('empty content -> 400', (await api('POST', `/conversations/${cid}/messages`, { token: bob.accessToken, body: { content: '   ' } })).status === 400);

  console.log('2-step verification');
  check('enable 2FA sends code', (await api('POST', '/auth/2fa/enable', { token: alice.accessToken })).status === 200);
  check('wrong confirm code -> 400', (await api('POST', '/auth/2fa/confirm', { token: alice.accessToken, body: { code: '000000' === lastMailCode() ? '111111' : '000000' } })).status === 400);
  check('confirm 2FA', (await api('POST', '/auth/2fa/confirm', { token: alice.accessToken, body: { code: lastMailCode() } })).status === 200);
  const l = await api('POST', '/auth/login', { body: { email: 'alice@test.com', password: 'Password123' } });
  check('login requires 2FA, no access token', l.body.requires2FA === true && l.body.tempToken && !l.body.accessToken);
  check('tempToken is not an access token -> 401', (await api('GET', '/users/me', { token: l.body.tempToken })).status === 401);
  const bad = lastMailCode() === '123456' ? '654321' : '123456';
  check('wrong login code -> 400', (await api('POST', '/auth/2fa/verify', { body: { tempToken: l.body.tempToken, code: bad } })).status === 400);
  const ver = await api('POST', '/auth/2fa/verify', { body: { tempToken: l.body.tempToken, code: lastMailCode() } });
  check('correct code -> tokens', ver.status === 200 && ver.body.accessToken);
  check('code cannot be reused -> 400', (await api('POST', '/auth/2fa/verify', { body: { tempToken: l.body.tempToken, code: lastMailCode() } })).status === 400);
  // brute force: 5 wrong attempts lock the code
  await api('POST', '/auth/login', { body: { email: 'alice@test.com', password: 'Password123' } });
  const t2 = (await api('POST', '/auth/login', { body: { email: 'alice@test.com', password: 'Password123' } })).body.tempToken;
  const real = lastMailCode(); const wrong = real === '999999' ? '999998' : '999999';
  for (let i = 0; i < 5; i++) await api('POST', '/auth/2fa/verify', { body: { tempToken: t2, code: wrong } });
  check('too many wrong attempts lock the code', (await api('POST', '/auth/2fa/verify', { body: { tempToken: t2, code: real } })).status === 400);
  check('disable 2FA needs password', (await api('POST', '/auth/2fa/disable', { token: ver.body.accessToken, body: { password: 'bad-password' } })).status === 401);
  check('disable 2FA', (await api('POST', '/auth/2fa/disable', { token: ver.body.accessToken, body: { password: 'Password123' } })).status === 200);

  console.log('Forgot / reset password');
  const generic = (await api('POST', '/auth/forgot-password', { body: { email: 'nobody@test.com' } }));
  const n = mails.length;
  check('unknown email -> same 200, no mail', generic.status === 200 && mails.length === n);
  check('known email -> 200', (await api('POST', '/auth/forgot-password', { body: { email: 'bob@test.com' } })).status === 200);
  await new Promise((r) => setTimeout(r, 200));
  const token = mails[mails.length - 1].text.match(/token=([a-f0-9]+)/)[1];
  check('short password rejected', (await api('POST', '/auth/reset-password', { body: { token, newPassword: 'short' } })).status === 400);
  check('reset password', (await api('POST', '/auth/reset-password', { body: { token, newPassword: 'NewPassword456' } })).status === 200);
  check('token is single-use', (await api('POST', '/auth/reset-password', { body: { token, newPassword: 'AnotherPass789' } })).status === 400);
  check('old password no longer works', (await api('POST', '/auth/login', { body: { email: 'bob@test.com', password: 'Password123' } })).status === 401);
  const bobNew = await api('POST', '/auth/login', { body: { email: 'bob@test.com', password: 'NewPassword456' } });
  check('new password works', bobNew.status === 200);

  console.log('Refresh / logout');
  const rf = await api('POST', '/auth/refresh', { body: { refreshToken: bobNew.body.refreshToken } });
  check('refresh gives new tokens', rf.status === 200 && rf.body.refreshToken !== bobNew.body.refreshToken);
  check('old refresh token rejected', (await api('POST', '/auth/refresh', { body: { refreshToken: bobNew.body.refreshToken } })).status === 401);
  check('reuse revoked the session', (await api('POST', '/auth/refresh', { body: { refreshToken: rf.body.refreshToken } })).status === 401);
  const lo = await api('POST', '/auth/login', { body: { email: 'bob@test.com', password: 'NewPassword456' } });
  check('logout', (await api('POST', '/auth/logout', { token: lo.body.accessToken })).status === 200);
  check('refresh after logout -> 401', (await api('POST', '/auth/refresh', { body: { refreshToken: lo.body.refreshToken } })).status === 401);

  console.log('Ban');
  check('normal user cannot ban -> 403', (await api('POST', `/admin/users/${carol.user.id}/ban`, { token: bob.accessToken })).status === 403);
  check('admin cannot ban admin/self', (await api('POST', `/admin/users/${admin.id}/ban`, { token: adminTok })).status === 400);
  const ban = await api('POST', `/admin/users/${carol.user.id}/ban`, { token: adminTok, body: { reason: 'spam' } });
  check('admin bans user', ban.status === 200 && ban.body.user.isBanned === true);
  check('banned user token rejected -> 403', (await api('GET', '/users/me', { token: carol.accessToken })).status === 403);
  check('banned user login -> 403', (await api('POST', '/auth/login', { body: { email: 'carol@test.com', password: 'Password123' } })).status === 403);
  check('cannot message banned user -> 404', (await api('POST', '/messages', { token: alice.accessToken, body: { receiverId: carol.user.id, content: 'hey' } })).status === 404);
  check('banned user hidden from username lookup', (await api('GET', '/users/by-username/carol', { token: alice.accessToken })).status === 404);
  check('admin lists banned users', (await api('GET', '/admin/users?banned=true', { token: adminTok })).body.total === 1);
  check('double ban -> 409', (await api('POST', `/admin/users/${carol.user.id}/ban`, { token: adminTok })).status === 409);
  check('admin unbans', (await api('POST', `/admin/users/${carol.user.id}/unban`, { token: adminTok })).status === 200);
  check('unbanned user can log in', (await api('POST', '/auth/login', { body: { email: 'carol@test.com', password: 'Password123' } })).status === 200);

  console.log(`\nAll ${passed} checks passed`);
  server.close(); await mongoose.disconnect();
})().catch(async (e) => { console.error('\n' + e.message); process.exit(1); });
