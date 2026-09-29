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

fn hash1(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453123);
}

// data[2] = intensity (0..1), data[3] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = u(2);
    let time = u(3);
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));

    let jx = (hash1(floor(time * 30.0)) - 0.5) * intensity * 0.1;
    let jy = (hash1(floor(time * 30.0) + 11.0) - 0.5) * intensity * 0.1;

    let uv = clamp(input.tex_coord + vec2f(jx, jy) * texel, vec2f(0.0), vec2f(1.0));
    return textureSample(input_texture, input_sampler, uv);
}
