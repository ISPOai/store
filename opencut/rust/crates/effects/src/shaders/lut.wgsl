struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

// Uniform layout (see rust/crates/effects/src/uniforms.rs — must stay in sync):
//   strength   (0..1) LUT mix weight
//   lut_size   LUT_3D_SIZE (N)
//   domain_min input domain minimum
//   domain_max input domain maximum
struct LutUniforms {
    strength: f32,
    lut_size: f32,
    domain_min: f32,
    domain_max: f32,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: LutUniforms;
@group(2) @binding(0) var lut_texture: texture_3d<f32>;
@group(2) @binding(1) var lut_sampler: sampler;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let color = textureSample(input_texture, input_sampler, input.tex_coord);
    let rgb = color.rgb;

    let domain_span = max(uniforms.domain_max - uniforms.domain_min, 1e-6);
    let coord = clamp((rgb - uniforms.domain_min) / domain_span, vec3f(0.0), vec3f(1.0));
    let size = max(uniforms.lut_size, 1.0);
    // Map [0,1] to the LUT lattice texel centers so trilinear interpolation
    // spans the actual stored entries.
    let lut_coord = (coord * (size - 1.0) + vec3f(0.5)) / size;
    let lut_color = textureSample(lut_texture, lut_sampler, lut_coord);

    let result = mix(rgb, lut_color.rgb, uniforms.strength);
    return vec4f(result, color.a);
}
