import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

//const SUPABASE_URL = 'https://iwmhcenfajmzdmsindyl.supabase.co';
//const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bWhjZW5mYWptemRtc2luZHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjc2OTU2NiwiZXhwIjoyMDc4MzQ1NTY2fQ._uhlm_kAWhfiCGQThuZfGX4aUVFHnK_8mmHJJthyczs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// GET /api/omzet?spg=All or /api/omzet?spg=<uploader_id>
router.get('/omzet', async (req, res) => {
  console.log('[dashboard] GET /omzet called', { query: req.query, url: req.originalUrl });
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

    // ranking per SPG (group by spg_id)
    const bySpg: Record<
      string,
      { name: string; target_scan: number; target_ec_scan: number; scan: number; ec_scan: number }
    > = {};

    result.forEach((r: any) => {
      const spgId = String(r.spg_id ?? r.spgid ?? r.sales_code ?? 'unknown');
      const name = r.spg_nm ?? r.sales_name ?? r.salesman_name ?? r.name ?? spgId;
      if (!bySpg[spgId]) {
        bySpg[spgId] = { name, target_scan: 0, target_ec_scan: 0, scan: 0, ec_scan: 0 };
      }
      bySpg[spgId].target_scan += Number(r.target_scan ?? 0);
      bySpg[spgId].target_ec_scan += Number(r.target_ec_scan ?? 0);
      bySpg[spgId].scan += Number(r.scan ?? 0);
      bySpg[spgId].ec_scan += Number(r.total_ec_scan_global ?? 0);
    });

    const ranking = Object.entries(bySpg).map(([spgId, v]) => {
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

    // sort by total actual (scan + ec_scan) descending
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

// GET /api/omzet/summary?spg=All or /api/omzet/summary?spg=<uploader_id>
router.get('/omzet/summary', async (req, res) => {
  console.log('[omzet] GET /omzet/summary called', { query: req.query, url: req.originalUrl });
  try {
    const now = new Date();
    const yearNum = now.getFullYear();
    const monthNum = now.getMonth() + 1;
    const spg = String(req.query.spg ?? 'All');
    const user_id = String(req.query.user_id ?? '');

    // call existing RPC (if available) to get joined rows; fallback to empty array
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_dashboard_rows', {
      p_year: yearNum,
      p_period: monthNum,
      p_spg: spg,
      p_user_id: user_id,
    });
    if (rpcErr) console.warn('omzet.summary rpc warning', rpcErr);

    const joined = (rpcData ?? []) as any[];
    const rows = joined.map((j) => (typeof j === 'string' ? JSON.parse(j) : j));

    // fetch target rows for period (to build periodInfo and financial target totals)
    let tq = supabase
      .from('target_data')
      .select('start_date,end_date,hk,target_omzet,sales_group,uploaded_by')
      .match({ tahun: String(yearNum), bulan: String(monthNum) });

    if (user_id) tq = tq.eq('uploaded_by', user_id);

    // if spg provided, resolve sales_group from salesman_data.status_muh where salesman_data.sales_code = spg
    if (spg !== 'All') {
      try {
        const { data: salesArr, error: salesErr } = await supabase
          .from('salesman_data')
          .select('status_muh')
          .eq('sales_code', spg)
          .limit(1);
        if (salesErr) console.warn('omzet.summary salesman lookup error', salesErr);
        const statusMuh = Array.isArray(salesArr) && salesArr.length > 0 ? salesArr[0].status_muh : null;
        if (statusMuh) {
          tq = tq.eq('sales_group', statusMuh);
        } else {
          // fallback: if no status_muh found, attempt to filter by spg directly
          tq = tq.eq('sales_group', spg);
        }
      } catch (err) {
        console.warn('omzet.summary salesman lookup exception', err);
        tq = tq.eq('sales_group', spg);
      }
    }

    const { data: targetRows = [], error: targetErr } = await tq;
    if (targetErr) console.warn('omzet.summary target fetch error', targetErr);

    // periodInfo: if multiple rows pick aggregate: min start_date, max end_date, max hk
    let periodInfo = { start_date: null as string | null, end_date: null as string | null, hari_kerja: 0 };
    const safeTargetRows = Array.isArray(targetRows) ? targetRows : [];
    if (safeTargetRows.length > 0) {
      const starts = safeTargetRows.map((t: any) => parseDMY(t.start_date)).filter(Boolean) as Date[];
      const ends = safeTargetRows.map((t: any) => parseDMY(t.end_date)).filter(Boolean) as Date[];
      const minStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
      const maxEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
      periodInfo.start_date = formatToDisplayDate(minStart);
      periodInfo.end_date = formatToDisplayDate(maxEnd);
       periodInfo.hari_kerja = Math.max(...safeTargetRows.map((t: any) => Number(t.hk ?? 0)));
    }
    // financial totals
    const target_total = safeTargetRows.reduce((acc: number, t: any) => acc + Number(t.target_omzet ?? 0), 0);

    // from joined rows compute omzet and setoran per row
    const totals = rows.reduce(
      (acc: any, r: any) => {
        acc.omzet += Number(r.omzet ?? 0);
        acc.setoran += Number(r.setoran ?? 0); // prefer setoran if present
        return acc;
      },
      { omzet: 0, setoran: 0 }
    );

    const achieved = totals.setoran || totals.omzet; // prefer setoran for "disetorkan"
    const persen_tercapai = target_total > 0 ? (achieved / target_total) * 100 : 0;
    const target_tersisa_total = Math.max(0, target_total - achieved);

    const financialInfo = {
      target_total,
      omzet_total: totals.omzet,
      setoran_total: totals.setoran,
      persen_tercapai: Number(persen_tercapai.toFixed(2)),
      target_tersisa: Number(target_tersisa_total.toFixed(2)),
    };

    // ranking per spg_id (group ONLY by spg_id using joined rows)
    const bySpg: Record<string, { spg_id: string; name: string; target_omzet: number; omzet: number; setoran: number }> = {};

    // aggregate only from joined rows (rows)
    rows.forEach((r: any) => {
      const spgId = String(r.spg_id ?? r.spgid ?? r.sales_code ?? 'unknown');
      const name = r.spg_nm ?? r.sales_name ?? r.salesman_name ?? r.name ?? spgId;
      if (!bySpg[spgId]) bySpg[spgId] = { spg_id: spgId, name, target_omzet: 0, omzet: 0, setoran: 0 };
      bySpg[spgId].omzet += Number(r.omzet ?? 0);
      bySpg[spgId].setoran += Number(r.setoran ?? 0);
      bySpg[spgId].target_omzet += Number(r.target_omzet ?? 0);
    });

    // build ranking array grouped only by spg_id
    const ranking = Object.values(bySpg).map((v) => {
      const achieved = Number(v.setoran ?? 0) || Number(v.omzet ?? 0);
      const target_tersisa = Math.max(0, Number(v.target_omzet ?? 0) - achieved);
      return {
        spg_id: v.spg_id,
        name: v.name,
        target_omzet: Number(v.target_omzet ?? 0),
        omzet: Number(v.omzet ?? 0),
        setoran: Number(v.setoran ?? 0),
        target_tersisa: Number(target_tersisa.toFixed(2)),
      };
    });

    // sort by target_tersisa desc
    ranking.sort((a, b) => b.target_tersisa - a.target_tersisa);

    // add spg_rank into each ranking entry
    ranking.forEach((item, idx) => {
      (item as any).spg_rank = idx + 1;
    });

    // build global ranking from ALL rows (so spg_rank is global & stable)
    const { data: rpcAllData, error: rpcAllErr } = await supabase.rpc('get_dashboard_rows', {
      p_year: yearNum,
      p_period: monthNum,
      p_spg: 'All',
      p_user_id: user_id,
    });
    if (rpcAllErr) console.warn('omzet.summary rpcAll warning', rpcAllErr);
    const allJoined = (rpcAllData ?? []) as any[];
    const allRows = allJoined.map((j) => (typeof j === 'string' ? JSON.parse(j) : j));

    const bySpgAll: Record<string, { spg_id: string; name: string; target_omzet: number; omzet: number; setoran: number }> = {};
    allRows.forEach((r: any) => {
      const spgId = String(r.spg_id ?? r.spgid ?? r.sales_code ?? 'unknown');
      const name = r.spg_nm ?? r.sales_name ?? r.salesman_name ?? r.name ?? spgId;
      if (!bySpgAll[spgId]) bySpgAll[spgId] = { spg_id: spgId, name, target_omzet: 0, omzet: 0, setoran: 0 };
      bySpgAll[spgId].omzet += Number(r.omzet ?? 0);
      bySpgAll[spgId].setoran += Number(r.setoran ?? 0);
      bySpgAll[spgId].target_omzet += Number(r.target_omzet ?? 0);
    });

    const rankingAll = Object.values(bySpgAll).map((v) => {
      const achieved = Number(v.setoran ?? 0) || Number(v.omzet ?? 0);
      const target_tersisa = Math.max(0, Number(v.target_omzet ?? 0) - achieved);
      return {
        spg_id: v.spg_id,
        name: v.name,
        target_omzet: Number(v.target_omzet ?? 0),
        omzet: Number(v.omzet ?? 0),
        setoran: Number(v.setoran ?? 0),
        target_tersisa: Number(target_tersisa.toFixed(2)),
      };
    });

    // sort global ranking by target_tersisa desc
    rankingAll.sort((a, b) => b.target_tersisa - a.target_tersisa);

    // add global spg_rank into each ranking entry
    rankingAll.forEach((item, idx) => {
      (item as any).spg_rank = idx + 1;
    });

    // if spg requested, find its global rank/item
    let spg_rank: number | null = null;
    let spg_item: any | null = null;
    if (spg && spg !== 'All') {
      const key = String(spg);
      const idx = rankingAll.findIndex((it) => String(it.spg_id) === key || String(it.name) === key);
      if (idx !== -1) {
        spg_rank = idx + 1;
        spg_item = rankingAll[idx];
      }
    }

    // response uses global ranking (rankingAll). Financials/period remain based on 'rows' (filtered)
    return res.json({
      periodInfo,
      financialInfo,
      ranking: rankingAll,
      spg_rank,
      spg_item,
      meta: { year: yearNum, month: monthNum, spg, user_id },
      row_count: rows.length,
    });
  } catch (err) {
    console.error('omzet.summary endpoint error', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

// helper: parse raw date (dd-mm-yyyy or other string/Date) -> Date|null
function parseDMY(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw !== 'string') return null;
  // handle dd-mm-yyyy
  const dmy = raw.trim();
  const dmyMatch = dmy.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    const dt = new Date(year, month, day);
    return isNaN(dt.getTime()) ? null : dt;
  }
  // fallback to Date constructor for ISO or other formats
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt;
}

function formatToDisplayDate(d: Date | null): string | null {
  if (!d) return null;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = months[d.getMonth()] ?? '';
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd} ${mon} ${yy}`;
}

export default router;
