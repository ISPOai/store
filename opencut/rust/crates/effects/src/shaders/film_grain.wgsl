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

fn hash2(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

// data[2] = amount (0..1), data[3] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let amount = u(2);
    let time = u(3);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let cell = input.tex_coord * vec2f(u(0), u(1));
    let n = hash2(cell + vec2f(time * 37.0, time * 17.0));
    let grain = (n - 0.5) * amount;

    return vec4f(clamp(color.rgb + vec3f(grain), vec3f(0.0), vec3f(1.0)), color.a);
}
