const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

if (config.env === 'production') app.set('trust proxy', 1); // needed for rate limiting behind a proxy
app.use(helmet());
app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: '10kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/users', require('./routes/user.routes'));
app.use('/api/v1/admin', require('./routes/admin.routes'));
app.use('/api/v1/messages', require('./routes/message.routes'));
app.use('/api/v1/identity-requests', require('./routes/identityRequest.routes'));
app.use('/api/v1/conversations', require('./routes/conversation.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
