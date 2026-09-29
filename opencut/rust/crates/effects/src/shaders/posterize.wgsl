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

// data[2] = levels
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let levels = max(u(2), 2.0);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let quantized = floor(color.rgb * levels) / (levels - 1.0);
    return vec4f(clamp(quantized, vec3f(0.0), vec3f(1.0)), color.a);
}
