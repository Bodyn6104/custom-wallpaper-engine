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

  // The harness no longer injects `uniform <type> u_<name>;` declarations, so the
  // model has to declare them itself or the shader won't compile at all.
  it('tells the model to declare each param as a u_<name> uniform itself', async () => {
    const fake = fakeAnthropicClient({
      shaderCode: 'void main(){}',
      params: [],
      suggestedTitle: 'T',
      isAnimated: true,
    });
    await new AnthropicShaderClient(fake).requestShader('a nebula');
    const system = fake.messages.create.mock.calls[0][0].system;
    expect(system).toContain('u_');
    expect(system).toMatch(/declare/i);
  });

  it('throws a clear error when the response was truncated instead of returning partial fields', async () => {
    const fake = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'max_tokens',
          content: [{ type: 'tool_use', name: 'emit_wallpaper_shader', input: { shaderCode: 'void main(){' } }],
        }),
      },
    } as any;
    await expect(new AnthropicShaderClient(fake).requestShader('a nebula')).rejects.toThrow(/truncated/i);
  });

  // Without this, a malformed tool response propagates `undefined` into
  // livelyPackage.ts's params.map and crashes in the main process instead.
  it('rejects a tool response whose params are missing', async () => {
    const fake = fakeAnthropicClient({ shaderCode: 'void main(){}', suggestedTitle: 'T', isAnimated: true });
    await expect(new AnthropicShaderClient(fake).requestShader('a nebula')).rejects.toThrow(/params/i);
  });

  it('rejects a tool response whose shaderCode is not a string', async () => {
    const fake = fakeAnthropicClient({ shaderCode: 42, params: [], suggestedTitle: 'T', isAnimated: true });
    await expect(new AnthropicShaderClient(fake).requestShader('a nebula')).rejects.toThrow(/shaderCode/i);
  });

  // Param names are interpolated into the generated wallpaper page's JavaScript,
  // and Lively additionally requires a lowercase-first identifier.
  it('rejects a param name that is not a plain lowercase-first identifier', async () => {
    const fake = fakeAnthropicClient({
      shaderCode: 'void main(){}',
      params: [{ name: "x'];alert(1);//", type: 'float', default: 1, label: 'Bad' }],
      suggestedTitle: 'T',
      isAnimated: true,
    });
    await expect(new AnthropicShaderClient(fake).requestShader('a nebula')).rejects.toThrow(/param name/i);
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
