const SUPABASE_URL = "https://vgnjlseucwmsfatmikms.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_p8DkYPSFXTXQnCHqnNdggQ_Blv_HcqR";

const mySupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

console.log("Supabase接続OK");
