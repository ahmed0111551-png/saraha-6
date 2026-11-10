const mongoose = require('mongoose');
const config = require('./config');
const app = require('./app');

mongoose
  .connect(config.mongoUri)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(config.port, () => console.log(`Server running on http://localhost:${config.port}`));
  })
  .catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
