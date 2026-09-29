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

// data[2] = amount (0..1), data[3] = angle (degrees)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let amount = u(2);
    let angle = radians(u(3));
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));
    let dir = vec2f(cos(angle), sin(angle)) * amount * 0.04;

    let r = textureSample(input_texture, input_sampler, clamp(input.tex_coord + dir * texel, vec2f(0.0), vec2f(1.0))).r;
    let g = textureSample(input_texture, input_sampler, clamp(input.tex_coord, vec2f(0.0), vec2f(1.0))).g;
    let b = textureSample(input_texture, input_sampler, clamp(input.tex_coord - dir * texel, vec2f(0.0), vec2f(1.0))).b;
    let a = textureSample(input_texture, input_sampler, clamp(input.tex_coord, vec2f(0.0), vec2f(1.0))).a;

    return vec4f(r, g, b, a);
}
