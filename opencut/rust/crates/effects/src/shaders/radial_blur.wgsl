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

// data[2] = strength (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let strength = u(2);
    let center = vec2f(0.5, 0.5);
    let dir = input.tex_coord - center;

    const SAMPLES = 16;
    var color = vec4f(0.0);
    for (var i = 0; i < SAMPLES; i = i + 1) {
        let t = (f32(i) / f32(SAMPLES - 1)) - 0.5;
        let ang = t * strength * 0.5;
        let c = cos(ang);
        let s = sin(ang);
        let rotated = vec2f(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
        color = color + textureSample(input_texture, input_sampler, clamp(center + rotated, vec2f(0.0), vec2f(1.0)));
    }
    return color / f32(SAMPLES);
}
