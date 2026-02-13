/**
 * Local test script — renders each built-in template with sample data.
 * Run with: npx tsx src/test-render.ts
 */
import { writeFileSync } from 'fs';
import path from 'path';
import { initFonts } from './engine/font-manager.js';
import { initRegistry } from './templates/registry.js';
import { listTemplates } from './templates/registry.js';
import { renderPng } from './engine/png-renderer.js';
import { loadRemoteImage } from './engine/asset-loader.js';
import type { RenderVariables } from './types.js';

const SAMPLE_VARIABLES: RenderVariables = {
  title: 'Professional Plumbing Service',
  subtitle: 'Quality workmanship — 15 years experience',
  body: 'We specialize in residential and commercial plumbing services.',
  phone: '(021) 555-1234',
  service_areas: 'Cape Town • Northern Suburbs • Southern Suburbs',
  primary_colour: '#235BAA',
  secondary_colour: '#4582D0',
  logo_url: '',
  user_images: [],
  company_name: 'SA Plumbing Solutions',
  website: 'https://saplumbing.co.za',
};

// Use a placeholder image (1080x1080 solid color) since we don't have real images locally
function createPlaceholderImage(): Buffer {
  // We'll skip image layers in the test — they'll just be blank
  return Buffer.alloc(0);
}

async function main() {
  console.log('Initializing fonts...');
  initFonts();

  console.log('Loading templates...');
  await initRegistry();

  const templates = listTemplates();
  console.log(`Found ${templates.length} templates\n`);

  for (const template of templates) {
    console.log(`Rendering: ${template.name} (${template.id})`);

    try {
      const buffer = renderPng({
        template,
        variables: SAMPLE_VARIABLES,
        userImages: [], // no images for local test
        logoImage: null,
      });

      const outPath = path.resolve(`test-output-${template.id}.png`);
      writeFileSync(outPath, buffer);
      console.log(`  → Saved ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)\n`);
    } catch (err) {
      console.error(`  → FAILED: ${err}\n`);
    }
  }

  console.log('Done. Check test-output-*.png files.');
}

main().catch(console.error);
