const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('./AppError');
const { randomToken } = require('./crypto');

const sign = (userId, typ, secret, expiresIn) =>
  jwt.sign({ sub: userId, typ }, secret, { expiresIn, algorithm: 'HS256', jwtid: randomToken().slice(0, 16) });

const signAccess = (userId) => sign(userId, 'access', config.jwt.secret, config.jwt.accessExpires);
const signRefresh = (userId) => sign(userId, 'refresh', config.jwt.refreshSecret, config.jwt.refreshExpires);
const signTemp = (userId) => sign(userId, '2fa', config.jwt.secret, config.jwt.tempExpires);

// `typ` prevents using e.g. a 2FA temp token as an access token.
const verifyToken = (token, secret, typ) => {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (payload.typ !== typ) throw new AppError('Invalid token', 401);
  return payload;
};

module.exports = { signAccess, signRefresh, signTemp, verifyToken };
