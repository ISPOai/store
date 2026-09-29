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

fn luma(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

// data[2] = dot size (px), data[3] = angle (degrees)
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let size = max(u(2), 1.0);
    let angle = radians(u(3));
    let texel = vec2f(1.0, 1.0) / vec2f(u(0), u(1));
    let color = textureSample(input_texture, input_sampler, input.tex_coord);

    let c = cos(angle);
    let s = sin(angle);
    let rotated = vec2f(input.tex_coord.x * c - input.tex_coord.y * s, input.tex_coord.x * s + input.tex_coord.y * c);

    let spacing = texel * size;
    let cell = floor(rotated / spacing);
    let local = (rotated % spacing) / spacing - vec2f(0.5);

    let value = 1.0 - luma(color.rgb);
    let dot_radius = sqrt(value) * 0.5;
    let inside = length(local) <= dot_radius;

    return vec4f(select(vec3f(0.0), vec3f(1.0), inside), color.a);
}
