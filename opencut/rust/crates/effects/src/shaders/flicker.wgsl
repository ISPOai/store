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

// data[2] = intensity (0..1), data[3] = speed (Hz), data[4] = time (s)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = u(2);
    let speed = max(u(3), 0.0001);
    let time = u(4);
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let phase = floor(time * speed);
    let n = hash1(phase);
    let flicker = 1.0 - (n - 0.5) * intensity;

    return vec4f(clamp(color.rgb * flicker, vec3f(0.0), vec3f(1.0)), color.a);
}
