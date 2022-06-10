import { dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import path from 'path';
const server = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

server.all('/', (req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, './index.html'));
});

export default () => server.listen(process.env.PORT || 5000, '0.0.0.0');