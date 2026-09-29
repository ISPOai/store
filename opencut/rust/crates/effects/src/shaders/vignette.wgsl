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

// data[2] = strength (0..1), data[3] = softness (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let strength = u(2);
    let softness = u(3);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let center = vec2f(0.5, 0.5);
    let dist = length(input.tex_coord - center);
    let inner = 0.35 + 0.4 * (1.0 - softness);
    let amount = smoothstep(inner, 1.1, dist) * strength;
    let darkened = color.rgb * (1.0 - amount);

    return vec4f(darkened, color.a);
}
