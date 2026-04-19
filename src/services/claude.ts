import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { templateSchema } from '../templates/schema.js';
import type { TemplateDefinition } from '../types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `You are a reel template designer for a custom rendering engine.
You create JSON template definitions for MP4 social reels only.

## Template Rules
1. Every template must set "outputFormat": "mp4".
2. Default canvas is 1080x1920 unless the user explicitly asks for another 9:16 reel size.
3. Use multiple frames with durationMs values.
4. Include fps and transition metadata.
5. Use only these layer types: rect, image, text, logo, accent_bar, cta_image, asset_image.
6. Use "Inter" for all text layers.
7. Use {{primary_colour}} and {{secondary_colour}} for brand-colored elements.
8. Keep output professional, readable, and suitable for home-service reel slideshows.
9. Optimize for what the rendered MP4 visibly shows, not just for valid JSON.
10. The renderer draws the background first and then each layer in array order. If a text card is required, the rect layer must come before the text layer in that frame.
11. Opening frames must prioritize readability: stable logo placement, strong headline contrast, and dedicated cards or bands that survive real photo crops.
12. Avoid weak translucent overlays, low-contrast headline text, or title placement too close to the bottom edge.

## Variables
- {{title}}
- {{post_title}}
- {{subtitle}}
- {{body}}
- {{post_body}}
- {{phone}}
- {{phone_display}}
- {{service_areas}}
- {{company_name}}
- {{business_name}}
- {{website}}
- {{primary_colour}}
- {{secondary_colour}}
- {{logo_url}}
- {{square_logo_url}}

## Output
Return ONLY valid JSON. No markdown. No explanation.
The JSON must be a complete MP4 template definition.`;

export async function generateTemplate(
  prompt: string,
  width = 1080,
  height = 1920,
): Promise<TemplateDefinition> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Design a vertical MP4 social reel template (${width}x${height}) based on this description:\n\n${prompt}\n\nFavor a strong opening frame: if the design uses both logo and headline, keep the logo in a stable top zone and place the headline in a high-contrast card or band that will remain unmistakably visible in the real rendered MP4.\n\nReturn ONLY the JSON template definition. It must output MP4.`,
      },
    ],
  });

  const parsed = parseJsonSafe(extractResponseText(response));
  return templateSchema.parse(parsed) as TemplateDefinition;
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
        content: `Here is an existing MP4 reel template:\n\n${JSON.stringify(existingTemplate, null, 2)}\n\nModify it based on this feedback:\n\n${prompt}\n\nPreserve MP4 reel output, vertical layout, multi-frame structure, fps, and transitions. Optimize for real rendered MP4 visibility, especially on frame 1. If a title is present but visually weak, strengthen the card, contrast, placement, and layer order rather than merely re-adding the variable.\n\nReturn the COMPLETE updated JSON template definition.`,
      },
    ],
  });

  const parsed = parseJsonSafe(extractResponseText(response));
  return templateSchema.parse(parsed) as TemplateDefinition;
}

function extractResponseText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}

function repairJson(jsonStr: string): string {
  let s = jsonStr.trim();
  s = s.replace(/,\s*([\]}])/g, '$1');

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

  if (inString) {
    s += '"';
  }

  s = s.replace(/,\s*$/, '');

  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }

  return s;
}

function parseJsonSafe(text: string): unknown {
  const jsonStr = extractJson(text);

  try {
    return JSON.parse(jsonStr);
  } catch {
    const repaired = repairJson(jsonStr);
    return JSON.parse(repaired);
  }
}
