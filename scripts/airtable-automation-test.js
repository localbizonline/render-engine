/**
 * Airtable Automation Script — TEST TABLE
 *
 * Trigger: When "generate_final_image" checkbox is checked on render_engine_test record
 * Action: Run this script
 *
 * Input variables needed:
 *   - recordId: the record ID from the trigger (config.inputConfig.recordId)
 */

const RENDER_API_URL = 'https://render-engine-production.up.railway.app';
const API_KEY = '24c9362a2258ae1a59ac104f7d712e6028ceabd74708352c72b101638ce6f60e';

const recordId = input.config().recordId;

if (!recordId) {
  console.log('No recordId provided');
  return;
}

console.log(`[TEST] Triggering render for record: ${recordId}`);

try {
  const response = await fetch(`${RENDER_API_URL}/api/render/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    },
    body: JSON.stringify({ recordId }),
  });

  const result = await response.json();

  if (result.success) {
    console.log(`Render completed in ${result.renderTimeMs}ms`);
    console.log(`Output: ${result.outputUrl}`);
    console.log(`Template used: ${result.templateUsed}`);
  } else {
    console.error(`Render failed: ${result.error}`);
  }
} catch (error) {
  console.error(`Request failed: ${error.message}`);
}
