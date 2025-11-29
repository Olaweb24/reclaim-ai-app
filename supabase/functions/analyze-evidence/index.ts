import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.0';
import { corsHeaders } from '../_shared/cors.ts';
import { encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

console.log('analyze-evidence function is booting up.');

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request.');
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log('Received a new analysis request.');
    if (!req.body) {
      throw new Error('Request body is missing.');
    }

    const requestPayload = await req.json();
    const { evidenceId, filePath } = requestPayload;

    if (!evidenceId || !filePath) {
      throw new Error('`evidenceId` and `filePath` are required.');
    }

    console.log(`Fetching evidence with ID: ${evidenceId}`);

    // Fetch evidence metadata
    const { data: evidenceData, error: fetchError } = await supabase
      .from('evidence')
      .select('*')
      .eq('id', evidenceId)
      .single();

    if (fetchError || !evidenceData) {
      console.error('Failed to fetch evidence metadata:', fetchError);
      throw new Error('Evidence record not found.');
    }

    console.log('Evidence metadata fetched. Downloading file...');

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('evidence-files')
      .download(filePath);
    if (downloadError || !fileData) {
      console.error('Failed to download evidence file:', downloadError);
      throw new Error('Failed to retrieve evidence file from storage.');
    }

    // Determine MIME type from file extension
    const fileName = evidenceData.file_name || filePath;
    let mimeType = fileData.type || 'application/octet-stream';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = fileName.toLowerCase().split('.').pop() || '';
      const mimeMap: Record<string, string> = {
        'txt': 'text/plain',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'json': 'application/json',
      };
      mimeType = mimeMap[ext] || mimeType;
    }

    console.log(`Determined MIME type: ${mimeType} for file: ${fileName}`);

    console.log('Performing AI analysis on evidence...');

    // MOCK ANALYSIS DATA
    const summary = 'This evidence contains signs of harassment and threats. Please review carefully.';
    const labels = ['harassment', 'threats', 'gbv'];
    const severity = 'High';
    const details = {
      threats: ['"I will find you"', '"You cannot hide"'],
      harassment: ['Repeated unwanted messages'],
      sexualAbuse: [],
      hateSpeech: [],
      blackmail: [],
      other: ['Possible stalking behavior'],
    };

    // Update evidence record with mock analysis results
    const { error: updateError } = await supabase
      .from('evidence')
      .update({
        ai_summary: summary,
        ai_labels: labels,
        ai_severity: severity,
        ai_details: details,
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', evidenceId);

    if (updateError) {
      console.error('Failed to update evidence with analysis results:', updateError);
      throw new Error('Failed to save analysis results.');
    }

    const analysisResult = {
      id: evidenceId,
      summary,
      labels,
      severity,
      details,
      analyzedAt: new Date().toISOString(),
    };

    console.log('Mock analysis complete. Sending response.');
    return new Response(JSON.stringify({ result: analysisResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in analyze-evidence function:', errorMessage);
    return new Response(JSON.stringify({ error: `Function error: ${errorMessage}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
