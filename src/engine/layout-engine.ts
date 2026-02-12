import type { RenderVariables } from '../types.js';

/**
 * Replace {{variable}} placeholders in a string with actual values
 */
export function resolveVariables(
  text: string,
  variables: RenderVariables
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (variables as unknown as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return '';
  });
}

/**
 * Build a flat variables map for color resolution
 */
export function buildColorVariables(
  variables: RenderVariables
): Record<string, string> {
  return {
    primary_colour: variables.primary_colour || '#235BAA',
    secondary_colour: variables.secondary_colour || '#FFFFFF',
    primary_color: variables.primary_colour || '#235BAA',
    secondary_color: variables.secondary_colour || '#FFFFFF',
  };
}
