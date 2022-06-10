const express = require('express');
const server = express();
const path = require('path');

server.all('/', (req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, './index.html'));
});

module.exports = () => server.listen(process.env.PORT || 5000, '0.0.0.0');