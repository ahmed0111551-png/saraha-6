const AppError = require('./AppError');

// Every input is checked to be a *string* first. This also blocks NoSQL operator
// injection such as { "email": { "$gt": "" } }.
const str = (value, name, { min = 1, max = 500, trim = true } = {}) => {
  if (typeof value !== 'string') throw new AppError(`${name} must be a string`, 400);
  const out = trim ? value.trim() : value;
  if (out.length < min || out.length > max) {
    throw new AppError(`${name} must be between ${min} and ${max} characters`, 400);
  }
  return out;
};

const email = (value) => {
  const out = str(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) throw new AppError('email is invalid', 400);
  return out;
};

const username = (value) => {
  const out = str(value, 'username', { min: 3, max: 20 }).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(out)) {
    throw new AppError('username may contain only letters, numbers and underscore', 400);
  }
  return out;
};

const password = (value, name = 'password') => str(value, name, { min: 8, max: 72, trim: false });

const objectId = (value, name = 'id') => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw new AppError(`${name} is invalid`, 400);
  }
  return value;
};

const pagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { str, email, username, password, objectId, pagination, escapeRegex };
