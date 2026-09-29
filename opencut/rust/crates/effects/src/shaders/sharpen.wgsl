struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    data: array<f32, 64>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

fn u(index: i32) -> f32 {
    return uniforms.data[index];
}

// data[2] = amount (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let amount = u(2);
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));

    let center = textureSample(input_texture, input_sampler, input.tex_coord);
    let top = textureSample(input_texture, input_sampler, input.tex_coord + vec2f(0.0, texel.y));
    let bottom = textureSample(input_texture, input_sampler, input.tex_coord - vec2f(0.0, texel.y));
    let left = textureSample(input_texture, input_sampler, input.tex_coord - vec2f(texel.x, 0.0));
    let right = textureSample(input_texture, input_sampler, input.tex_coord + vec2f(texel.x, 0.0));

    let blurred = (top + bottom + left + right) * 0.25;
    let sharpened = center + (center - blurred) * amount;
    return vec4f(sharpened.rgb, center.a);
}
