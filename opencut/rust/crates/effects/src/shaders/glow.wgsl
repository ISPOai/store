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

const PI: f32 = 3.141592653589793;

fn u(index: i32) -> f32 {
    return uniforms.data[index];
}

// data[2] = intensity (0..1), data[3] = threshold (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let intensity = u(2);
    let threshold = u(3);
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));
    let base = textureSample(input_texture, input_sampler, input.tex_coord);

    let bright = max(base.rgb - vec3f(threshold), vec3f(0.0));

    const SAMPLES = 8;
    let radius = intensity * 16.0;
    var glow = vec3f(0.0);
    for (var i = 0; i < SAMPLES; i = i + 1) {
        let ang = (2.0 * PI * f32(i)) / f32(SAMPLES);
        let dir = vec2f(cos(ang), sin(ang)) * radius;
        let sample = textureSample(input_texture, input_sampler, clamp(input.tex_coord + dir * texel, vec2f(0.0), vec2f(1.0)));
        glow = glow + max(sample.rgb - vec3f(threshold), vec3f(0.0));
    }
    glow = glow / f32(SAMPLES);

    let rgb = base.rgb + bright * 0.5 + glow * intensity * 2.0;
    return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), base.a);
}
