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
  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr);
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

  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr);
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
