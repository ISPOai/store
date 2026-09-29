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

fn luma(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

// data[2] = strength (0..1)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let strength = u(2);
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));
    let base = textureSample(input_texture, input_sampler, input.tex_coord);

    let tl = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(-texel.x, texel.y)).rgb);
    let t = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(0.0, texel.y)).rgb);
    let tr = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(texel.x, texel.y)).rgb);
    let l = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(-texel.x, 0.0)).rgb);
    let r = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(texel.x, 0.0)).rgb);
    let bl = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(-texel.x, -texel.y)).rgb);
    let b = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(0.0, -texel.y)).rgb);
    let br = luma(textureSample(input_texture, input_sampler, input.tex_coord + vec2f(texel.x, -texel.y)).rgb);

    let gx = -tl + tr - 2.0 * l + 2.0 * r - bl + br;
    let gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;
    let edge = sqrt(gx * gx + gy * gy);

    let neon = edge * vec3f(0.1, 0.9, 1.0);
    let blend = clamp(edge * strength * 4.0, 0.0, 1.0);
    let rgb = mix(base.rgb, neon, blend);

    return vec4f(rgb, base.a);
}
