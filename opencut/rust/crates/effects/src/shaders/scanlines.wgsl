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

// data[2] = spacing (px), data[3] = opacity (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let spacing = max(u(2), 1.0);
    let opacity = u(3);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let line = f32(i32(floor(input.tex_coord.y * u(1) / spacing)));
    let darken = select(0.0, opacity, line % 2.0 < 1.0);

    return vec4f(color.rgb * (1.0 - darken), color.a);
}
