/**
 * Airtable Automation Script
 *
 * Trigger: When "generate_final_image" checkbox is checked on post_builder record
 * Action: Run this script
 *
 * Paste this entire script into the Airtable automation "Run a script" action.
 *
 * Input variables needed:
 *   - recordId: the record ID from the trigger (config.inputConfig.recordId)
 */

const RENDER_API_URL = 'https://render-engine-production.up.railway.app'; // Update after deploy
const API_KEY = ''; // Set your RENDER_API_KEY here

const recordId = input.config().recordId;

if (!recordId) {
  console.log('No recordId provided');
  return;
}

console.log(`Triggering render for record: ${recordId}`);

try {
  const response = await fetch(`${RENDER_API_URL}/api/render/sync`, {
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
