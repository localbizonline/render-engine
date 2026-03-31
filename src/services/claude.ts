import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import { config } from '../config.js';
import { templateSchema } from '../templates/schema.js';
import type {
  TemplateDefinition,
  VisionCompareResponse,
  IterationHistoryEntry,
  CompareAndIterateResponse,
} from '../types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `You are a social media template designer. You create JSON template definitions for a rendering engine that composites PNG social media posts (1080x1080 by default).

## Template Structure
Templates are JSON objects with layers drawn on a canvas. The engine supports these layer types:

### Layer Types
- **rect**: Filled rectangle (background panels, buttons). Props: fill (color/{{variable}}), borderRadius, stroke
- **image**: User-provided photo. Props: source ("user_image"), index (0-based), fit ("cover"/"contain"), borderRadius, shadow
- **text**: Text with variable substitution. Props: content (use {{variable}} placeholders), fontFamily ("Inter"), fontSize, fontWeight ("regular"/"medium"/"semibold"/"bold"), color, align, verticalAlign, maxLines, lineHeight, textTransform, letterSpacing, padding
- **logo**: Company logo image. Props: fit ("contain"), padding, background
- **accent_bar**: Colored bar, usually at bottom. Props: color (use "{{primary_colour}}")

### Available Variables
Use these in text content and colors:
- {{title}} - Main headline
- {{subtitle}} - Secondary text
- {{body}} - Body copy
- {{phone}} - Phone number
- {{service_areas}} - Comma-separated locations
- {{company_name}} - Business name
- {{website}} - Website URL
- {{primary_colour}} - Brand primary color (hex)
- {{secondary_colour}} - Brand secondary color (hex)

### Backgrounds
- solid: { type: "solid", color: "#000000" }
- gradient: { type: "gradient", colors: ["#000", "#333"], angle: 180 }
- image: { type: "image", source: "user_image", index: 0 }

### Design Rules
1. Canvas is 1080x1080 (unless specified otherwise)
2. All coordinates are in pixels, origin is top-left
3. Layers are drawn in order (painter's algorithm) — later layers are on top
4. Font family is always "Inter"
5. Use {{primary_colour}} and {{secondary_colour}} for brand-colored elements
6. Always include a {{title}} text layer
7. Always include a {{phone}} or "CALL NOW" call-to-action
8. Include a logo layer and service_areas when space allows
9. Use an accent_bar at the bottom for brand color
10. Make designs professional and clean — suitable for home service businesses (plumbing, roofing, aircon, etc.)

## Output Format
Return ONLY valid JSON (no markdown, no explanation). The JSON must be a complete template definition matching this structure:
{
  "id": "unique-id",
  "name": "Template Name",
  "reference": "unique-id",
  "outputFormat": "png",
  "width": 1080,
  "height": 1080,
  "imageCount": <number of user images used>,
  "categoryKeys": ["relevant", "tags"],
  "frames": [{ "background": {...}, "layers": [...] }]
}`;

export async function generateTemplate(
  prompt: string,
  width = 1080,
  height = 1080,
): Promise<TemplateDefinition> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Design a social media post template (${width}x${height}) based on this description:\n\n${prompt}\n\nReturn ONLY the JSON template definition.`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Extract JSON from response (handle cases where model wraps in markdown)
  const parsed = parseJsonSafe(text);
  const validated = templateSchema.parse(parsed);

  return validated as TemplateDefinition;
}

export async function iterateTemplate(
  prompt: string,
  existingTemplate: TemplateDefinition,
): Promise<TemplateDefinition> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is an existing template:\n\n${JSON.stringify(existingTemplate, null, 2)}\n\nModify it based on this feedback:\n\n${prompt}\n\nReturn the COMPLETE updated JSON template definition (not just the changes).`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const parsed = parseJsonSafe(text);
  const validated = templateSchema.parse(parsed);

  return validated as TemplateDefinition;
}

function extractJson(text: string): string {
  // Try to find JSON in code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}

/**
 * Attempt to repair truncated/malformed JSON from Claude CLI output.
 * Common issues: missing closing brackets/braces, trailing commas, truncated strings.
 */
function repairJson(jsonStr: string): string {
  let s = jsonStr.trim();

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([\]}])/g, '$1');

  // Count unmatched brackets and braces
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // Close unclosed string if we ended inside one
  if (inString) {
    s += '"';
  }

  // Remove any dangling comma at the very end (after string repair)
  s = s.replace(/,\s*$/, '');

  // Append missing closing brackets/braces
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }

  return s;
}

/**
 * Parse JSON with automatic repair on failure.
 */
function parseJsonSafe(text: string): unknown {
  const jsonStr = extractJson(text);

  // Try parsing as-is first
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try repair
    console.warn('[claude-cli] JSON parse failed, attempting repair...');
    const repaired = repairJson(jsonStr);
    return JSON.parse(repaired); // Let this throw if repair also fails
  }
}

// ── Vision-based template design (Claude CLI via Max subscription) ──

const VISION_SYSTEM_PROMPT = `You are an expert social media template designer for a custom rendering engine.
You analyze reference images of social media post designs and produce precise JSON template definitions that the engine can render into matching outputs.

## Rendering Engine Capabilities

The engine renders on a 1080x1080 pixel canvas using node-canvas (Cairo). Layers are composited in order (painter's algorithm — later layers draw on top).

### Layer Types

1. **rect** — Filled rectangle
   Required: type, x, y, width, height, fill
   Optional: borderRadius, stroke ({ color, width }), opacity

2. **image** — User-provided photo placeholder
   Required: type, x, y, width, height, source ("user_image"), index (0-based), fit ("cover"|"contain"|"fill")
   Optional: borderRadius, shadow ({ blur, offsetX, offsetY, color }), opacity

3. **text** — Dynamic text with variable substitution
   Required: type, x, y, width, height, content, fontFamily ("Inter"), fontSize, fontWeight ("regular"|"medium"|"semibold"|"bold"), color, align ("left"|"center"|"right")
   Optional: verticalAlign ("top"|"middle"|"bottom"), maxLines, lineHeight (default 1.3), textTransform ("uppercase"|"lowercase"|"none"), letterSpacing, padding, opacity

4. **cta_image** — Pre-designed call-to-action composite image (contains logo + phone + company name baked in)
   Required: type, x, y, width, height, variant ("landscape"|"square"), fit ("contain"|"cover")
   Optional: padding, background, borderRadius, opacity
   - landscape variant: ~1584x672 aspect ratio (use width:height ratio ~2.35:1)
   - square variant: 1024x1024 aspect ratio

5. **logo** — Company logo image (legacy, prefer cta_image)
   Required: type, x, y, width, height, fit ("contain"|"cover")
   Optional: padding, background, opacity

6. **accent_bar** — Simple colored bar
   Required: type, x, y, width, height, color
   Optional: opacity

### Background Types
- solid: { "type": "solid", "color": "#hexcolor" }
- gradient: { "type": "gradient", "colors": ["#color1", "#color2"], "angle": 180 }
- image: { "type": "image", "source": "user_image", "index": 0 }

### Variable Placeholders
Use these in text content and color fill values:
- {{title}} — Main headline
- {{subtitle}} — Secondary text
- {{body}} — Body copy
- {{phone}} — Phone number
- {{service_areas}} — Location list
- {{company_name}} — Business name
- {{website}} — Website URL
- {{primary_colour}} — Brand primary hex color
- {{secondary_colour}} — Brand secondary hex color

### Font
The ONLY available font is "Inter" in weights: regular, medium, semibold, bold.
Always set fontFamily to "Inter".

### Design Rules
1. Canvas is always 1080x1080 unless specified otherwise
2. All coordinates are absolute pixels from top-left origin
3. Use {{primary_colour}} and {{secondary_colour}} for brand-colored elements
4. Always include at least a {{title}} text layer
5. Include a call-to-action: either a cta_image layer (preferred) or phone text layer
6. Keep text readable: minimum 14px for small text, 40-60px for headlines
7. Use borderRadius 12-20px on images for a modern look
8. Leave 20px minimum padding from canvas edges
9. For image placeholders, use user_image with sequential indices starting at 0

## Analysis Instructions
When analyzing a reference image:
1. Identify the overall layout structure (split, stacked, full-bleed, etc.)
2. Count distinct photo/image areas — these become user_image layers
3. Note the background treatment (solid color, gradient, full-bleed image with overlay)
4. Map text areas to {{variable}} placeholders based on apparent purpose
5. Identify branding/CTA elements — map to cta_image layers
6. Note decorative elements (bars, dividers, badges) — map to rect layers
7. Estimate coordinates and dimensions precisely in pixels (canvas is 1080x1080)
8. Pay close attention to spacing, padding, and alignment
9. Map color scheme to {{primary_colour}}/{{secondary_colour}} where appropriate

## Output Format
Return ONLY valid JSON. No markdown code fences. No explanation text. Just the raw JSON object:
{
  "id": "descriptive-kebab-case-id",
  "name": "Human Readable Name",
  "reference": "descriptive_snake_case",
  "outputFormat": "png",
  "width": 1080,
  "height": 1080,
  "imageCount": <number of user_image layers>,
  "categoryKeys": ["recent_job", "promote_service"],
  "frames": [{ "background": {...}, "layers": [...] }]
}`;

const COMPARE_PROMPT = `Compare these two social media post images. The first is the REFERENCE design (the target to replicate). The second is the CURRENT rendering from our template engine.

Analyze the differences and provide:
1. A similarity score from 1-10 (10 = pixel-perfect match)
2. Specific, actionable feedback about what needs to change in the template JSON (reference layer types, coordinates, sizes)
3. Whether iteration should continue

Focus on: layout structure, text placement/sizing, image placement/proportions, color scheme, spacing/padding, visual balance.

Return ONLY valid JSON (no markdown, no explanation):
{"score": <1-10>, "feedback": "<specific changes needed>", "shouldContinue": <true if score < 8>}`;

interface ContentBlock {
  type: 'image' | 'text';
  source?: { type: 'base64'; media_type: string; data: string };
  text?: string;
}

/**
 * Call the Claude CLI via child process using --input-format stream-json.
 * Pipes the message JSON via stdin to avoid shell argument length limits.
 * Uses the Max subscription (zero API cost).
 */
async function callClaudeCli(
  systemPrompt: string,
  contentBlocks: ContentBlock[],
): Promise<string> {
  const message = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: contentBlocks,
    },
  });

  // Write the system prompt to a temp file to avoid shell escaping issues
  const { writeFileSync, unlinkSync } = await import('fs');
  const tmpPromptPath = `/tmp/claude-designer-prompt-${Date.now()}.txt`;
  writeFileSync(tmpPromptPath, systemPrompt);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      '/bin/zsh',
      [
        '-c',
        `claude -p --input-format stream-json --output-format stream-json --verbose --model opus --no-session-persistence --tools "" --system-prompt "$(cat '${tmpPromptPath}')"`,
      ],
      {
        env: { ...process.env, CLAUDECODE: '' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude CLI timed out after 180s'));
    }, 180_000);

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      // Clean up temp file
      try { unlinkSync(tmpPromptPath); } catch { /* ignore */ }

      if (code !== 0) {
        console.error('[claude-cli] stderr:', stderr);
        return reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
      }

      // Parse stream-json output — find the result line
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'result' && parsed.result) {
            return resolve(parsed.result);
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      // Fallback: try to find assistant message
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'assistant') {
            const text = parsed.message?.content
              ?.filter((b: { type: string }) => b.type === 'text')
              ?.map((b: { text: string }) => b.text)
              ?.join('');
            if (text) return resolve(text);
          }
        } catch {
          // Skip
        }
      }

      reject(new Error('No result found in Claude CLI output'));
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      try { unlinkSync(tmpPromptPath); } catch { /* ignore */ }
      reject(new Error(`Claude CLI spawn error: ${err.message}`));
    });

    // Pipe the message JSON via stdin (avoids shell argument length limits)
    proc.stdin.write(message + '\n');
    proc.stdin.end();
  });
}

/**
 * Generate a template from a reference image using Claude Vision (CLI).
 */
export async function generateTemplateFromImage(
  refBase64: string,
  mediaType: string,
  prompt: string,
  width = 1080,
  height = 1080,
): Promise<TemplateDefinition> {
  const textPrompt = prompt
    ? `Design a social media post template (${width}x${height}) that matches the reference image above. Additional context: ${prompt}\n\nReturn ONLY the JSON template definition.`
    : `Design a social media post template (${width}x${height}) that matches the reference image above as closely as possible.\n\nReturn ONLY the JSON template definition.`;

  const contentBlocks: ContentBlock[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: refBase64 },
    },
    { type: 'text', text: textPrompt },
  ];

  console.log('[claude-cli] Generating template from image...');
  const result = await callClaudeCli(VISION_SYSTEM_PROMPT, contentBlocks);

  const parsed = parseJsonSafe(result);
  const validated = templateSchema.parse(parsed);

  console.log('[claude-cli] Template generated:', validated.id);
  return validated as TemplateDefinition;
}

/**
 * Iterate a template by comparing reference image to current preview (CLI).
 */
export async function iterateTemplateFromImage(
  refBase64: string,
  refMediaType: string,
  previewBase64: string,
  feedback: string,
  existingTemplate: TemplateDefinition,
): Promise<TemplateDefinition> {
  const textPrompt = `The first image is the REFERENCE design (target). The second image is the CURRENT preview from our template engine.

Current template JSON:
${JSON.stringify(existingTemplate, null, 2)}

Feedback to apply:
${feedback}

Analyze both images. Apply the feedback to make the template output match the reference more closely. Return the COMPLETE updated template JSON (all layers, not just changes).`;

  const contentBlocks: ContentBlock[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: refMediaType, data: refBase64 },
    },
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: previewBase64 },
    },
    { type: 'text', text: textPrompt },
  ];

  console.log('[claude-cli] Iterating template from image comparison...');
  const result = await callClaudeCli(VISION_SYSTEM_PROMPT, contentBlocks);

  const parsed = parseJsonSafe(result);
  const validated = templateSchema.parse(parsed);

  console.log('[claude-cli] Template iterated:', validated.id);
  return validated as TemplateDefinition;
}

/**
 * Compare reference image to current preview and rate similarity (CLI).
 */
export async function compareDesigns(
  refBase64: string,
  refMediaType: string,
  previewBase64: string,
  currentTemplate: TemplateDefinition,
): Promise<VisionCompareResponse> {
  const textPrompt = `${COMPARE_PROMPT}

For context, here is the current template JSON being used:
${JSON.stringify(currentTemplate, null, 2)}`;

  const contentBlocks: ContentBlock[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: refMediaType, data: refBase64 },
    },
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: previewBase64 },
    },
    { type: 'text', text: textPrompt },
  ];

  console.log('[claude-cli] Comparing designs...');
  const result = await callClaudeCli(VISION_SYSTEM_PROMPT, contentBlocks);

  const parsed = parseJsonSafe(result) as Record<string, unknown>;

  // Validate the compare response shape
  const score = typeof parsed.score === 'number' ? parsed.score : 5;
  const fb = typeof parsed.feedback === 'string' ? parsed.feedback : 'Unable to parse feedback';
  const shouldContinue = typeof parsed.shouldContinue === 'boolean' ? parsed.shouldContinue : score < 8;

  console.log(`[claude-cli] Compare result: score=${score}, shouldContinue=${shouldContinue}`);
  return { score, feedback: fb, shouldContinue };
}

/**
 * Combined compare + iterate in a single CLI call.
 * Claude sees both images, scores the match, and if score < target,
 * returns an updated template — all in one round trip.
 * Includes iteration history for context accumulation.
 */
export async function compareAndIterate(
  refBase64: string,
  refMediaType: string,
  previewBase64: string,
  existingTemplate: TemplateDefinition,
  iterationHistory: IterationHistoryEntry[],
  iterationNumber: number,
  maxIterations: number,
  plateauWarning: boolean,
): Promise<CompareAndIterateResponse> {
  // Determine refinement phase
  let phaseInstruction: string;
  if (iterationNumber <= 2) {
    phaseInstruction = `PHASE: LAYOUT & STRUCTURE (iterations 1-2)
Focus on getting the overall layout right: image placement and proportions, background treatment, major panel/section positions, number and arrangement of visual blocks. Don't worry about fine text sizing or color tweaks yet.`;
  } else if (iterationNumber <= 4) {
    phaseInstruction = `PHASE: TEXT & SPACING (iterations 3-4)
The layout structure should be mostly correct now. Focus on: text sizing, font weights, spacing between elements, padding from edges, color accuracy (especially {{primary_colour}}/{{secondary_colour}} usage), and proportions of CTA elements.`;
  } else {
    phaseInstruction = `PHASE: FINE-TUNING (iterations 5+)
The design should be close. Focus on subtle details: exact border radius values, opacity adjustments, precise coordinate tweaks (move elements by 5-20px), letter spacing, line height, shadow parameters, and any remaining color mismatches.`;
  }

  // Build history summary
  let historySection = '';
  if (iterationHistory.length > 0) {
    const historyLines = iterationHistory.map(h =>
      `  Iteration ${h.iteration}: score=${h.score}/10 | feedback: "${h.feedback}" | changes: "${h.changesApplied}"`
    ).join('\n');
    historySection = `\n## Iteration History (DO NOT repeat failed approaches)\n${historyLines}\n`;
  }

  // Plateau warning injection
  let plateauSection = '';
  if (plateauWarning) {
    plateauSection = `\n## PLATEAU WARNING
The score has NOT improved for 2+ consecutive iterations. Previous approaches are not working.
You MUST try a fundamentally different approach to the areas that aren't matching.
Consider: completely different coordinates, different layer ordering, removing/adding layers, different text layout strategy.\n`;
  }

  const textPrompt = `## Task
You are iteration ${iterationNumber} of ${maxIterations} in an auto-refinement loop.
Compare the REFERENCE image (first) to the CURRENT preview (second) from our template engine.
Score the similarity, then produce an improved template that gets closer to the reference.

${phaseInstruction}
${historySection}${plateauSection}
## Current Template JSON
${JSON.stringify(existingTemplate, null, 2)}

## Required Output
Return ONLY a single JSON object (no markdown, no explanation) with this exact structure:
{
  "score": <1-10 similarity score>,
  "feedback": "<specific differences you see between reference and preview>",
  "shouldContinue": <true if score < 8 and meaningful improvements are still possible>,
  "changesApplied": "<brief summary of what you changed in the template>",
  "template": { <COMPLETE updated template JSON - all fields, all layers> }
}

If the score is 8 or higher, you can set "template" to null and "shouldContinue" to false.
The template must be the FULL template definition, not a partial diff.`;

  const contentBlocks: ContentBlock[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: refMediaType, data: refBase64 },
    },
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: previewBase64 },
    },
    { type: 'text', text: textPrompt },
  ];

  console.log(`[claude-cli] Compare+iterate iteration ${iterationNumber}/${maxIterations}${plateauWarning ? ' (PLATEAU)' : ''}...`);

  // Try up to 2 attempts — retry on JSON parse failure
  let parsed: Record<string, unknown>;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callClaudeCli(VISION_SYSTEM_PROMPT, contentBlocks);
    try {
      parsed = parseJsonSafe(result) as Record<string, unknown>;
      break;
    } catch (parseErr) {
      if (attempt === 2) throw new Error(`JSON parse failed after 2 attempts: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      console.warn(`[claude-cli] Attempt ${attempt} JSON parse failed, retrying...`);
    }
  }
  parsed = parsed!;

  // Extract score and metadata
  const score = typeof parsed.score === 'number' ? parsed.score : 5;
  const feedback = typeof parsed.feedback === 'string' ? parsed.feedback : 'Unable to parse feedback';
  const shouldContinue = typeof parsed.shouldContinue === 'boolean' ? parsed.shouldContinue : score < 8;
  const changesApplied = typeof parsed.changesApplied === 'string' ? parsed.changesApplied : '';

  // Validate the template if provided
  let validatedTemplate: TemplateDefinition | undefined;
  if (parsed.template && shouldContinue) {
    try {
      validatedTemplate = templateSchema.parse(parsed.template) as TemplateDefinition;
    } catch (validationErr) {
      console.warn('[claude-cli] Template validation failed, using raw parsed:', validationErr);
      // Try to use it anyway — common issues are minor schema mismatches
      validatedTemplate = parsed.template as TemplateDefinition;
    }
  }

  console.log(`[claude-cli] Compare+iterate result: score=${score}, shouldContinue=${shouldContinue}, changes="${changesApplied}"`);
  return { score, feedback, shouldContinue, changesApplied, template: validatedTemplate };
}
