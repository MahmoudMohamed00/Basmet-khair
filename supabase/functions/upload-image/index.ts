import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const formData = await req.formData();
    const file = formData.get('file');
    const fileName = String(formData.get('fileName') || 'upload.bin');
    const storagePath = String(formData.get('storagePath') || 'general/docs');

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'لم يتم إرسال ملف صالح' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const objectPath = `${storagePath}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${sanitizeFileName(fileName)}`;

    const { error } = await supabase.storage.from('images').upload(objectPath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data } = supabase.storage.from('images').getPublicUrl(objectPath);

    return new Response(JSON.stringify({ url: data.publicUrl, path: objectPath }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});