import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// const SUPABASE_URL = 'https://iwmhcenfajmzdmsindyl.supabase.co';
// const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bWhjZW5mYWptemRtc2luZHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc2OTU2NiwiZXhwIjoyMDc4MzQ1NTY2fQ._uhlm_kAWhfiCGQThuZfGX4aUVFHnK_8mmHJJthyczs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// GET /api/aktifitas?spg=All or /api/aktifitas?spg=<uploader_id>
// data always filtered to current year and current month
router.get('/aktifitas', async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const yearNum = Number(year);
    const monthNum = Number(month);
    const spg = String(req.query.spg ?? 'All');
    const user_id = String(req.query.user_id ?? '');

    // call DB function that runs the direct join
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_dashboard_rows', {
      p_year: year,
      p_period: month,
      p_spg: spg,
      p_user_id: user_id,
    });

    if (rpcErr) {
      console.error('aktifitas: rpc get_dashboard_rows error', rpcErr);
      return res.status(500).json({ error: 'failed_fetch_dashboard_rows' });
    }

    // rpcData is array of jsonb rows
    const joined = (rpcData ?? []) as any[];
    const result = joined.map((j) => (typeof j === 'string' ? JSON.parse(j) : j));

    // rows now contains epr_data rows with nested salesman_data and target_data (if relationships exist)
    // const target_data = epr.map((r: any) => r.target_data).filter(Boolean);

    // get targets and actuals from epr_data
    const targets = result?.map((r) => ({
      target_omzet: Number(r.target_omzet ?? 0),
      target_scan: Number(r.target_scan ?? 0),
      target_ec_scan: Number(r.target_ec_scan ?? 0),
      omzet_daily: Number(r.omzet_daily ?? 0),
      scan_daily: Number(r.scan_daily ?? 0),
      ec_scan_daily: Number(r.ec_scan_daily ?? 0),
    })) ?? [];
    const actuals = result?.map((r) => ({
      omzet: Number(r.omzet ?? 0),
      scan: Number(r.scan ?? 0),
      ec_scan: Number(r.total_ec_scan_global ?? 0),
    })) ?? [];

    // get totals (omzet, scan, ec_scan) from epr_data
    const totals = {
      omzet: actuals.reduce((acc, cur) => acc + cur.omzet, 0),
      scan: actuals.reduce((acc, cur) => acc + cur.scan, 0),
      ec_scan: actuals.reduce((acc, cur) => acc + cur.ec_scan, 0),
      target_omzet: targets.reduce((acc, cur) => acc + cur.target_omzet, 0),
      target_scan: targets.reduce((acc, cur) => acc + cur.target_scan, 0),
      target_ec_scan: targets.reduce((acc, cur) => acc + cur.target_ec_scan, 0),
    };
    
    const pct = (actual: number, target: number) => (target > 0 ? (actual / target) * 100 : 0);

    const pct_scan = pct(totals.scan, totals.target_scan);
    const pct_ec_scan = pct(totals.ec_scan, totals.target_ec_scan);
    const overall_pct = (pct_scan + pct_ec_scan) / ((totals.target_scan || totals.target_ec_scan) ? 2 : 1);

    const gap = Math.max(0, totals.target_scan + totals.target_ec_scan - (totals.scan + totals.ec_scan));

    // build global ranking (ignore spg filter) — still respect user_id uploader filter
    const { data: rpcAllData, error: rpcAllErr } = await supabase.rpc('get_dashboard_rows', {
      p_year: year,
      p_period: month,
      p_spg: 'All',
      p_user_id: user_id,
    });
    if (rpcAllErr) console.warn('aktifitas: rpcAll get_dashboard_rows error', rpcAllErr);
    const allJoined = (rpcAllData ?? []) as any[];
    const allRows = allJoined.map((j) => (typeof j === 'string' ? JSON.parse(j) : j));

    const bySpgAll: Record<
      string,
      { name: string; target_scan: number; target_ec_scan: number; scan: number; ec_scan: number }
    > = {};

    allRows.forEach((r: any) => {
      const spgId = String(r.spg_id ?? r.spgid ?? r.sales_code ?? 'unknown');
      const name = r.spg_nm ?? r.sales_name ?? r.salesman_name ?? r.name ?? spgId;
      if (!bySpgAll[spgId]) {
        bySpgAll[spgId] = { name, target_scan: 0, target_ec_scan: 0, scan: 0, ec_scan: 0 };
      }
      bySpgAll[spgId].target_scan += Number(r.target_scan ?? 0);
      bySpgAll[spgId].target_ec_scan += Number(r.target_ec_scan ?? 0);
      bySpgAll[spgId].scan += Number(r.scan ?? 0);
      bySpgAll[spgId].ec_scan += Number(r.total_ec_scan_global ?? r.ec_scan_daily ?? 0);
    });

    const ranking = Object.entries(bySpgAll).map(([spgId, v]) => {
      const totalTarget = v.target_scan + v.target_ec_scan;
      const totalActual = v.scan + v.ec_scan;
      const percent = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
      return {
        spg_id: spgId,
        name: v.name,
        target_scan: v.target_scan,
        target_ec_scan: v.target_ec_scan,
        scan: v.scan,
        ec_scan: v.ec_scan,
        total_target: totalTarget,
        total_actual: totalActual,
        percent: Number(percent.toFixed(2)),
      };
    });

    // sort by total actual (scan + ec_scan) descending — global ranking
    ranking.sort((a, b) => (b.total_actual ?? 0) - (a.total_actual ?? 0));

    return res.json({
      period: { year: yearNum, month: monthNum, spg: spg ?? 'All' },
      totals: {
        target_scan: totals.target_scan,
        target_ec_scan: totals.target_ec_scan,
        scan: totals.scan,
        ec_scan: totals.ec_scan,
      },
      percentages: {
        scan_pct: Number(pct_scan.toFixed(2)),
        ec_scan_pct: Number(pct_ec_scan.toFixed(2)),
        overall_pct: Number(overall_pct.toFixed(2)),
      },
      gap,
      ranking,
      row_count: result.length,
    });
  } catch (err) {
    console.error('dashboard endpoint error', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

export default router;
