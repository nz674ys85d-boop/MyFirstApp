// Supabaseの接続設定

const SUPABASE_URL = "https://vgnjlseucwmsfatmikms.supabase.coPublishable key";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_p8DkYPSFXTXQnCHqnNdggQ_Blv_HcqR";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
