import * as dotenv from 'dotenv';
dotenv.config(); // <-- pastikan ini dijalankan sebelum import apapun yang memakai process.env

import express from 'express';
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';

const app = express();
app.use(express.json());

const port = process.env.PORT ?? 3000;

app.use('/', authRoutes);
app.use('/', dashboardRoutes);

app.listen(port, () => {
  console.log(`API listening on ${port}`);
});