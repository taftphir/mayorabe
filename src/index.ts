import * as dotenv from 'dotenv';
dotenv.config(); // <-- pastikan ini dijalankan sebelum import apapun yang memakai process.env

import express from 'express';
import authRoutes from './routes/auth';
import aktifitasRoutes from './routes/aktifitas';
import omzetRoutes from './routes/omzet';
import gpsRoutes from './routes/gps';

const app = express();
app.use(express.json());

const port = process.env.PORT ?? 3000;

app.get("/", (req, res) => {
  res.send("OK");
});

// router kamu
app.use('/', authRoutes);
app.use('/', aktifitasRoutes);
app.use('/', omzetRoutes);
app.use('/', gpsRoutes);

// debug: pastikan routes ter-mount saat server start
console.log('Routes mounted: / (authRoutes, aktifitasRoutes, omzetRoutes, gpsRoutes)');

app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
