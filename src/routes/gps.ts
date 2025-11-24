import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
// const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const SUPABASE_URL = 'https://iwmhcenfajmzdmsindyl.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bWhjZW5mYWptemRtc2luZHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc2OTU2NiwiZXhwIjoyMDc4MzQ1NTY2fQ._uhlm_kAWhfiCGQThuZfGX4aUVFHnK_8mmHJJthyczs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// POST /api/gps
// body: { user_id: string, lat: number|string, long: number|string, time?: string }
router.post('/gps', async (req, res) => {
  try {
    const { user_id, lat, long, time } = req.body ?? {};
    console.log('Received GPS data:', { user_id, lat, long, time });
    // kembalikan semua data yang diterima sebagai respons
    return res.status(200).json({ received: { user_id, lat, long, time } });


  //   if (!user_id || lat === undefined || long === undefined) {
  //     return res.status(400).json({ error: 'user_id, lat and long are required' });
  //   }

  //   const latitude = Number(lat);
  //   const longitude = Number(long);
  //   if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
  //     return res.status(400).json({ error: 'lat and long must be numeric' });
  //   }

  //   // normalize time -> ISO string, fallback to now
  //   const recordedAt = time ? new Date(time) : new Date();
  //   if (isNaN(recordedAt.getTime())) {
  //     return res.status(400).json({ error: 'invalid time format' });
  //   }
  //   const recorded_at = recordedAt.toISOString();

  //   // insert into gps_locations table (ensure this table exists in DB)
  //   const { data, error } = await supabase
  //     .from('gps_locations')
  //     .insert([
  //       {
  //         user_id: String(user_id),
  //         latitude,
  //         longitude,
  //         recorded_at,
  //       },
  //     ])
  //     .select()
  //     .single();

  //   if (error) {
  //     console.error('gps insert error', error);
  //     return res.status(500).json({ error: 'failed_to_insert_gps' });
  //   }

    // return res.status(201).json({ success: true, row: data });
  } catch (err) {
    console.error('gps route error', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

export default router;