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

// data[2] = pixel size (px)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let size = max(u(2), 1.0);
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));
    let uv = input.tex_coord - (input.tex_coord % (texel * size)) + texel * size * 0.5;
    return textureSample(input_texture, input_sampler, clamp(uv, vec2f(0.0), vec2f(1.0)));
}
