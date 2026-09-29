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

// data[2] = blur (0..1), data[3] = focus center y (0..1), data[4] = band height (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let blur = u(2);
    let focus_y = u(3);
    let band = clamp(u(4), 0.01, 1.0);
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));

    let dist = abs(input.tex_coord.y - focus_y);
    let mask = smoothstep(band * 0.5, band, dist);
    let sigma = blur * 24.0 * mask;

    const SAMPLES = 15;
    var color = vec4f(0.0);
    var weight = 0.0;
    for (var i = 0; i < SAMPLES; i = i + 1) {
        let t = (f32(i) / f32(SAMPLES - 1)) - 0.5;
        let offset = t * sigma;
        let w = exp(-0.5 * offset * offset / max(sigma * sigma, 0.0001));
        let uv = clamp(input.tex_coord + vec2f(0.0, offset * texel.y), vec2f(0.0), vec2f(1.0));
        color = color + textureSample(input_texture, input_sampler, uv) * w;
        weight = weight + w;
    }
    return color / max(weight, 0.0001);
}
