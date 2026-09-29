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
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let inverted = vec3f(1.0) - color.rgb;
    return vec4f(mix(color.rgb, inverted, amount), color.a);
}
