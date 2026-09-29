struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

// Uniform data is one flat f32 array. Index layout (see
// rust/crates/effects/src/uniforms.rs — must stay in sync):
//   0..2   key color RGB (sRGB, 0..1)
//   3      padding (unused)
//   4      tolerance (0..1, chroma distance below which the pixel is keyed out)
//   5      softness  (0..1, width of the falloff from keyed to opaque)
//   6      spill     (0..1, spill-suppression strength)
//   7      feather   (-1..1, signed matte choke: positive shrinks, negative grows)
const UNIFORM_LEN = 8;

struct ChromaKeyUniforms {
    data: array<f32, UNIFORM_LEN>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: ChromaKeyUniforms;

// Rec.601 luma, matching the YCbCr chroma-space the key operates in.
const LUMA: vec3f = vec3f(0.299, 0.587, 0.114);

fn rgb_to_cb_cr(rgb: vec3f) -> vec2f {
    let y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    let cb = (rgb.b - y) / 1.772 + 0.5;
    let cr = (rgb.r - y) / 1.402 + 0.5;
    return vec2f(cb, cr);
}

fn chroma_alpha(distance: f32) -> f32 {
    let tolerance = uniforms.data[4];
    let softness = uniforms.data[5];
    let edge = max(softness, 0.0001);
    let t = clamp((distance - tolerance) / edge, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

fn apply_feather(alpha: f32) -> f32 {
    let feather = clamp(uniforms.data[7], -0.9, 0.9);
    return clamp((alpha - feather) / (1.0 - feather), 0.0, 1.0);
}

fn suppress_spill(rgb: vec3f, alpha: f32) -> vec3f {
    let spill = clamp(uniforms.data[6], 0.0, 1.0);
    let luma = dot(rgb, LUMA);
    let amount = spill * (1.0 - alpha);
    return mix(rgb, vec3f(luma), amount);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let color = textureSample(input_texture, input_sampler, input.tex_coord);
    let rgb = color.rgb;
    let key_rgb = vec3f(uniforms.data[0], uniforms.data[1], uniforms.data[2]);

    let cbcr = rgb_to_cb_cr(rgb);
    let key_cbcr = rgb_to_cb_cr(key_rgb);
    let distance = length(cbcr - key_cbcr);

    let base = chroma_alpha(distance);
    let alpha = apply_feather(base);
    let suppressed = suppress_spill(rgb, alpha);

    return vec4f(suppressed, alpha * color.a);
}
