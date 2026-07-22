import { describe, it, expect, vi } from 'vitest';
import { AnthropicShaderClient } from '../../src/core/generation/claudeClient';

function fakeAnthropicClient(toolInput: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'emit_wallpaper_shader', input: toolInput }],
      }),
    },
  } as any;
}

describe('AnthropicShaderClient', () => {
  it('parses a tool_use response into a GenerationResult', async () => {
    const fake = fakeAnthropicClient({
      shaderCode: 'void main(){}',
      params: [{ name: 'speed', type: 'float', default: 1, label: 'Speed' }],
      suggestedTitle: 'Nebula',
      isAnimated: true,
    });
    const client = new AnthropicShaderClient(fake);
    const result = await client.requestShader('a nebula');
    expect(result.shaderCode).toBe('void main(){}');
    expect(result.suggestedTitle).toBe('Nebula');
    expect(fake.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ tool_choice: { type: 'tool', name: 'emit_wallpaper_shader' } })
    );
  });

  it('throws if Claude does not return a tool_use block', async () => {
    const fake = {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'oops' }] }) },
    } as any;
    const client = new AnthropicShaderClient(fake);
    await expect(client.requestShader('a nebula')).rejects.toThrow('did not return a tool_use block');
  });

  it('includes the compile error in the message when retrying', async () => {
    const fake = fakeAnthropicClient({
      shaderCode: 'void main(){}',
      params: [],
      suggestedTitle: 'Fixed',
      isAnimated: true,
    });
    const client = new AnthropicShaderClient(fake);
    await client.requestShader('a nebula', 'void main() { broken }', 'syntax error at broken');
    const callArgs = fake.messages.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('syntax error at broken');
  });
});
