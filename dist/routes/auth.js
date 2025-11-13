"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_js_1 = require("@supabase/supabase-js");
const router = express_1.default.Router();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars in auth route');
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '');
// POST /api/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password)
        return res.status(400).json({ error: 'email and password are required' });
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: String(email),
            password: String(password),
        });
        if (error)
            return res.status(401).json({ error: error.message });
        return res.json({ session: data.session ?? null, user: data.user ?? null });
    }
    catch (err) {
        console.error('login error', err);
        return res.status(500).json({ error: 'internal_server_error' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map